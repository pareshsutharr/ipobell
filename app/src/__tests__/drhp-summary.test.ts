import { describe, expect, it } from "@jest/globals";

import { DOC_TITLE, documentUrl, parseDocument, parseSummary, referenceDocument, sortDocuments, splitPageRefs, summaryBlocks, type UploadedDocument } from "@/features/ipos/summary";

const doc = (over: Partial<UploadedDocument> = {}): UploadedDocument => ({ id: "d1", docType: "drhp", version: 1, filePath: "ipo/abc/d1.pdf", pageCount: 312, ...over });

describe("reading a published summary", () => {
  it("maps a full row", () => {
    const s = parseSummary({ short_md: " Acme makes technical textiles. (p. 87) ", long_md: "Long.", use_of_funds: [{ purpose: "New plant", amount: "₹18 Cr", page: 64 }], risks: [{ text: "Three customers bring 60% of revenue", page: 31 }], source_document_id: "d1", published_at: "2026-11-14T10:00:00Z" });
    expect(s).toEqual({ shortText: "Acme makes technical textiles. (p. 87)", longText: "Long.", useOfFunds: [{ purpose: "New plant", amount: "₹18 Cr", page: 64 }], risks: [{ text: "Three customers bring 60% of revenue", page: 31 }], sourceDocumentId: "d1", publishedAt: "2026-11-14T10:00:00Z" });
  });

  it("nothing to show without the one-page summary", () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary({ short_md: "   ", long_md: "Long." })).toBeNull();
    expect(parseSummary({})).toBeNull();
  });

  it("drops malformed lines and bad page numbers instead of showing them", () => {
    const s = parseSummary({ short_md: "Text.", use_of_funds: [{ purpose: "Plant", amount: 5, page: "64" }, { purpose: "" }, "junk", null], risks: [{ text: "Risk", page: 0 }, { text: "" }, 7], long_md: 42 });
    expect(s?.useOfFunds).toEqual([{ purpose: "Plant", amount: "", page: null }]);
    expect(s?.risks).toEqual([{ text: "Risk", page: null }]);
    expect(s?.longText).toBeNull();
    expect(parseSummary({ short_md: "Text.", use_of_funds: "no", risks: {} })?.useOfFunds).toEqual([]);
  });
});

describe("uploaded documents", () => {
  it("accepts only our own file paths", () => {
    expect(parseDocument({ id: "d1", doc_type: "rhp", version: 2, file_path: "ipo/abc/d1.pdf", page_count: 300 })).toEqual({ id: "d1", docType: "rhp", version: 2, filePath: "ipo/abc/d1.pdf", pageCount: 300 });
    expect(parseDocument({ id: "d1", doc_type: "rhp", file_path: "../../secret.pdf" })).toBeNull();
    expect(parseDocument({ id: "d1", doc_type: "rhp", file_path: "https://evil.example/x.pdf" })).toBeNull();
    expect(parseDocument({ id: "d1", doc_type: "annual-report", file_path: "ipo/a/b.pdf" })).toBeNull();
    expect(parseDocument({ id: "d1", doc_type: "rhp", file_path: "ipo/a/b.exe" })).toBeNull();
  });

  it("orders them newest stage first", () => {
    const sorted = sortDocuments([doc({ id: "a", docType: "drhp" }), doc({ id: "b", docType: "prospectus" }), doc({ id: "c", docType: "rhp" }), doc({ id: "d", docType: "drhp", version: 2 })]);
    expect(sorted.map((d) => d.id)).toEqual(["b", "c", "d", "a"]);
    expect(DOC_TITLE.rhp).toBe("Red Herring Prospectus (RHP)");
  });

  it("builds the public link, optionally at a page", () => {
    expect(documentUrl("https://x.supabase.co/", doc())).toBe("https://x.supabase.co/storage/v1/object/public/ipo-documents/ipo/abc/d1.pdf");
    expect(documentUrl("https://x.supabase.co", doc(), 64)).toBe("https://x.supabase.co/storage/v1/object/public/ipo-documents/ipo/abc/d1.pdf#page=64");
    expect(documentUrl("https://x.supabase.co", doc(), 0)).not.toContain("#page");
    expect(documentUrl("https://x.supabase.co", doc(), null)).not.toContain("#page");
  });

  it("page numbers open the document the summary was written from", () => {
    const docs = [doc({ id: "drhp-1", docType: "drhp" }), doc({ id: "rhp-1", docType: "rhp" })];
    expect(referenceDocument({ sourceDocumentId: "drhp-1" }, docs)?.id).toBe("drhp-1");
    expect(referenceDocument({ sourceDocumentId: "deleted" }, docs)?.id).toBe("rhp-1"); // falls back to the newest stage
    expect(referenceDocument(null, docs)?.id).toBe("rhp-1");
    expect(referenceDocument({ sourceDocumentId: "x" }, [])).toBeNull();
  });
});

describe("page references in the text", () => {
  it("are split out so they can be tapped", () => {
    expect(splitPageRefs("Makes textiles (p. 87). Plant in Surat (pp. 64-66) and more.")).toEqual([
      { kind: "text", text: "Makes textiles " },
      { kind: "page", text: "(p. 87)", page: 87 },
      { kind: "text", text: ". Plant in Surat " },
      { kind: "page", text: "(pp. 64-66)", page: 64 },
      { kind: "text", text: " and more." },
    ]);
    expect(splitPageRefs("(p. 5)")).toEqual([{ kind: "page", text: "(p. 5)", page: 5 }]);
    expect(splitPageRefs("No references (see page five).")).toEqual([{ kind: "text", text: "No references (see page five)." }]);
    expect(splitPageRefs("")).toEqual([]);
  });

  it("rejoining the parts gives the original text back", () => {
    const text = "A (p. 1) B (pp. 2–3) C (P. 44).";
    expect(splitPageRefs(text).map((p) => p.text).join("")).toBe(text);
  });
});

describe("headings and paragraphs", () => {
  it("splits on blank lines and recognises headings", () => {
    const blocks = summaryBlocks("The business\nAcme makes textiles. (p. 87)\nIt sells to 40 customers.\n\n## The issue\nFresh issue of ₹30 crore. (p. 12)\n\n**What to watch**\nCustomer concentration. (p. 31)\n\nA closing paragraph with no heading.");
    expect(blocks).toEqual([
      { kind: "heading", text: "The business" },
      { kind: "paragraph", text: "Acme makes textiles. (p. 87) It sells to 40 customers." },
      { kind: "heading", text: "The issue" },
      { kind: "paragraph", text: "Fresh issue of ₹30 crore. (p. 12)" },
      { kind: "heading", text: "What to watch" },
      { kind: "paragraph", text: "Customer concentration. (p. 31)" },
      { kind: "paragraph", text: "A closing paragraph with no heading." },
    ]);
  });

  it("ordinary text is not mistaken for a heading", () => {
    // the whole text is one short line
    expect(summaryBlocks("Acme makes technical textiles")).toEqual([{ kind: "paragraph", text: "Acme makes technical textiles" }]);
    // a paragraph typed with a line break after a short first line
    expect(summaryBlocks("First line of a paragraph\ncontinues here.")).toEqual([{ kind: "paragraph", text: "First line of a paragraph continues here." }]);
    // a short sentence standing alone is a paragraph because it ends with a full stop
    expect(summaryBlocks("Intro text here.\n\nShort sentence.\n\nMore text follows here.")).toEqual([{ kind: "paragraph", text: "Intro text here." }, { kind: "paragraph", text: "Short sentence." }, { kind: "paragraph", text: "More text follows here." }]);
  });

  it("a short line standing alone between blank lines is a heading", () => {
    expect(summaryBlocks("Acme makes textiles. (p. 87)\n\nOrder book\n\nOrders in hand are ₹40 crore. (p. 91)")).toEqual([
      { kind: "paragraph", text: "Acme makes textiles. (p. 87)" },
      { kind: "heading", text: "Order book" },
      { kind: "paragraph", text: "Orders in hand are ₹40 crore. (p. 91)" },
    ]);
  });

  it("bold markers inside a paragraph are removed, and empty input gives nothing", () => {
    expect(summaryBlocks("Revenue was **₹62 crore** in FY24.")).toEqual([{ kind: "paragraph", text: "Revenue was ₹62 crore in FY24." }]);
    expect(summaryBlocks(null)).toEqual([]);
    expect(summaryBlocks("   \n\n  ")).toEqual([]);
  });
});
