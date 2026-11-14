// DRHP summary checks, page selection for the AI draft, and the review-flow messages. Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkSummary, draftFromModel, emptySummary, pagesAsPrompt, scorePage, selectPages, summaryRow, unknownPageRefs, type PageText, type SummaryDraft } from "../src/lib/drhp-summary.ts";
import { canPublish, reviewError } from "../src/lib/review.ts";

const filler = (n: number) => `Paragraph of ordinary prospectus text number ${n}. `.repeat(12);
const good = (over: Partial<SummaryDraft> = {}): SummaryDraft => ({ ...emptySummary(), short_md: `Acme makes technical textiles in Surat and sells to 40 industrial customers. ${"It listed its plans in the offer document. ".repeat(6)}(p. 87)`, long_md: "Longer text.", use_of_funds: [{ purpose: "New plant at Sachin GIDC", amount: "₹18 Cr", page: 64 }], risks: [{ text: "Three customers bring 60% of revenue", page: 31 }], ...over });

test("a complete summary can be saved and published", () => {
  assert.equal(checkSummary(good(), false), null);
  assert.equal(checkSummary(good(), true), null);
});

test("a draft may be thin; publishing needs a real summary and the use of funds", () => {
  const thin = good({ short_md: "Short.", use_of_funds: [] });
  assert.equal(checkSummary(thin, false), null);
  assert.match(checkSummary(thin, true) ?? "", /too short to publish/);
  assert.match(checkSummary(good({ use_of_funds: [] }), true) ?? "", /how the money will be used/);
  assert.equal(checkSummary(emptySummary(), false), null, "an empty draft can be saved");
});

test("advice wording is refused, in any part of the summary", () => {
  assert.match(checkSummary(good({ short_md: `${good().short_md} Investors should subscribe.` }), false) ?? "", /Remove “subscribe”/);
  assert.match(checkSummary(good({ long_md: "We recommend this issue." }), false) ?? "", /Remove “recommend”/);
  assert.match(checkSummary(good({ risks: [{ text: "Avoid if you dislike debt", page: null }] }), false) ?? "", /Remove “Avoid”/);
  assert.equal(checkSummary(good({ long_md: "The company will buyback nothing; subscription figures are not known yet." }), false), null, "words that merely contain 'buy' or 'subscri' are fine");
});

test("limits and malformed lines", () => {
  assert.match(checkSummary(good({ short_md: "x".repeat(4001) }), false) ?? "", /one-page summary is too long/);
  assert.match(checkSummary(good({ long_md: "x".repeat(30001) }), false) ?? "", /long summary is too long/);
  assert.match(checkSummary(good({ use_of_funds: [{ purpose: " ", amount: "₹1 Cr", page: null }] }), false) ?? "", /needs a purpose/);
  assert.match(checkSummary(good({ risks: [{ text: "", page: 3 }] }), false) ?? "", /needs text/);
  assert.match(checkSummary(good({ risks: [{ text: "ok", page: 0 }] }), false) ?? "", /page number/);
  assert.match(checkSummary(good({ use_of_funds: [{ purpose: "ok", amount: "", page: 2.5 }] }), false) ?? "", /page number/);
  assert.match(checkSummary(good({ risks: Array.from({ length: 16 }, () => ({ text: "r", page: null })) }), false) ?? "", /At most 15 risks/);
});

test("the saved row is trimmed and empty text becomes null", () => {
  const row = summaryRow(good({ short_md: "  text  ", long_md: "   ", use_of_funds: [{ purpose: " Plant ", amount: " ₹18 Cr ", page: 64 }] }));
  assert.equal(row.short_md, "text");
  assert.equal(row.long_md, null);
  assert.deepEqual(row.use_of_funds, [{ purpose: "Plant", amount: "₹18 Cr", page: 64 }]);
});

// ---- page selection ----------------------------------------------------------------------------------------
function document(total: number, special: Record<number, string>): PageText[] {
  return Array.from({ length: total }, (_, i) => ({ page_no: i + 1, text: special[i + 1] ?? filler(i + 1) }));
}

test("pages are scored by the sections a summary is written from", () => {
  assert.ok(scorePage(`OBJECTS OF THE ISSUE\nThe net proceeds will be used as follows. ${filler(1)}`) > scorePage(filler(2)));
  assert.equal(scorePage(filler(3)), 0, "ordinary text scores nothing");
  assert.equal(scorePage("Objects of the issue"), 0, "a near-empty page (a heading alone) is ignored");
  const toc = `TABLE OF CONTENTS\n${Array.from({ length: 30 }, (_, i) => `Risk factors ........................ ${i + 20}\nObjects of the issue ............... ${i + 60}`).join("\n")}`;
  assert.equal(scorePage(toc), 0, "a table of contents is not content");
  const header = `${"Risk Factors ".repeat(40)} ${filler(4)}`;
  assert.ok(scorePage(header) <= 12, "a phrase repeated in a running header does not dominate");
});

test("selection picks the right sections out of a 300-page document, in page order, within the budget", () => {
  const doc = document(300, {
    31: `RISK FACTORS\nInternal risk factors. ${filler(31)}`,
    64: `OBJECTS OF THE ISSUE\nUtilisation of net proceeds: new plant. ${filler(64)}`,
    87: `OUR BUSINESS\nBusiness overview. Our products are technical textiles. ${filler(87)}`,
    150: `RESTATED FINANCIAL STATEMENTS\nRevenue from operations and profit after tax. ${filler(150)}`,
    190: `OUR PROMOTERS AND PROMOTER GROUP\nOur management. ${filler(190)}`,
  });
  const sel = selectPages(doc, 40_000);
  const nos = sel.pages.map((p) => p.page_no);
  for (const must of [31, 64, 87, 150, 190]) assert.ok(nos.includes(must), `page ${must} should be selected`);
  assert.ok(nos.includes(65), "the page after a section start comes with it");
  assert.deepEqual(nos, [...nos].sort((a, b) => a - b), "in page order");
  assert.ok(sel.characters <= 40_000);
  assert.ok(nos.length < 80, "most of the 300 pages are left out");
  assert.equal(sel.of, 300);
});

test("a tight budget still gives every topic its best page before any topic gets a second", () => {
  const doc = document(200, {
    10: `Risk factors. Internal risk. External risk. ${filler(10)}`,
    11: `Risk factors continued. ${filler(11)}`,
    12: `Risk factors continued. ${filler(12)}`,
    13: `Risk factors continued. ${filler(13)}`,
    60: `Objects of the issue. Use of proceeds. ${filler(60)}`,
    90: `Our business. Business overview. ${filler(90)}`,
  });
  const onePage = filler(1).length + 80;
  const nos = selectPages(doc, onePage * 7).pages.map((p) => p.page_no);
  assert.ok(nos.includes(60) && nos.includes(90) && nos.includes(10), `got ${nos.join(",")}`);
});

test("a document where nothing matches is sent from the start; an empty one selects nothing", () => {
  const plain = document(10, {});
  const sel = selectPages(plain, 1_000_000);
  assert.deepEqual(sel.pages.map((p) => p.page_no), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(selectPages([], 1000).pages, []);
  assert.deepEqual(selectPages([{ page_no: 1, text: "   " }], 1000).pages, []);
});

test("the prompt labels every page so the model can cite it", () => {
  assert.equal(pagesAsPrompt([{ page_no: 64, text: "Objects" }, { page_no: 65, text: "More" }]), "=== PAGE 64 ===\nObjects\n\n=== PAGE 65 ===\nMore");
});

// ---- reading the model's answer --------------------------------------------------------------------------
test("the model's answer becomes a draft; page numbers it was never shown are dropped", () => {
  const d = draftFromModel(
    { short_md: " Acme makes textiles. (p. 87) ", long_md: "Long.", use_of_funds: [{ purpose: "New plant", amount: "₹18 Cr", page: 64 }, { purpose: "Working capital", amount: "₹6 Cr", page: 999 }, { purpose: "", amount: "x" }, "junk"], risks: [{ text: "Customer concentration", page: "31" }, { text: "Made-up risk", page: 4000 }, null], extra: "ignored" },
    [31, 64, 65, 87],
    "doc-1",
  );
  assert.equal(d.short_md, "Acme makes textiles. (p. 87)");
  assert.deepEqual(d.use_of_funds, [{ purpose: "New plant", amount: "₹18 Cr", page: 64 }, { purpose: "Working capital", amount: "₹6 Cr", page: null }]);
  assert.deepEqual(d.risks, [{ text: "Customer concentration", page: 31 }, { text: "Made-up risk", page: null }]);
  assert.equal(d.source_document_id, "doc-1");
  assert.equal(d.ai_drafted, true);
});

test("garbage from the model gives an empty draft, never a crash", () => {
  for (const junk of [null, undefined, "text", 5, [], { short_md: 5, use_of_funds: "no", risks: {} }]) {
    const d = draftFromModel(junk, [1], "doc-1");
    assert.equal(d.short_md, "");
    assert.deepEqual(d.use_of_funds, []);
    assert.deepEqual(d.risks, []);
  }
});

test("page references in the text that point outside the pages sent are found", () => {
  assert.deepEqual(unknownPageRefs("Makes textiles (p. 87). Plant in Surat (p. 64). Wins awards (p. 412). Range (pp. 64-66) and (pp. 31–33).", [31, 32, 33, 64, 65, 87]), [66, 412]);
  assert.deepEqual(unknownPageRefs("No references here.", [1]), []);
});

// ---- review flow ------------------------------------------------------------------------------------------
test("only a super admin may publish, and database refusals are explained in plain words", () => {
  assert.equal(canPublish("super_admin"), true);
  assert.equal(canPublish("editor"), false);
  assert.equal(canPublish(null), false);
  assert.match(reviewError("ONLY_SUPER_ADMIN_PUBLISHES"), /Only a super admin can publish/);
  assert.match(reviewError("PUBLISHED_IS_LOCKED", "a summary"), /Once published, a summary can only be changed by a super admin/);
  assert.match(reviewError("SUMMARY_EMPTY"), /one-page summary before publishing/);
  assert.match(reviewError('new row violates row-level security policy for table "x"'), /do not have permission/);
  assert.equal(reviewError("Something else went wrong"), "Something else went wrong");
});
