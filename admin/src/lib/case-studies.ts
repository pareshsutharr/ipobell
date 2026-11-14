// Case studies (public.case_studies): types, slugs and the checks applied before saving. Pure functions,
// unit-tested with node --test. The database enforces the same limits (20261114001300_case_studies.sql).

export const EXCHANGES = ["NSE Emerge", "BSE SME", "Mainboard"] as const;
export type Exchange = (typeof EXCHANGES)[number];

export interface CaseHighlight {
  label: string;
  value: string;
}

export interface CaseStudyRow {
  id: string;
  slug: string;
  status: "draft" | "published";
  title: string;
  exchange: Exchange | null;
  listing_year: number | null;
  city: string | null;
  summary: string;
  body: string | null;
  highlights: CaseHighlight[];
  hero_image_url: string | null;
  ipo_id: string | null;
  sort_order: number;
  published_at: string | null;
  updated_at: string;
}

export type CaseStudyDraft = Omit<CaseStudyRow, "id" | "published_at" | "updated_at">;

export function emptyCaseStudy(): CaseStudyDraft {
  return { slug: "", status: "draft", title: "", exchange: null, listing_year: null, city: null, summary: "", body: null, highlights: [], hero_image_url: null, ipo_id: null, sort_order: 100 };
}

/** "Aaron Industries Ltd." → "aaron-industries-ltd". Lowercase letters, digits and single hyphens only. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Why this case study cannot be saved, or null. Publishing asks for more than saving a draft. */
export function checkCaseStudy(d: CaseStudyDraft, forPublish: boolean): string | null {
  const title = d.title.trim();
  if (title.length < 3 || title.length > 140) return "The title must be 3 to 140 characters.";
  if (!SLUG.test(d.slug) || d.slug.length < 3 || d.slug.length > 80) return "The link name must be 3 to 80 characters: lowercase letters, digits and hyphens only.";
  const summary = d.summary.trim();
  if (summary.length < 10 || summary.length > 400) return "The summary must be 10 to 400 characters. It is the text shown on the card.";
  if (d.body !== null && d.body.length > 12000) return "The full story is too long (12,000 characters at most).";
  if (d.exchange !== null && !(EXCHANGES as readonly string[]).includes(d.exchange)) return "Choose NSE Emerge, BSE SME or Mainboard.";
  if (d.listing_year !== null && (!Number.isInteger(d.listing_year) || d.listing_year < 1990 || d.listing_year > 2100)) return "The listing year must be a year between 1990 and 2100.";
  if (d.city !== null && d.city.length > 80) return "The city name is too long.";
  if (d.hero_image_url !== null && !/^https:\/\//.test(d.hero_image_url)) return "The image link must start with https://.";
  if (!Number.isInteger(d.sort_order)) return "The order must be a whole number.";
  if (d.highlights.length > 8) return "At most 8 highlights.";
  for (const h of d.highlights) {
    if (!h.label.trim() || !h.value.trim()) return "Every highlight needs both a label and a value. Remove the empty ones.";
    if (h.label.length > 40 || h.value.length > 60) return "A highlight label can be 40 characters and its value 60.";
  }
  if (forPublish) {
    if (!d.exchange) return "Choose the exchange before publishing.";
    if (!d.listing_year) return "Enter the listing year before publishing.";
  }
  return null;
}

/** The row to write: trimmed, with empty strings as null. */
export function toRow(d: CaseStudyDraft): CaseStudyDraft {
  const t = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return { ...d, title: d.title.trim(), slug: d.slug.trim(), summary: d.summary.trim(), body: t(d.body), city: t(d.city), hero_image_url: t(d.hero_image_url), highlights: d.highlights.map((h) => ({ label: h.label.trim(), value: h.value.trim() })) };
}
