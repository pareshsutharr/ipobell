// DRHP summary shown on an IPO page (pure helpers, unit-tested). The summary is written by the team in the
// admin panel from the uploaded offer document; the app shows it only once published. Page references in the
// text, like "(p. 87)", open the uploaded PDF at that page.

export interface FundUse {
  purpose: string;
  amount: string;
  page: number | null;
}

export interface RiskItem {
  text: string;
  page: number | null;
}

export interface DrhpSummary {
  shortText: string;
  longText: string | null;
  useOfFunds: FundUse[];
  risks: RiskItem[];
  sourceDocumentId: string | null;
  publishedAt: string | null;
}

export interface UploadedDocument {
  id: string;
  docType: "drhp" | "rhp" | "prospectus";
  version: number;
  filePath: string;
  pageCount: number | null;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const page = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null);

/** A database row → DrhpSummary, or null when there is nothing to show. Malformed parts are dropped. */
export function parseSummary(r: Record<string, unknown> | null | undefined): DrhpSummary | null {
  if (!r) return null;
  const shortText = str(r.short_md, 4000);
  if (!shortText) return null;
  const funds = Array.isArray(r.use_of_funds) ? (r.use_of_funds as unknown[]) : [];
  const risks = Array.isArray(r.risks) ? (r.risks as unknown[]) : [];
  return {
    shortText,
    longText: str(r.long_md, 30000) || null,
    useOfFunds: funds
      .map((f) => (f && typeof f === "object" ? { purpose: str((f as Record<string, unknown>).purpose, 200), amount: str((f as Record<string, unknown>).amount, 60), page: page((f as Record<string, unknown>).page) } : { purpose: "", amount: "", page: null }))
      .filter((f) => f.purpose)
      .slice(0, 15),
    risks: risks
      .map((x) => (x && typeof x === "object" ? { text: str((x as Record<string, unknown>).text, 400), page: page((x as Record<string, unknown>).page) } : { text: "", page: null }))
      .filter((x) => x.text)
      .slice(0, 15),
    sourceDocumentId: typeof r.source_document_id === "string" ? r.source_document_id : null,
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
  };
}

const DOC_TYPES = ["drhp", "rhp", "prospectus"] as const;

export function parseDocument(r: Record<string, unknown>): UploadedDocument | null {
  const id = str(r.id, 64);
  const docType = DOC_TYPES.find((t) => t === r.doc_type);
  const filePath = str(r.file_path, 200);
  // Same shape the database enforces; anything else is not a file of ours.
  if (!id || !docType || !/^[a-z0-9/_.-]+\.pdf$/.test(filePath) || filePath.includes("..")) return null;
  return { id, docType, version: typeof r.version === "number" ? r.version : 1, filePath, pageCount: page(r.page_count) };
}

export const DOC_TITLE: Record<UploadedDocument["docType"], string> = {
  drhp: "Draft Red Herring Prospectus (DRHP)",
  rhp: "Red Herring Prospectus (RHP)",
  prospectus: "Prospectus",
};

/** Newest stage first: the final prospectus, then the RHP, then the DRHP. */
export function sortDocuments(docs: UploadedDocument[]): UploadedDocument[] {
  const rank = { prospectus: 0, rhp: 1, drhp: 2 } as const;
  return [...docs].sort((a, b) => rank[a.docType] - rank[b.docType] || b.version - a.version);
}

/** Public link to an uploaded PDF, optionally opened at a page (PDF viewers honour #page=N). */
export function documentUrl(supabaseUrl: string, doc: Pick<UploadedDocument, "filePath">, pageNo?: number | null): string {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/ipo-documents/${doc.filePath.split("/").map(encodeURIComponent).join("/")}`;
  return pageNo && Number.isInteger(pageNo) && pageNo > 0 ? `${base}#page=${pageNo}` : base;
}

/** The document a summary's page numbers refer to: the one it was written from, else the newest one. */
export function referenceDocument(summary: Pick<DrhpSummary, "sourceDocumentId"> | null, docs: UploadedDocument[]): UploadedDocument | null {
  if (!docs.length) return null;
  return docs.find((d) => d.id === summary?.sourceDocumentId) ?? sortDocuments(docs)[0];
}

export type TextPart = { kind: "text"; text: string } | { kind: "page"; text: string; page: number };

/** Split a paragraph into plain text and page references — "(p. 87)" or "(pp. 87-89)" — so they can be made tappable. */
export function splitPageRefs(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/\(pp?\.\s*(\d{1,4})(?:\s*[-–]\s*\d{1,4})?\)/gi)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "page", text: m[0], page: Number(m[1]) });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export type Block = { kind: "heading"; text: string } | { kind: "paragraph"; text: string };

/** Section names the summary template uses; a line that is exactly one of these is a heading wherever it appears. */
const KNOWN_HEADINGS = new Set(["the business", "the issue", "financial track record", "promoters and management", "what to watch", "use of funds", "objects of the issue", "risks"]);

/**
 * Summary text → headings and paragraphs. Paragraphs are separated by blank lines. A heading is a line written as
 * "## Heading" or "**Heading**", one of the template's section names, or a short line standing alone between
 * blank lines with no full stop. A paragraph that merely starts with a short line is left as a paragraph.
 */
export function summaryBlocks(text: string | null | undefined): Block[] {
  if (!text) return [];
  const out: Block[] = [];
  for (const chunk of text.split(/\r?\n\s*\r?\n/)) {
    const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push({ kind: "paragraph", text: para.join(" ") });
      para = [];
    };
    for (const line of lines) {
      const marked = /^#{1,4}\s+(.+)$/.exec(line) ?? /^\*\*(.+?)\*\*:?$/.exec(line);
      const known = KNOWN_HEADINGS.has(line.replace(/[:*#]+/g, "").trim().toLowerCase());
      const alone = lines.length === 1 && line.length <= 60 && line.split(/\s+/).length <= 6 && !/[.!?)]$/.test(line) && /^[A-Z]/.test(line) && /\r?\n\s*\r?\n/.test(text.trim());
      const plainHeading = !marked && (known || alone);
      if (marked || plainHeading) {
        flush();
        out.push({ kind: "heading", text: (marked ? marked[1] : line).replace(/[:*]+$/, "").trim() });
      } else para.push(line.replace(/\*\*(.+?)\*\*/g, "$1"));
    }
    flush();
  }
  return out;
}
