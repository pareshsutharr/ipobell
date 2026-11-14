// Text of a PDF, page by page. Works on any pdf.js document object, so the same code runs in the admin's browser
// (where uploads are read: no server time limit or upload size limit applies there) and under node --test.
//
// Offer documents are text PDFs. A scanned PDF has pictures of pages and yields no text; that is reported
// (pagesWithText) instead of being passed off as an empty document.

export interface PdfTextItem {
  str: string;
  /** [a, b, c, d, x, y] */
  transform: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

export interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup?(): void;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

export interface ExtractedPage {
  page_no: number;
  text: string;
}

export interface ExtractResult {
  pages: ExtractedPage[];
  pageCount: number;
  /** Pages that have at least MIN_PAGE_CHARS of text. */
  pagesWithText: number;
  /** Total characters, for a quick sanity check against the file. */
  characters: number;
}

export const MAX_PAGES = 5000;
export const MAX_PAGE_CHARS = 60000;
/** A page with fewer characters than this is treated as having no text (a page number or a stamp is not content). */
export const MIN_PAGE_CHARS = 20;

const isItem = (v: unknown): v is PdfTextItem => Boolean(v) && typeof (v as PdfTextItem).str === "string" && Array.isArray((v as PdfTextItem).transform);

/** Lay the text runs of one page out as lines, in reading order as the PDF gives them. */
export function pageTextFromItems(items: unknown[]): string {
  let out = "";
  let prev: PdfTextItem | null = null;
  for (const raw of items) {
    if (!isItem(raw)) continue;
    const it = raw;
    if (prev) {
      const size = Math.abs(it.transform[3]) || Math.abs(prev.transform[3]) || 10;
      const sameLine = Math.abs(it.transform[5] - prev.transform[5]) <= size * 0.5;
      if (prev.hasEOL || !sameLine) {
        if (!out.endsWith("\n")) out += "\n";
      } else {
        const gap = it.transform[4] - (prev.transform[4] + (prev.width ?? 0));
        if (gap > size * 0.2 && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
      }
    }
    out += it.str;
    prev = it;
  }
  return cleanText(out);
}

/** Tidy extracted text: no NUL characters (Postgres refuses them), no trailing spaces, at most one blank line. */
export function cleanText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ +/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_PAGE_CHARS);
}

/** Read every page. `onProgress(done, total)` is called after each page. */
export async function extractPages(doc: PdfDocumentLike, onProgress?: (done: number, total: number) => void): Promise<ExtractResult> {
  const total = doc.numPages;
  if (!Number.isInteger(total) || total < 1) throw new Error("This PDF has no pages.");
  if (total > MAX_PAGES) throw new Error(`This PDF has ${total} pages; the limit is ${MAX_PAGES}.`);
  const pages: ExtractedPage[] = [];
  let pagesWithText = 0;
  let characters = 0;
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = pageTextFromItems(content.items);
    page.cleanup?.();
    pages.push({ page_no: n, text });
    characters += text.length;
    if (text.length >= MIN_PAGE_CHARS) pagesWithText++;
    onProgress?.(n, total);
  }
  return { pages, pageCount: total, pagesWithText, characters };
}

/** Split pages into batches for saving: at most `maxPages` pages and about `maxChars` characters per request. */
export function batchPages(pages: ExtractedPage[], maxPages = 25, maxChars = 400_000): ExtractedPage[][] {
  const out: ExtractedPage[][] = [];
  let current: ExtractedPage[] = [];
  let chars = 0;
  for (const p of pages) {
    if (current.length && (current.length >= maxPages || chars + p.text.length > maxChars)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(p);
    chars += p.text.length;
  }
  if (current.length) out.push(current);
  return out;
}

/** One line for the person who uploaded: how it went. */
export function extractionSummary(r: Pick<ExtractResult, "pageCount" | "pagesWithText">): { ok: boolean; message: string } {
  if (r.pagesWithText === 0) return { ok: false, message: `None of the ${r.pageCount} pages has readable text. This looks like a scanned PDF. Upload the text version from the exchange or SEBI website.` };
  const missing = r.pageCount - r.pagesWithText;
  if (missing === 0) return { ok: true, message: `All ${r.pageCount} pages read.` };
  const share = missing / r.pageCount;
  return { ok: share <= 0.5, message: share <= 0.5 ? `${r.pagesWithText} of ${r.pageCount} pages read. ${missing} ${missing === 1 ? "page has" : "pages have"} no text (blank pages, or pages that are pictures).` : `Only ${r.pagesWithText} of ${r.pageCount} pages have readable text. Most of this PDF looks scanned. Upload the text version from the exchange or SEBI website.` };
}

export const DOC_TYPES = [
  { value: "drhp", label: "DRHP (draft)" },
  { value: "rhp", label: "RHP" },
  { value: "prospectus", label: "Prospectus (final)" },
] as const;
export type DocType = (typeof DOC_TYPES)[number]["value"];

export function docTypeLabel(v: string): string {
  return DOC_TYPES.find((d) => d.value === v)?.label ?? v;
}

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Why this file cannot be uploaded, or null. `head` is the first bytes of the file. */
export function checkPdfFile(file: { name: string; size: number; type: string }, head: Uint8Array): string | null {
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_PDF_BYTES) return `The file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 50 MB. Exchanges usually publish a smaller, text version.`;
  // "%PDF-" may be preceded by a few junk bytes; the spec allows it within the first 1024.
  const text = Array.from(head.slice(0, 1024), (b) => String.fromCharCode(b)).join("");
  if (!text.includes("%PDF-")) return "This is not a PDF file.";
  return null;
}
