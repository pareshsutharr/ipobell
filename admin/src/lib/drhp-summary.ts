// DRHP summaries (public.ipo_drhp_summaries): types, save checks, and choosing which pages of an offer document
// to give the AI for a first draft. Pure functions, unit-tested with node --test.

export interface FundUse {
  purpose: string;
  amount: string;
  page: number | null;
}

export interface RiskItem {
  text: string;
  page: number | null;
}

export interface SummaryDraft {
  short_md: string;
  long_md: string;
  use_of_funds: FundUse[];
  risks: RiskItem[];
  source_document_id: string | null;
  ai_drafted: boolean;
}

export function emptySummary(): SummaryDraft {
  return { short_md: "", long_md: "", use_of_funds: [], risks: [], source_document_id: null, ai_drafted: false };
}

export const SHORT_MAX = 4000;
export const LONG_MAX = 30000;

/** Words that would turn a summary into advice. A summary describes the document; it does not tell anyone what to do. */
const ADVICE = /\b(subscribe|avoid|buy|sell|must apply|should apply|should invest|recommend(ed|s)?|good investment|bad investment)\b/i;

/** Why this summary cannot be saved, or null. Publishing asks for more than saving a draft. */
export function checkSummary(d: SummaryDraft, forPublish: boolean): string | null {
  if (d.short_md.length > SHORT_MAX) return `The one-page summary is too long (${d.short_md.length} of ${SHORT_MAX} characters).`;
  if (d.long_md.length > LONG_MAX) return `The long summary is too long (${d.long_md.length} of ${LONG_MAX} characters).`;
  if (d.use_of_funds.length > 15) return "At most 15 use-of-funds lines.";
  if (d.risks.length > 15) return "At most 15 risks.";
  for (const f of d.use_of_funds) {
    if (!f.purpose.trim()) return "Every use-of-funds line needs a purpose. Remove the empty ones.";
    if (f.purpose.length > 200 || f.amount.length > 60) return "A use-of-funds purpose can be 200 characters and its amount 60.";
    if (f.page !== null && (!Number.isInteger(f.page) || f.page < 1 || f.page > 5000)) return "A page number must be a whole number from 1 to 5000.";
  }
  for (const r of d.risks) {
    if (!r.text.trim()) return "Every risk needs text. Remove the empty ones.";
    if (r.text.length > 400) return "A risk can be 400 characters.";
    if (r.page !== null && (!Number.isInteger(r.page) || r.page < 1 || r.page > 5000)) return "A page number must be a whole number from 1 to 5000.";
  }
  const advice = ADVICE.exec(`${d.short_md}\n${d.long_md}\n${d.risks.map((r) => r.text).join("\n")}`);
  if (advice) return `Remove “${advice[0]}”. A summary describes the document; it must not tell readers what to do.`;
  if (forPublish) {
    if (d.short_md.trim().length < 200) return "The one-page summary is too short to publish (at least 200 characters).";
    if (d.use_of_funds.length === 0) return "Add how the money will be used before publishing.";
  }
  return null;
}

/** The row to write: trimmed, empty text as null. */
export function summaryRow(d: SummaryDraft) {
  const t = (s: string) => (s.trim() ? s.trim() : null);
  return {
    short_md: t(d.short_md),
    long_md: t(d.long_md),
    use_of_funds: d.use_of_funds.map((f) => ({ purpose: f.purpose.trim(), amount: f.amount.trim(), page: f.page })),
    risks: d.risks.map((r) => ({ text: r.text.trim(), page: r.page })),
    source_document_id: d.source_document_id,
    ai_drafted: d.ai_drafted,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Choosing pages for the AI draft
// ---------------------------------------------------------------------------------------------------------
export interface PageText {
  page_no: number;
  text: string;
}

/** Sections a summary is written from, with the phrases that mark them in an Indian offer document. */
const TOPICS: { key: string; weight: number; patterns: RegExp[] }[] = [
  { key: "objects", weight: 5, patterns: [/objects? of the (issue|offer)/i, /utili[sz]ation of (the )?(net )?proceeds/i, /use of (the )?(net )?proceeds/i, /deployment of funds/i] },
  { key: "business", weight: 4, patterns: [/our business/i, /business overview/i, /overview of our (business|company)/i, /our (products|services|customers|manufacturing)/i] },
  { key: "risks", weight: 3, patterns: [/risk factors?/i, /internal risk/i, /external risk/i] },
  { key: "summary", weight: 4, patterns: [/summary of (the )?(offer document|issue|business|financial)/i, /the (issue|offer) (details|structure)/i, /capital structure/i] },
  { key: "financials", weight: 3, patterns: [/restated (consolidated |standalone )?(financial|statement)/i, /summary of financial information/i, /revenue from operations/i, /profit after tax/i] },
  { key: "promoters", weight: 2, patterns: [/our promoters?( and promoter group)?/i, /our management/i, /board of directors/i] },
  { key: "industry", weight: 1, patterns: [/industry overview/i] },
];

export function scorePage(text: string): number {
  if (text.length < 200) return 0; // covers, blank pages, tables of contents fragments
  let score = 0;
  for (const t of TOPICS) {
    let hits = 0;
    for (const p of t.patterns) hits += (text.match(new RegExp(p.source, "gi")) ?? []).length;
    score += Math.min(hits, 4) * t.weight; // a phrase repeated in a running header must not dominate
  }
  // A page that is mostly a list of dotted leaders and page numbers is a table of contents.
  const leaders = (text.match(/\.{5,}/g) ?? []).length;
  return leaders > 8 ? 0 : score;
}

export interface SelectedPages {
  pages: PageText[];
  /** Characters of text selected. */
  characters: number;
  /** Total pages considered. */
  of: number;
}

/**
 * Pick the pages to send, within a character budget. Whole offer documents run to hundreds of pages; sending the
 * relevant ones keeps the request fast and the answer focused. The best page of each topic goes in first so no
 * topic is crowded out, then the rest by score, each with the page after it (sections run over page breaks).
 * The result is in page order.
 */
export function selectPages(all: PageText[], budgetChars = 240_000): SelectedPages {
  const scored = all.map((p) => ({ p, score: scorePage(p.text) })).filter((x) => x.score > 0);
  const byNo = new Map(all.map((p) => [p.page_no, p]));
  const chosen = new Map<number, PageText>();
  let characters = 0;
  const take = (p: PageText | undefined): boolean => {
    if (!p || chosen.has(p.page_no) || !p.text.trim()) return true;
    if (characters + p.text.length > budgetChars) return false;
    chosen.set(p.page_no, p);
    characters += p.text.length;
    return true;
  };

  for (const t of TOPICS) {
    const best = scored
      .map((x) => ({ p: x.p, hits: t.patterns.reduce((n, re) => n + (x.p.text.match(new RegExp(re.source, "gi")) ?? []).length, 0) }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || a.p.page_no - b.p.page_no)[0];
    if (best) {
      take(best.p);
      take(byNo.get(best.p.page_no + 1));
    }
  }
  for (const x of [...scored].sort((a, b) => b.score - a.score || a.p.page_no - b.p.page_no)) {
    if (!take(x.p)) break;
    take(byNo.get(x.p.page_no + 1));
  }
  // A short document, or one where nothing matched (unusual wording): send it from the start.
  if (chosen.size === 0) for (const p of all) if (!take(p)) break;

  return { pages: [...chosen.values()].sort((a, b) => a.page_no - b.page_no), characters, of: all.length };
}

/** The selected pages as one text, each page introduced by its number so the model can cite it. */
export function pagesAsPrompt(pages: PageText[]): string {
  return pages.map((p) => `=== PAGE ${p.page_no} ===\n${p.text}`).join("\n\n");
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pageNo = (v: unknown, valid: Set<number>): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  // A page the model was never shown cannot be a real reference: drop it instead of showing a made-up number.
  return Number.isInteger(n) && valid.has(n) ? n : null;
};

/** Turn the model's JSON into a draft, keeping only well-formed parts and page numbers that were actually sent. */
export function draftFromModel(raw: unknown, sentPages: number[], sourceDocumentId: string): SummaryDraft {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const valid = new Set(sentPages);
  const funds = Array.isArray(o.use_of_funds) ? o.use_of_funds : [];
  const risks = Array.isArray(o.risks) ? o.risks : [];
  return {
    short_md: str(o.short_md, SHORT_MAX),
    long_md: str(o.long_md, LONG_MAX),
    use_of_funds: funds
      .map((f) => (f && typeof f === "object" ? { purpose: str((f as Record<string, unknown>).purpose, 200), amount: str((f as Record<string, unknown>).amount, 60), page: pageNo((f as Record<string, unknown>).page, valid) } : { purpose: "", amount: "", page: null }))
      .filter((f) => f.purpose)
      .slice(0, 15),
    risks: risks
      .map((r) => (r && typeof r === "object" ? { text: str((r as Record<string, unknown>).text, 400), page: pageNo((r as Record<string, unknown>).page, valid) } : { text: "", page: null }))
      .filter((r) => r.text)
      .slice(0, 15),
    source_document_id: sourceDocumentId,
    ai_drafted: true,
  };
}

/** Page references written in the text as "(p. 87)" or "(pp. 87-89)" that point at pages the model was not shown. */
export function unknownPageRefs(text: string, sentPages: number[]): number[] {
  const valid = new Set(sentPages);
  const out = new Set<number>();
  for (const m of text.matchAll(/\(pp?\.\s*(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?\)/gi)) {
    for (const g of [m[1], m[2]]) if (g && !valid.has(Number(g))) out.add(Number(g));
  }
  return [...out].sort((a, b) => a - b);
}
