// Case studies shown on the Get Listed tab. Written by the team in the admin panel (public.case_studies);
// the app lists the published ones. FALLBACK is the one case study the app carried before the table existed,
// used only when the list cannot be loaded at all (an older backend, or offline with nothing cached), so the
// section never shows an error. An empty table shows nothing: the team chose to publish none.
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export interface CaseHighlight {
  label: string;
  value: string;
}

export interface CaseStudy {
  id: string;
  slug: string;
  title: string;
  exchange: string | null;
  listingYear: number | null;
  city: string | null;
  summary: string;
  body: string | null;
  highlights: CaseHighlight[];
  heroImageUrl: string | null;
  ipoId: string | null;
}

export const FALLBACK_CASE_STUDY: CaseStudy = {
  id: "bundled-aaron-industries",
  slug: "aaron-industries",
  title: "Aaron Industries",
  exchange: "NSE Emerge",
  listingYear: 2018,
  city: "Surat",
  summary: "A Surat elevator manufacturer listed in 2018 with a ₹4.9 Cr issue at ₹38 a share. Revenue has since grown from about ₹9 Cr to over ₹75 Cr, and the stock has multiplied many times over.",
  body: null,
  highlights: [],
  heroImageUrl: null,
  ipoId: null,
};

const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** A database row → CaseStudy, or null when it lacks the fields a card needs. Unknown fields are ignored. */
export function parseCaseStudy(r: Record<string, unknown>): CaseStudy | null {
  const id = str(r.id, 64);
  const slug = str(r.slug, 80);
  const title = str(r.title, 140);
  const summary = str(r.summary, 400);
  if (!id || !slug || !title || !summary) return null;
  const year = typeof r.listing_year === "number" && Number.isInteger(r.listing_year) ? r.listing_year : null;
  const highlights = Array.isArray(r.highlights)
    ? (r.highlights as unknown[])
        .map((h) => (h && typeof h === "object" ? { label: str((h as { label?: unknown }).label, 40), value: str((h as { value?: unknown }).value, 60) } : { label: null, value: null }))
        .filter((h): h is CaseHighlight => Boolean(h.label && h.value))
        .slice(0, 8)
    : [];
  const image = str(r.hero_image_url, 600);
  return { id, slug, title, exchange: str(r.exchange, 40), listingYear: year, city: str(r.city, 80), summary, body: str(r.body, 12000), highlights, heroImageUrl: image && /^https:\/\//.test(image) ? image : null, ipoId: str(r.ipo_id, 64) };
}

/** "NSE Emerge · 2018 · Surat" */
export function caseStudyMeta(c: Pick<CaseStudy, "exchange" | "listingYear" | "city">): string {
  return [c.exchange, c.listingYear ? String(c.listingYear) : null, c.city].filter(Boolean).join(" · ");
}

/** Long-form text → paragraphs (the admin panel saves plain text with blank lines between them). */
export function caseStudyParagraphs(body: string | null | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** What to show given the result of loading the list. */
export function casesToShow(loaded: CaseStudy[] | undefined, failed: boolean): CaseStudy[] {
  if (loaded) return loaded;
  return failed ? [FALLBACK_CASE_STUDY] : [];
}

async function fetchCaseStudies(): Promise<CaseStudy[]> {
  // RLS returns published rows only; the status filter is kept so a signed-in admin sees what users see.
  const { data, error } = await supabase.from("case_studies").select("id, slug, title, exchange, listing_year, city, summary, body, highlights, hero_image_url, ipo_id").eq("status", "published").order("sort_order").order("published_at", { ascending: false }).limit(50);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(parseCaseStudy).filter((c): c is CaseStudy => c !== null);
}

export function useCaseStudies(): { cases: CaseStudy[]; loading: boolean } {
  const q = useQuery({ queryKey: ["case-studies"], queryFn: fetchCaseStudies, staleTime: 15 * 60 * 1000, retry: 1 });
  return { cases: casesToShow(q.data, q.isError), loading: q.isLoading };
}
