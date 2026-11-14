// PDF text extraction, tested on real PDF files built in memory and read with pdf.js. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import { batchPages, checkPdfFile, cleanText, docTypeLabel, extractionSummary, extractPages, MAX_PAGE_CHARS, pageTextFromItems, type PdfDocumentLike } from "../src/lib/pdf-text.ts";

/** A small but valid PDF: one page per entry, each line of text on its own line. Empty array = a page with no text. */
function makePdf(pages: string[][]): Uint8Array {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) - 1 + 1; // 1-based object number
  const catalog = add("");
  const tree = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const stream = lines.length ? `BT /F1 11 Tf 72 760 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(" ")} ET` : "";
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}

async function open(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return (await pdfjs.getDocument({ data: bytes, useSystemFonts: true, verbosity: 0 }).promise) as unknown as PdfDocumentLike;
}

test("a 200-page document: page count and the text of every page match", async () => {
  const source = Array.from({ length: 200 }, (_, i) => [`Page ${i + 1} of the Draft Red Herring Prospectus`, `Section ${(i % 12) + 1}: objects of the issue and use of proceeds, item ${i * 7}`, `Total amount (Rs lakh): ${1000 + i}.50`]);
  const doc = await open(makePdf(source));
  const seen: number[] = [];
  const r = await extractPages(doc, (done, total) => {
    seen.push(done);
    assert.equal(total, 200);
  });
  assert.equal(r.pageCount, 200);
  assert.equal(r.pages.length, 200);
  assert.equal(r.pagesWithText, 200);
  assert.deepEqual(seen, Array.from({ length: 200 }, (_, i) => i + 1), "progress is reported once per page, in order");
  for (let i = 0; i < 200; i++) {
    assert.equal(r.pages[i].page_no, i + 1);
    assert.equal(r.pages[i].text, source[i].join("\n"), `page ${i + 1}`);
  }
  assert.equal(r.characters, source.reduce((n, p) => n + p.join("\n").length, 0));
  assert.deepEqual(extractionSummary(r), { ok: true, message: "All 200 pages read." });
});

test("punctuation, brackets and figures survive", async () => {
  const lines = ["Price band: Rs 95 - Rs 100 per share (face value Rs 10)", "Fresh issue of 30,00,000 shares; OFS: nil", "P/E 13.03x, RoNW 34.09%, D/E 0.8 \\ see page 212"];
  const r = await extractPages(await open(makePdf([lines])));
  assert.equal(r.pages[0].text, lines.join("\n"));
});

test("blank pages are counted as having no text, without failing the document", async () => {
  const r = await extractPages(await open(makePdf([["First page with a full sentence of text."], [], ["12"], ["Fourth page with a full sentence of text."]])));
  assert.equal(r.pageCount, 4);
  assert.deepEqual(r.pages.map((p) => p.text), ["First page with a full sentence of text.", "", "12", "Fourth page with a full sentence of text."]);
  assert.equal(r.pagesWithText, 2, "a bare page number is not content");
  assert.deepEqual(extractionSummary(r), { ok: true, message: "2 of 4 pages read. 2 pages have no text (blank pages, or pages that are pictures)." });
});

test("a scanned PDF (no text on any page) is reported as such", async () => {
  const r = await extractPages(await open(makePdf([[], [], []])));
  assert.equal(r.pagesWithText, 0);
  const s = extractionSummary(r);
  assert.equal(s.ok, false);
  assert.match(s.message, /scanned PDF/);
  const mostly = extractionSummary({ pageCount: 100, pagesWithText: 10 });
  assert.equal(mostly.ok, false);
  assert.match(mostly.message, /Only 10 of 100 pages/);
  assert.equal(extractionSummary({ pageCount: 100, pagesWithText: 99 }).message, "99 of 100 pages read. 1 page has no text (blank pages, or pages that are pictures).");
});

test("a file that is not a PDF cannot be opened", async () => {
  await assert.rejects(() => open(Uint8Array.from("this is not a pdf at all", (c) => c.charCodeAt(0))));
});

test("lines and words are rebuilt from positioned text runs", () => {
  const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({ str, transform: [10, 0, 0, 10, x, y], width, hasEOL });
  // same line, touching runs: no space added; a gap: one space; a new y: new line
  assert.equal(pageTextFromItems([item("Obj", 72, 700, 15), item("ects", 87, 700, 20), item("of", 115, 700, 10), item("the issue", 130, 700, 40), item("Next line", 72, 686, 40)]), "Objects of the issue\nNext line");
  assert.equal(pageTextFromItems([item("A", 72, 700, 6, true), item("B", 72, 700, 6)]), "A\nB", "an explicit end-of-line wins");
  assert.equal(pageTextFromItems([item("word ", 72, 700, 25), item("next", 110, 700, 20)]), "word next", "no double space");
  assert.equal(pageTextFromItems([{ type: "beginMarkedContent" }, null, item("ok", 72, 700, 10)]), "ok", "non-text items are skipped");
  assert.equal(pageTextFromItems([]), "");
});

test("text is cleaned for storage", () => {
  assert.equal(cleanText("a\u0000b"), "ab", "NUL characters are removed (the database refuses them)");
  assert.equal(cleanText("  one   two three \n\n\n\n four\t five  "), "one two three\n\nfour five");
  assert.equal(cleanText("x".repeat(MAX_PAGE_CHARS + 500)).length, MAX_PAGE_CHARS);
});

test("pages are saved in batches that respect both limits", () => {
  const pages = Array.from({ length: 60 }, (_, i) => ({ page_no: i + 1, text: "t".repeat(1000) }));
  const byCount = batchPages(pages, 25, 10_000_000);
  assert.deepEqual(byCount.map((b) => b.length), [25, 25, 10]);
  const byChars = batchPages(pages, 1000, 10_500);
  assert.ok(byChars.every((b) => b.length <= 10));
  assert.equal(byChars.flat().length, 60);
  assert.deepEqual(byChars.flat().map((p) => p.page_no), pages.map((p) => p.page_no), "order is kept and nothing is dropped");
  const huge = batchPages([{ page_no: 1, text: "x".repeat(50_000) }, { page_no: 2, text: "y" }], 25, 10_000);
  assert.deepEqual(huge.map((b) => b.map((p) => p.page_no)), [[1], [2]], "one very long page still gets its own batch");
  assert.deepEqual(batchPages([]), []);
});

test("file checks before upload", () => {
  const pdfHead = Uint8Array.from("%PDF-1.7\n...", (c) => c.charCodeAt(0));
  assert.equal(checkPdfFile({ name: "drhp.pdf", size: 5_000_000, type: "application/pdf" }, pdfHead), null);
  assert.match(checkPdfFile({ name: "drhp.pdf", size: 0, type: "application/pdf" }, pdfHead) ?? "", /empty/);
  assert.match(checkPdfFile({ name: "drhp.pdf", size: 60 * 1024 * 1024, type: "application/pdf" }, pdfHead) ?? "", /60\.0 MB. The limit is 50 MB/);
  assert.match(checkPdfFile({ name: "renamed.pdf", size: 1000, type: "application/pdf" }, Uint8Array.from("PK\u0003\u0004 a zip", (c) => c.charCodeAt(0))) ?? "", /not a PDF/);
  assert.equal(checkPdfFile({ name: "odd.pdf", size: 1000, type: "" }, Uint8Array.from("\n\n junk %PDF-1.4", (c) => c.charCodeAt(0))), null, "the signature may follow a few stray bytes");
  assert.equal(docTypeLabel("drhp"), "DRHP (draft)");
  assert.equal(docTypeLabel("rhp"), "RHP");
});
