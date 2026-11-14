// POST /api/insights/generate { ipo_id } → an AI-written first draft of the business insight for that IPO.
//
// Any signed-in admin (editor or super admin) may call it: the RLS-scoped client only returns an
// admin_users row to admins. Two Gemini calls: (1) research the company with Google Search grounding,
// (2) turn the notes into the exact insight fields as JSON (grounding and JSON mode cannot share a request).
// Nothing is written to the database; the editor decides what to keep and the admin still publishes by hand.
import { NextResponse, type NextRequest } from "next/server";

import { crore, dateRange } from "@/lib/format";
import { gemini, GeminiNotConfiguredError, parseJsonObject } from "@/lib/gemini";
import { discoverMedia, isAggregator, type DiscoveredMedia } from "@/lib/media-discovery";
import { supabaseServer } from "@/lib/supabase/server";
import { IPO_LIST_COLUMNS, type Highlight, type IpoRow, type Verdict } from "@/lib/types";

export const maxDuration = 120;

export interface GeneratedInsight {
  headline: string | null;
  summary: string | null;
  company_story: string | null;
  founder_story: string | null;
  listing_journey: string | null;
  lessons: string | null;
  location_city: string | null;
  location_state: string | null;
  founded_year: number | null;
  employees: string | null;
  sector: string | null;
  verdict: Verdict | null;
  verdict_note: string | null;
  takeaways: string[];
  highlights: Highlight[];
}

export interface GenerateResponse {
  draft: GeneratedInsight;
  sources: { title: string; url: string }[];
  model: string;
  grounded: boolean;
  /** Why web research was skipped, when `grounded` is false. */
  research_error: string | null;
  /** Verified photos and YouTube videos the admin can pick from. */
  media: DiscoveredMedia;
  /** The company's own website, from the feed or from research. */
  website: string | null;
}
export type { MediaImage, MediaVideo } from "@/lib/media-discovery";

const VERDICTS: Verdict[] = ["positive", "neutral", "cautious"];

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One line under 90 characters. What is remarkable about this listing." },
    summary: { type: "string", description: "Two or three sentences for the card." },
    company_story: { type: "string", description: "What they make or do, who buys it, how the money is made. Two to four short paragraphs separated by blank lines." },
    founder_story: { type: "string", description: "The promoter's journey: where they started, the turning points, the people involved. Two to four short paragraphs." },
    listing_journey: { type: "string", description: "How they went from a private company to listed: audits, restructuring, merchant banker, DRHP, SEBI/exchange approval, the issue. Two to four short paragraphs." },
    lessons: { type: "string", description: "One paragraph on what a promoter can learn." },
    location_city: { type: "string" },
    location_state: { type: "string" },
    founded_year: { type: "integer" },
    employees: { type: "string", description: "e.g. 'About 180 people'. Empty if unknown." },
    sector: { type: "string", description: "Two to four words." },
    verdict: { type: "string", enum: ["positive", "neutral", "cautious"] },
    verdict_note: { type: "string", description: "One paragraph explaining the verdict in plain words. Never use buy, sell, subscribe or avoid." },
    takeaways: { type: "array", items: { type: "string" }, description: "Three to five bullets for a business owner reading on a phone." },
    highlights: {
      type: "array",
      description: "Four to six short label/value pairs, e.g. {label:'FY24 revenue', value:'₹62 Cr'}.",
      items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] },
    },
    website: { type: "string", description: "The company's own official website URL (not an IPO portal, exchange or news site). Empty if unknown." },
    video_urls: { type: "array", items: { type: "string" }, description: "Exact YouTube URLs from the research notes (founder interviews, listing ceremony, factory tour). Empty if none were found." },
    image_urls: { type: "array", items: { type: "string" }, description: "Exact image URLs from the research notes (promoter photos, factory, products). Empty if none were found." },
  },
  required: ["headline", "summary", "company_story", "founder_story", "listing_journey", "lessons", "takeaways", "highlights", "verdict", "verdict_note"],
};

const SYSTEM = `You write "Business insights" for Be IPO Ready, an app by an IPO advisory firm in Surat, India. Each insight tells
business owners (promoters of small and mid-size Indian companies) how a company got listed on NSE/BSE (Mainboard or SME).
Audience: a promoter reading on a phone. Tone: plain, concrete, warm, Indian English. Short sentences. No hype, no jargon
without a plain-words gloss. Use ₹ and crore. Never give investment advice; never use the words buy, sell, subscribe or avoid.
Facts: state only what the provided data or your research supports. If something is unknown, leave the field empty or say
"not disclosed" rather than inventing names, dates or figures.`;

function facts(ipo: IpoRow): string {
  const lines = [
    `Company: ${ipo.display_name ?? ipo.name}`,
    `Board: ${ipo.board === "sme" ? `SME (${ipo.sub_type ?? "SME"})` : "Mainboard"}`,
    `Status: ${ipo.status}`,
    `Issue dates: ${ipo.dates_tba ? "TBA" : dateRange(ipo.open_date, ipo.close_date)}`,
    ipo.listing_date ? `Listing date: ${ipo.listing_date}` : null,
    ipo.price_band ? `Price band: ₹${ipo.price_band}` : null,
    ipo.issue_price ? `Issue price: ₹${ipo.issue_price}` : null,
    ipo.issue_size_cr ? `Issue size: ${crore(ipo.issue_size_cr)}` : null,
    ipo.lot_size ? `Lot size: ${ipo.lot_size} shares` : null,
    ipo.sub_total ? `Total subscription: ${ipo.sub_total}x` : null,
    ipo.listing_price ? `Listing price: ₹${ipo.listing_price}` : null,
    ipo.listing_gain_percent !== null ? `Listing gain: ${ipo.listing_gain_percent}%` : null,
    ipo.promoters_text ? `Promoters: ${ipo.promoters_text}` : null,
    ipo.web_url ? `Website: ${ipo.web_url}` : null,
    ipo.about ? `About (from the IPO feed): ${ipo.about}` : null,
    ipo.description ? `Description (from the IPO feed): ${ipo.description}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

function clean(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t && !/^(unknown|n\/a|not disclosed|null)$/i.test(t) ? t : null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { data: adminRow } = await supabase.from("admin_users").select("role").eq("user_id", auth.user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { ipo_id?: string };
    if (!body.ipo_id) return NextResponse.json({ error: "ipo_id is required." }, { status: 400 });
    const { data: ipo, error } = await supabase.from("ipos").select(IPO_LIST_COLUMNS).eq("id", body.ipo_id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ipo) return NextResponse.json({ error: "IPO not found." }, { status: 404 });
    const row = ipo as IpoRow;
    const known = facts(row);

    // Step 1: research with Google Search. If grounding is unavailable for this key, fall back to the feed data alone.
    let notes = "";
    let sources: { title: string; url: string }[] = [];
    let grounded = false;
    let researchError: string | null = null;
    // Free-tier search grounding occasionally returns a transient 429/empty answer: one retry after a short pause.
    const withRetry = async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof GeminiNotConfiguredError) throw e;
        await new Promise((r) => setTimeout(r, 2500));
        return fn();
      }
    };
    try {
      const research = await withRetry(() => gemini({
        system: SYSTEM,
        search: true,
        temperature: 0.2,
        maxOutputTokens: 3000,
        prompt: `Research this Indian company and its IPO. Use the DRHP/RHP, exchange filings, the company website and
reputable business press. Write detailed research notes (plain text, with the source next to each fact) covering:
1. What the business does, products, customers, how it earns, key financials for the last 2-3 years (revenue, PAT, margins, debt).
2. The founders/promoters: background, how and when the company started, turning points, family or key people.
3. The listing journey: when they decided to list, merchant banker, DRHP filing, SEBI/exchange approval, issue details, subscription, listing day.
4. Head office city and state, founding year, employee count, sector, and the company's own official website URL.
5. Strengths, risks and what a promoter of a similar company could learn.
6. Media: exact YouTube URLs of founder interviews, the listing ceremony or factory tours, and exact URLs of photos of the
   promoters or the business (company website management/about page, press). Only URLs you actually saw on a page.
Say "not found" for anything you could not verify.

Known data from our IPO feed:
${known}`,
      }));
      notes = research.text;
      sources = research.sources;
      grounded = true;
    } catch (e) {
      if (e instanceof GeminiNotConfiguredError) throw e;
      researchError = e instanceof Error ? e.message : "unknown error";
      console.warn("[insights/generate] research step failed:", researchError);
      notes = `(Web research was unavailable: ${researchError}. Use only the feed data.)`;
    }

    // Step 2: structure into the insight fields.
    const structured = await gemini({
      system: SYSTEM,
      jsonSchema: SCHEMA,
      temperature: 0.5,
      maxOutputTokens: 6000,
      prompt: `Write the Business insight for ${row.display_name ?? row.name} as JSON matching the schema.
Fill every text field with real content from the notes and feed data below. Leave location/founded_year/employees empty if unknown.
Pick the verdict for a promoter audience: "positive" if the listing went well and the company looks well run, "cautious" if
there are clear risks (weak subscription, listing loss, governance questions), else "neutral".

Feed data:
${known}

Research notes:
${notes}`,
    });
    const raw = parseJsonObject<Partial<GeneratedInsight> & { founded_year?: unknown; takeaways?: unknown; highlights?: unknown; verdict?: unknown; video_urls?: unknown; image_urls?: unknown; website?: unknown }>(structured.text);
    const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

    const year = typeof raw.founded_year === "number" ? raw.founded_year : typeof raw.founded_year === "string" ? Number(raw.founded_year) : NaN;
    const draft: GeneratedInsight = {
      headline: clean(raw.headline)?.slice(0, 120) ?? null,
      summary: clean(raw.summary),
      company_story: clean(raw.company_story),
      founder_story: clean(raw.founder_story),
      listing_journey: clean(raw.listing_journey),
      lessons: clean(raw.lessons),
      location_city: clean(raw.location_city),
      location_state: clean(raw.location_state),
      founded_year: Number.isInteger(year) && year >= 1800 && year <= 2100 ? year : null,
      employees: clean(raw.employees),
      sector: clean(raw.sector),
      verdict: VERDICTS.includes(raw.verdict as Verdict) ? (raw.verdict as Verdict) : null,
      verdict_note: clean(raw.verdict_note),
      takeaways: Array.isArray(raw.takeaways) ? raw.takeaways.map(clean).filter((t): t is string => Boolean(t)).slice(0, 6) : [],
      highlights: Array.isArray(raw.highlights)
        ? (raw.highlights as Partial<Highlight>[])
            .map((h) => ({ label: clean(h?.label) ?? "", value: clean(h?.value) ?? "" }))
            .filter((h) => h.label && h.value)
            .slice(0, 8)
        : [],
    };

    // Step 3: real photos and videos from the company site, the press pages above, and anything Gemini quoted.
    let media: DiscoveredMedia = { images: [], videos: [] };
    try {
      media = await discoverMedia({ companyName: row.display_name ?? row.name, website: row.web_url, websiteHint: clean(raw.website), sourcePages: sources.map((s) => s.url), hintedImages: strings(raw.image_urls), hintedVideos: strings(raw.video_urls) });
    } catch {
      // media is a bonus; never fail the text draft because a website was slow
    }

    const feedSite = row.web_url && !isAggregator(row.web_url) ? row.web_url : null;
    const response: GenerateResponse = { draft, sources, model: structured.model, grounded, research_error: researchError, media, website: feedSite ?? clean(raw.website) };
    return NextResponse.json(response);
  } catch (e) {
    if (e instanceof GeminiNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
