/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as XLSX from "xlsx";

import { buildHealthReport, emptyYear, healthMessage, healthPayload, netTangibleAssets, sanitizeFigures, type YearFigures } from "@/features/business/health";
import { amountOf, detectUnit, matchLabel, normaliseLabel, parseStatements, toCrore, unitOfText, yearOf, type Cell } from "@/features/business/sheetParse";
import { base64ToBytes, fileKind, readSheets, SheetReadError } from "@/features/business/sheetRead";
import { DEFAULT_ELIGIBILITY_LIMITS } from "@/features/business/tools";

/** A real file in memory: written by the spreadsheet library, then read back through the app's own reader. */
function file(sheets: Record<string, Cell[][]>, bookType: "xlsx" | "xls" | "csv") {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer);
  return readSheets(bytes, bookType);
}

// Five sample layouts. The numbers are made up for the tests.
const SCHEDULE_III = {
  "Balance Sheet": [
    ["ABC Private Limited"],
    ["Balance Sheet as at 31st March, 2025"],
    ["(₹ in Lakhs)"],
    ["Particulars", "Note No.", "As at 31st March, 2025", "As at 31st March, 2024"],
    ["I. EQUITY AND LIABILITIES"],
    ["(1) Shareholders' funds"],
    ["(a) Share capital", 2, 500, 500],
    ["(b) Reserves and surplus", 3, 1250.5, 820.25],
    ["(2) Non-current liabilities"],
    ["(a) Long-term borrowings", 4, 600, 750],
    ["(3) Current liabilities"],
    ["(a) Short-term borrowings", 5, 400, 350],
    ["(b) Trade payables", 6, 300, 280],
    ["Total current liabilities", null, 900, 800],
    ["TOTAL", null, 3250.5, 2870.25],
    ["II. ASSETS"],
    ["(a) Property, plant and equipment", 7, 1425.5, 1340.25],
    ["(b) Intangible assets", 8, 25, 30],
    ["Total current assets", null, 1800, 1500],
  ] as Cell[][],
  "Profit and Loss": [
    ["Statement of Profit and Loss for the year ended 31st March, 2025"],
    ["Particulars", "Note", "For the year ended 31st March, 2025", "For the year ended 31st March, 2024"],
    ["I. Revenue from operations", 15, 5200, 4100],
    ["II. Other income", 16, 40, 35],
    ["III. Total Income (I+II)", null, 5240, 4135],
    ["Finance costs", 20, 95, 110],
    ["Depreciation and amortisation expense", 21, 60, 55],
    ["Profit before tax", null, 640, 430],
    ["Profit / (Loss) for the year", null, 480.5, 320],
  ] as Cell[][],
};

const CRORE_ONE_SHEET = {
  Summary: [
    ["Amount in ₹ Crore"],
    ["Particulars", "FY 2024-25", "FY 2023-24", "FY 2022-23"],
    ["Net Sales", 84.2, 61.5, 40],
    ["EBITDA", 12.6, 7.1, "0.90"],
    ["PAT", 6.4, 2.2, "(1.20)"],
    ["Interest", 1.8, 2, 2.4],
    [],
    ["Balance Sheet", "FY 2024-25", "FY 2023-24", "FY 2022-23"],
    ["Net Worth", 31.5, 25.1, 22.9],
    ["Total Borrowings", 18, 21, 24.5],
    ["Total Current Assets", 40.2, 33, 29],
    ["Total Current Liabilities", 22.3, 20, 21],
    ["Goodwill", "-", "-", "-"],
  ] as Cell[][],
};

const CSV_NO_UNIT = {
  Sheet1: [
    ["Particulars", "31/03/2025", "31/03/2024"],
    ["Turnover", "12,50,00,000", "9,80,00,000"],
    ["Net Profit after Tax", "85,00,000", "42,50,000"],
    ["Share Capital", "1,00,00,000", "1,00,00,000"],
    ["Reserves & Surplus", "2,40,00,000", "1,55,00,000"],
  ] as Cell[][],
};

const IND_AS_MILLIONS = {
  BS: [
    ["All amounts in INR millions"],
    ["Particulars", new Date(Date.UTC(2025, 2, 31)), new Date(Date.UTC(2024, 2, 31))],
    ["Goodwill", 12, 12],
    ["Other intangible assets", 8.5, 6],
    ["Total current assets", 950, 700],
    ["Total equity", 1210, 990],
    ["Non-current liabilities"],
    ["Borrowings", 300, 340],
    ["Current liabilities"],
    ["Borrowings", 120, 90],
    ["Total current liabilities", 480, 410],
  ] as Cell[][],
  PL: [
    ["Particulars", "Year ended March 31, 2025", "Year ended March 31, 2024"],
    ["Revenue from operations", 2600, 2100],
    ["Finance costs", 38, 41],
    ["Depreciation and amortization expense", 52, 47],
    ["Profit before exceptional items and tax", 300, 221],
    ["Profit for the year", 222, 160],
  ] as Cell[][],
};

const THOUSANDS_TWO_ENTITIES = {
  Standalone: [
    ["(Rs. in '000)"],
    ["Particulars", 2025, 2024],
    ["Sales", 152000, 131000],
    ["Interest", 2100, 2500],
    ["Depreciation", 3900, 3600],
    ["Net Profit Before Tax", 14000, 9900],
    ["Net Profit After Tax", 10400, 7300],
    ["Net worth", 61000, 50600],
    ["Long Term Borrowings", 18000, 20000],
    ["Short Term Borrowings", 9000, 7500],
    ["Current maturities of long term debt", 2000, 2000],
  ] as Cell[][],
  Consolidated: [
    ["(Rs. in '000)"],
    ["Particulars", 2025, 2024],
    ["Sales", 999000, 888000],
    ["Net worth", 777000, 666000],
    ["Total Current Assets", 70000, 64000],
  ] as Cell[][],
};

describe("reading headings, amounts and labels", () => {
  it("reads the year a heading refers to", () => {
    expect(yearOf("As at 31st March, 2025")).toBe(2025);
    expect(yearOf("For the year ended 31st March, 2024")).toBe(2024);
    expect(yearOf("FY 2024-25")).toBe(2025);
    expect(yearOf("2023-2024")).toBe(2024);
    expect(yearOf("FY25")).toBe(2025);
    expect(yearOf("31.03.2025")).toBe(2025);
    expect(yearOf("01-04-2024 to 31-03-2025")).toBe(2025);
    expect(yearOf(2025)).toBe(2025);
    expect(yearOf(new Date(Date.UTC(2025, 2, 31)))).toBe(2025);
  });

  it("does not take other cells for a year", () => {
    expect(yearOf("Particulars")).toBeNull();
    expect(yearOf("Note No.")).toBeNull();
    expect(yearOf(5200)).toBeNull();
    expect(yearOf(2025.5)).toBeNull();
    expect(yearOf("2021-25")).toBeNull(); // not one financial year
    expect(yearOf("Plant bought between 2019 and 2023")).toBeNull();
    expect(yearOf(null)).toBeNull();
  });

  it("reads amounts the way statements write them", () => {
    expect(amountOf(1250.5)).toBe(1250.5);
    expect(amountOf("12,50,00,000")).toBe(125000000);
    expect(amountOf("(1,200.50)")).toBe(-1200.5);
    expect(amountOf("-45")).toBe(-45);
    expect(amountOf("₹ 3,400")).toBe(3400);
    expect(amountOf("1,23,456.00 Dr")).toBe(123456);
    expect(amountOf("-")).toBe(0);
    expect(amountOf("Nil")).toBe(0);
    expect(amountOf("see note 4")).toBeNull();
    expect(amountOf("")).toBeNull();
    expect(amountOf(null)).toBeNull();
  });

  it("cleans row labels", () => {
    expect(normaliseLabel("(b) Reserves & Surplus")).toBe("reserves and surplus");
    expect(normaliseLabel("III. Total Income (I+II)")).toBe("total income");
    expect(normaliseLabel("Profit / (Loss) for the year")).toBe("profit for the year");
    expect(normaliseLabel("Profit/Loss before tax")).toBe("profit before tax");
    expect(normaliseLabel("1. Revenue from Operations (Net)")).toBe("revenue from operations");
  });

  it("recognises statement rows and nothing else", () => {
    expect(matchLabel("Revenue from operations")?.line).toBe("revenue");
    expect(matchLabel("Shareholder's Funds")?.line).toBe("netWorth");
    expect(matchLabel("Profit after tax (PAT)")?.line).toBe("pat");
    expect(matchLabel("Long-term borrowings")?.line).toBe("borrowingsPart");
    expect(matchLabel("Total Current Liabilities")?.line).toBe("currentLiabilities");
    // near misses must not be picked up
    expect(matchLabel("Revenue from operations per employee")).toBeNull();
    expect(matchLabel("Cost of borrowings repaid")).toBeNull();
    expect(matchLabel("Deferred tax on profit after tax adjustments")).toBeNull();
    expect(matchLabel("Trade payables")).toBeNull();
    expect(matchLabel("Other current assets")).toBeNull();
  });

  it("finds the unit note", () => {
    expect(unitOfText("(₹ in Lakhs)")).toBe("lakhs");
    expect(unitOfText("Amount in Rs. Lacs")).toBe("lakhs");
    expect(unitOfText("(Rs. in '000)")).toBe("thousands");
    expect(unitOfText("All amounts in INR millions")).toBe("millions");
    expect(unitOfText("Figures in ₹ Crore")).toBe("crores");
    expect(unitOfText("Amount (₹)")).toBe("rupees");
    expect(unitOfText("Amount in Rupees")).toBe("rupees");
    expect(unitOfText("Rs. 10 lakh share capital")).toBeNull();
    expect(unitOfText("Sundry creditors")).toBeNull();
    expect(unitOfText("Investment in subsidiaries")).toBeNull();
    expect(detectUnit({ name: "x", rows: [["Company"], [null, "(₹ in Lakhs)"]] })).toBe("lakhs");
  });
});

describe("five sample files", () => {
  it("1. Schedule III, two sheets, in lakh (.xlsx)", () => {
    const p = parseStatements(file(SCHEDULE_III, "xlsx"));
    expect(p.unit).toBe("lakhs");
    expect(p.years.map((y) => y.label)).toEqual(["FY 2024-25", "FY 2023-24"]);
    expect(p.years[0]).toEqual({ label: "FY 2024-25", revenue: 5200, ebitda: 795, pat: 480.5, netWorth: 1750.5, borrowings: 1000, currentAssets: 1800, currentLiabilities: 900, intangibles: 25, financeCost: 95 });
    expect(p.years[1]).toEqual({ label: "FY 2023-24", revenue: 4100, ebitda: 595, pat: 320, netWorth: 1320.25, borrowings: 1100, currentAssets: 1500, currentLiabilities: 800, intangibles: 30, financeCost: 110 });
    expect(p.missing).toEqual([]);
    expect(p.sources.revenue).toEqual({ sheet: "Profit and Loss", label: "I. Revenue from operations" });
    expect(p.sources.netWorth?.derived).toBe("Share capital plus reserves");
    expect(p.sources.ebitda?.derived).toBe("Profit before tax plus finance cost plus depreciation");
    // the "Note No." column (2, 3, 4…) is never read as an amount
    const cr = toCrore(p.years, "lakhs");
    expect(cr[0].revenue).toBe(52);
    expect(cr[0].netWorth).toBe(17.505);
    expect(cr[1].pat).toBe(3.2);
  });

  it("2. One sheet with two blocks, three years, in crore (.xls)", () => {
    const p = parseStatements(file(CRORE_ONE_SHEET, "xls"));
    expect(p.unit).toBe("crores");
    expect(p.years.map((y) => y.label)).toEqual(["FY 2024-25", "FY 2023-24", "FY 2022-23"]);
    expect(p.years[0]).toEqual({ label: "FY 2024-25", revenue: 84.2, ebitda: 12.6, pat: 6.4, netWorth: 31.5, borrowings: 18, currentAssets: 40.2, currentLiabilities: 22.3, intangibles: 0, financeCost: 1.8 });
    expect(p.years[2].pat).toBe(-1.2); // "(1.20)" is a loss
    expect(p.years[2].ebitda).toBe(0.9);
    expect(toCrore(p.years, "crores")[0].revenue).toBe(84.2);
  });

  it("3. CSV with dates as headings, Indian commas and no unit note", () => {
    const p = parseStatements(file(CSV_NO_UNIT, "csv"));
    expect(p.unit).toBeNull(); // the file does not say: the user has to choose
    expect(p.years.map((y) => y.label)).toEqual(["FY 2024-25", "FY 2023-24"]);
    expect(p.years[0].revenue).toBe(125000000);
    expect(p.years[0].pat).toBe(8500000);
    expect(p.years[0].netWorth).toBe(34000000);
    expect(p.missing).toEqual(["ebitda", "borrowings", "currentAssets", "currentLiabilities", "intangibles", "financeCost"]);
    const cr = toCrore(p.years, "rupees");
    expect(cr[0].revenue).toBe(12.5);
    expect(cr[0].netWorth).toBe(3.4);
    expect(cr[1].pat).toBe(0.425);
  });

  it("4. Ind AS layout in millions, date cells as headings (.xlsx)", () => {
    const p = parseStatements(file(IND_AS_MILLIONS, "xlsx"));
    expect(p.unit).toBe("millions");
    expect(p.years[0]).toEqual({ label: "FY 2024-25", revenue: 2600, ebitda: 390, pat: 222, netWorth: 1210, borrowings: 420, currentAssets: 950, currentLiabilities: 480, intangibles: 20.5, financeCost: 38 });
    expect(p.years[1].borrowings).toBe(430);
    expect(p.sources.borrowings?.derived).toBe("Borrowing rows added together");
    expect(toCrore(p.years, "millions")[0].revenue).toBe(260);
  });

  it("5. Plain years as headings, in thousands, with a second (consolidated) sheet (.xlsx)", () => {
    const p = parseStatements(file(THOUSANDS_TWO_ENTITIES, "xlsx"));
    expect(p.unit).toBe("thousands");
    // the first sheet wins; the consolidated sheet only fills what the first one does not have
    expect(p.years[0].revenue).toBe(152000);
    expect(p.years[0].netWorth).toBe(61000);
    expect(p.years[0].borrowings).toBe(29000);
    expect(p.years[0].ebitda).toBe(20000);
    expect(p.years[0].currentAssets).toBe(70000);
    expect(p.sources.currentAssets?.sheet).toBe("Consolidated");
    expect(toCrore(p.years, "thousands")[0].revenue).toBe(15.2);
  });
});

describe("files that are not statements", () => {
  it("takes nothing from a sheet without year headings", () => {
    const p = parseStatements([{ name: "x", rows: [["Particulars", "Amount"], ["Revenue from operations", 5200], ["Net worth", 900]] }]);
    expect(p.found).toBe(0);
    expect(p.years).toEqual([]);
    expect(p.missing.length).toBe(9);
  });

  it("takes nothing from an unrelated spreadsheet", () => {
    const p = parseStatements([{ name: "Staff", rows: [["Name", 2024, 2025], ["Asha", 12, 14], ["Ravi", 9, 11]] }]);
    expect(p.found).toBe(0);
  });

  it("a title with a year does not hide the real heading below it", () => {
    const p = parseStatements([{ name: "x", rows: [[null, "Balance Sheet as at 31st March 2025"], ["Particulars", "31.03.2025", "31.03.2024"], ["Net worth", 10, 8]] }]);
    expect(p.years.map((y) => y.netWorth)).toEqual([10, 8]);
  });

  it("keeps at most the newest three years", () => {
    const p = parseStatements([{ name: "x", rows: [["Particulars", "FY22", "FY23", "FY24", "FY25"], ["Net Sales", 1, 2, 3, 4]] }]);
    expect(p.years.map((y) => y.revenue)).toEqual([4, 3, 2]);
  });

  it("refuses what it cannot open", () => {
    expect(() => readSheets(new Uint8Array(0), "xlsx")).toThrow(SheetReadError);
    expect(() => readSheets(new Uint8Array([1, 2, 3]), "pdf")).toThrow(/typed|type them/i);
    expect(fileKind("Balance Sheet FY25.XLSX")).toBe("xlsx");
    expect(fileKind("accounts.pdf")).toBe("pdf");
    expect(fileKind("photo.jpg")).toBeNull();
    expect(fileKind("noextension")).toBeNull();
  });

  it("decodes base64 to the same bytes", () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37 + 11) % 256);
    for (const len of [0, 1, 2, 3, 4, 999, 1000]) {
      const part = bytes.subarray(0, len);
      expect(Array.from(base64ToBytes(Buffer.from(part).toString("base64")))).toEqual(Array.from(part));
    }
    expect(() => base64ToBytes("ab*d")).toThrow(SheetReadError);
  });
});

describe("health report", () => {
  const year = (label: string, v: Partial<YearFigures>): YearFigures => ({ ...emptyYear(label), ...v });
  const full = [
    year("FY 2024-25", { revenue: 52, ebitda: 7.95, pat: 4.805, netWorth: 17.505, borrowings: 10, currentAssets: 18, currentLiabilities: 9, intangibles: 0.25, financeCost: 0.95 }),
    year("FY 2023-24", { revenue: 41, ebitda: 5.95, pat: 3.2, netWorth: 13.2, borrowings: 11, currentAssets: 15, currentLiabilities: 8, intangibles: 0.3, financeCost: 1.1 }),
    year("FY 2022-23", { revenue: 32, ebitda: 0.8, pat: 0.4, netWorth: 10 }),
  ];
  const ratio = (r: ReturnType<typeof buildHealthReport>, key: string) => r.ratios.find((x) => x.key === key)!;

  it("works out every ratio by the stated formula", () => {
    const r = buildHealthReport(full);
    expect(ratio(r, "revenueGrowth").value).toBe(26.8); // 52 / 41 − 1
    expect(ratio(r, "revenueCagr").value).toBe(27.5); // √(52 / 32) − 1
    expect(ratio(r, "ebitdaMargin").value).toBe(15.3);
    expect(ratio(r, "patMargin").value).toBe(9.2);
    expect(ratio(r, "returnOnNetWorth").value).toBe(27.4);
    expect(ratio(r, "debtToEquity").value).toBe(0.57);
    expect(ratio(r, "currentRatio").value).toBe(2);
    expect(ratio(r, "interestCover").value).toBe(8.4);
    expect(r.year).toBe("FY 2024-25");
    expect(r.warnings).toEqual([]);
  });

  it("checks the SME limits", () => {
    const r = buildHealthReport(full);
    expect(r.checks.map((c) => c.ok)).toEqual([true, true, true, true, true]);
    expect(r.met).toBe(5);
    expect(netTangibleAssets(full[0])).toBe(17.26);
    // limits come from the business rules: a stricter rule changes the result
    const strict = buildHealthReport(full, { ...DEFAULT_ELIGIBILITY_LIMITS, ntaMinCr: 20, leverageMax: 0.5, opProfitMinYears: 3 });
    expect(strict.checks.map((c) => c.ok)).toEqual([true, false, false, true, false]);
    expect(strict.checks[1].label).toContain("₹20 Cr");
  });

  it("says 'not specified' instead of guessing", () => {
    const r = buildHealthReport([year("FY 2024-25", { revenue: 20, pat: 1 })]);
    expect(ratio(r, "patMargin").value).toBe(5);
    expect(ratio(r, "revenueGrowth").missing).toBe("Needs two years of revenue");
    expect(ratio(r, "debtToEquity").value).toBeNull();
    expect(ratio(r, "debtToEquity").missing).toBe("Not specified: total borrowings, net worth");
    expect(r.checks.every((c) => c.ok === null)).toBe(true);
    expect(r.unknown).toBe(5);
    const empty = buildHealthReport([]);
    expect(empty.ratios.every((x) => x.value === null)).toBe(true);
    expect(empty.checks.every((c) => c.ok === null)).toBe(true);
  });

  it("net worth check needs both years to pass, one year to fail", () => {
    const one = buildHealthReport([year("a", { netWorth: 5 })]);
    expect(one.checks[0].ok).toBeNull();
    const low = buildHealthReport([year("a", { netWorth: 0.4 })]);
    expect(low.checks[0].ok).toBe(false);
    const prevLow = buildHealthReport([year("a", { netWorth: 5 }), year("b", { netWorth: 0.2 })]);
    expect(prevLow.checks[0].ok).toBe(false);
  });

  it("operating profit in 2 of 3 years: decided only when the missing years cannot change it", () => {
    const check = (e: (number | null)[]) => buildHealthReport(e.map((v, i) => year(`y${i}`, { ebitda: v }))).checks[2].ok;
    expect(check([2, 3])).toBe(true);
    expect(check([2, 0.5, 0.2])).toBe(false);
    expect(check([2])).toBeNull(); // two more years could still pass or fail
    expect(check([0.5, 0.2])).toBe(false); // one unknown year cannot make two
    expect(check([0.5, null, 3])).toBeNull();
  });

  it("handles a company with losses and negative net worth without dividing by it", () => {
    const r = buildHealthReport([year("a", { revenue: 10, ebitda: -1, pat: -2, netWorth: -3, borrowings: 6, currentAssets: 2, currentLiabilities: 0, financeCost: 0 })]);
    expect(ratio(r, "patMargin").value).toBe(-20);
    expect(ratio(r, "returnOnNetWorth").value).toBeNull();
    expect(ratio(r, "returnOnNetWorth").missing).toBe("Net worth is not positive");
    expect(ratio(r, "debtToEquity").value).toBeNull();
    expect(ratio(r, "currentRatio").value).toBeNull();
    expect(ratio(r, "interestCover").missing).toBe("No finance cost in the latest year");
    expect(r.checks[0].ok).toBe(false);
    expect(r.checks[3].ok).toBe(false);
    expect(r.checks[4].ok).toBe(false); // borrowings with no positive net worth
    for (const x of r.ratios) expect(x.value === null || Number.isFinite(x.value)).toBe(true);
  });

  it("warns about likely unit or typing mistakes", () => {
    const r = buildHealthReport([year("FY 2024-25", { revenue: 5200000, pat: 6000000 })]);
    expect(r.warnings.some((w) => w.includes("change the unit"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("larger than revenue"))).toBe(true);
  });

  it("cleans stored figures", () => {
    expect(sanitizeFigures("x")).toEqual([]);
    const s = sanitizeFigures([{ label: "FY", revenue: "12", pat: Number.NaN, netWorth: 3, extra: 1 }, null, {}, {}, {}]);
    expect(s.length).toBe(3);
    expect(s[0].revenue).toBeNull();
    expect(s[0].pat).toBeNull();
    expect(s[0].netWorth).toBe(3);
    expect("extra" in s[0]).toBe(false);
  });

  it("the wording never recommends or grades", () => {
    const r = buildHealthReport(full);
    const text = JSON.stringify([r, healthPayload(full, r, "file"), healthMessage(r)]).toLowerCase();
    for (const word of ["should", "recommend", "good", "bad", "strong", "weak", "healthy", "poor", "excellent", "grade", "rating", "score", "invest"]) expect(text).not.toMatch(new RegExp(`\\b${word}`));
    expect(healthMessage(r)).toBe("Balance sheet check (FY 2024-25): 5 of 5 SME rule checks met, 0 not met, 0 not specified.");
    expect(healthPayload(full, r, "typed")["Figures from"]).toBe("Typed by the user");
  });

  it("a parsed file goes straight into a report", () => {
    const p = parseStatements(file(SCHEDULE_III, "xlsx"));
    const r = buildHealthReport(toCrore(p.years, p.unit!));
    expect(ratio(r, "revenueGrowth").value).toBe(26.8);
    expect(ratio(r, "debtToEquity").value).toBe(0.57);
    expect(r.checks[1].detail).toBe("Net worth less intangible assets: ₹17.26 Cr");
  });
});

describe("saved reports", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const saved = require("@/features/business/healthSaved") as typeof import("@/features/business/healthSaved");
  const U = "11111111-1111-4111-8111-111111111111";
  const R = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const row = (over: Record<string, unknown> = {}) => ({ id: R, file_path: `${U}/${R}.xlsx`, file_name: "FY25 accounts.xlsx", file_size: 20480, file_kind: "xlsx", figures: [{ label: "FY 2024-25", revenue: 52, pat: "x" }], figures_source: "file", created_at: "2026-11-16T05:00:00Z", expires_at: "2027-02-14T05:00:00Z", ...over });

  it("reads a saved report and cleans its figures", () => {
    const r = saved.parseSavedReport(row())!;
    expect(r.fileKind).toBe("xlsx");
    expect(r.figures[0].revenue).toBe(52);
    expect(r.figures[0].pat).toBeNull();
    expect(saved.parseSavedReport(row({ figures_source: "typed" }))!.figuresSource).toBe("typed");
  });

  it("drops rows it cannot trust", () => {
    for (const bad of [null, "x", row({ id: "1" }), row({ file_path: `${U}/${R}.exe` }), row({ file_name: "" }), row({ expires_at: "soon" }), row({ created_at: 5 })]) expect(saved.parseSavedReport(bad)).toBeNull();
    expect(saved.parseSavedReports([row(), null, row({ id: "bad" })]).length).toBe(1);
    expect(saved.parseSavedReports("nope")).toEqual([]);
  });

  it("builds the only path the storage policy allows, and ids of the right shape", () => {
    expect(saved.reportPath(U, R, "pdf")).toBe(`${U}/${R}.pdf`);
    expect(() => saved.reportPath("../etc", R, "pdf")).toThrow();
    expect(() => saved.reportPath(U, "x/y", "csv")).toThrow();
    const serverPath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$/; // the check constraint in the migration
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = saved.newReportId();
      ids.add(id);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(saved.reportPath(U, id, "xlsx")).toMatch(serverPath);
    }
    expect(ids.size).toBe(200);
  });

  it("counts the days left", () => {
    const now = new Date("2026-11-16T05:00:00Z");
    expect(saved.daysLeft("2027-02-14T05:00:00Z", now)).toBe(90);
    expect(saved.daysLeft("2026-11-16T23:00:00Z", now)).toBe(0);
    expect(saved.daysLeft("2026-01-01T00:00:00Z", now)).toBe(0);
    expect(saved.daysLeft("junk", now)).toBe(0);
    expect(saved.fileSizeLabel(20480)).toBe("20 KB");
    expect(saved.fileSizeLabel(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(saved.fileSizeLabel(0)).toBe("");
  });

  it("explains why saving failed", () => {
    expect(saved.classifySaveError({ message: "REPORT_LIMIT", hint: "…" })).toBe("limit");
    expect(saved.classifySaveError({ code: "PGRST205", message: "Could not find the table 'public.balance_sheet_reports' in the schema cache" })).toBe("not_set_up");
    expect(saved.classifySaveError({ message: "Bucket not found", statusCode: "404" })).toBe("not_set_up");
    expect(saved.classifySaveError({ message: "The object exceeded the maximum allowed size", statusCode: "413" })).toBe("too_large");
    expect(saved.classifySaveError({ message: "mime type image/png is not supported", statusCode: "415" })).toBe("file_type");
    expect(saved.classifySaveError({ message: "Network request failed" })).toBe("offline");
    expect(saved.classifySaveError({ message: "new row violates row-level security policy" })).toBe("failed");
    expect(saved.classifySaveError(null)).toBe("failed");
    for (const text of Object.values(saved.SAVE_FAILURE_TEXT)) expect(text.length).toBeGreaterThan(10);
  });

  it("the consent says where the file goes, who sees it, for how long and how to delete it", () => {
    const text = saved.BALANCE_SHEET_CONSENT.join(" ");
    expect(text).toMatch(/stored on Be IPO Ready's servers/);
    expect(text).toMatch(/advisory team can open them/);
    expect(text).toMatch(/90 days/);
    expect(text).toMatch(/delete them sooner/);
    expect(text).toMatch(/never sold/);
    expect(saved.RETENTION_DAYS).toBe(90); // must match the migration's `interval '90 days'`
    expect(saved.HEALTH_DISCLAIMER).toMatch(/not a grade, an audit, an eligibility decision or advice/);
  });

  it("the migration agrees with the app on the bucket, the limit and the retention", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("path") as typeof import("path");
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261116000100_balance_sheets.sql"), "utf8");
    expect(sql).toContain(`'${saved.BALANCE_SHEET_BUCKET}'`);
    expect(sql).toContain(`interval '${saved.RETENTION_DAYS} days'`);
    expect(sql).toContain(`v_count >= ${saved.MAX_SAVED_REPORTS}`);
    expect(sql).toContain("10485760");
    expect(sql).toContain("'balance-sheet-check'");
  });
});
