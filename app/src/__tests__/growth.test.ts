import { describe, expect, it } from "@jest/globals";

import { analyseGrowth, cagr, cagrNote, fullYears, growthSentence, periodYear, yoy } from "@/features/ipos/growth";
import type { FinancialRow } from "@/features/ipos/types";

const fin = (period: string, order: number, revenue: number | null, profit: number | null, over: Partial<FinancialRow> = {}): FinancialRow => ({ id: `${period}-${order}`, ipo_id: "x", period, period_order: order, revenue, total_income: null, profit, net_worth: null, total_assets: null, total_borrowing: null, reserves: null, ebitda: null, raw: {}, ...over });

describe("reading periods", () => {
  it("finds the year in every spelling the feed uses", () => {
    expect(periodYear("31 Mar 2025")).toBe(2025);
    expect(periodYear("Mar 31, 2024")).toBe(2024);
    expect(periodYear("\t30 Sep 2025\t")).toBe(2025);
    expect(periodYear("30 JUN 25")).toBe(2025);
    expect(periodYear("30 Jun 2025b")).toBe(2025);
    expect(periodYear("Latest")).toBeNull();
  });

  it("keeps full years only, oldest first, one per year", () => {
    const rows = [fin("30 Sep 2025", 0, 40, 4), fin("31 Mar 2025", 1, 100, 10), fin("31 Mar 2024", 2, 80, 6), fin("31 Mar 2023", 3, 50, 2), fin("31 Mar 2025", 4, 999, 999)];
    const pts = fullYears(rows);
    expect(pts.map((p) => p.year)).toEqual([2023, 2024, 2025]);
    expect(pts.map((p) => p.revenue)).toEqual([50, 80, 100]);
    expect(pts[2].margin).toBe(10);
  });

  it("uses total income when revenue is not reported", () => {
    const pts = fullYears([fin("31 Mar 2025", 0, null, 8, { total_income: 62.5 })]);
    expect(pts[0].revenue).toBe(62.5);
    expect(pts[0].margin).toBe(12.8);
  });

  it("no data gives no points", () => {
    expect(fullYears(undefined)).toEqual([]);
    expect(fullYears([])).toEqual([]);
    expect(fullYears([fin("30 Sep 2025", 0, 40, 4)])).toEqual([]);
  });
});

describe("CAGR", () => {
  it("matches a hand calculation", () => {
    // 50 → 100 over 2 years: sqrt(2) - 1 = 41.42%
    expect(cagr(50, 100, 2)).toMatchObject({ value: 41.4, reason: "ok" });
    // 100 → 133.1 over 3 years = 10%
    expect(cagr(100, 133.1, 3).value).toBe(10);
    // one year is simple growth
    expect(cagr(80, 100, 1).value).toBe(25);
    // decline: 100 → 64 over 2 years = -20%
    expect(cagr(100, 64, 2).value).toBe(-20);
    expect(cagr(100, 100, 3).value).toBe(0);
  });

  it("refuses to invent a number when the maths has no meaning", () => {
    expect(cagr(-5, 20, 2)).toMatchObject({ value: null, reason: "base_not_positive" });
    expect(cagr(0, 20, 2)).toMatchObject({ value: null, reason: "base_not_positive" });
    expect(cagr(20, -3, 2)).toMatchObject({ value: null, reason: "turned_negative" });
    expect(cagr(null, 20, 2)).toMatchObject({ value: null, reason: "missing" });
    expect(cagr(20, 30, 0)).toMatchObject({ value: null, reason: "too_few_years" });
  });

  it("year on year", () => {
    expect(yoy(80, 100)).toBe(25);
    expect(yoy(100, 64)).toBe(-36);
    expect(yoy(0, 10)).toBeNull();
    expect(yoy(-4, 10)).toBeNull();
    expect(yoy(null, 10)).toBeNull();
  });
});

describe("analysis of one IPO", () => {
  const rows = [fin("30 Sep 2025", 0, 70, 9), fin("31 Mar 2025", 1, 100, 12), fin("31 Mar 2024", 2, 80, 6), fin("31 Mar 2023", 3, 50, 2)];

  it("three full years, part-year ignored", () => {
    const a = analyseGrowth(rows);
    expect(a.points.length).toBe(3);
    expect(a.span).toBe("FY23 to FY25");
    expect(a.revenue).toMatchObject({ value: 41.4, years: 2, from: 50, to: 100 });
    expect(a.profit).toMatchObject({ value: 144.9, years: 2, from: 2, to: 12 }); // sqrt(6) - 1
    expect(a.marginChange).toBe(8); // 4% → 12%
    expect(growthSentence(a)).toBe("From FY23 to FY25, revenue grew 41.4% a year and profit grew 144.9% a year, and the profit margin widened by 8 points.");
  });

  it("a gap in the years uses the real number of years, not the number of rows", () => {
    const a = analyseGrowth([fin("31 Mar 2025", 0, 121, 10), fin("31 Mar 2023", 1, 100, 10)]);
    expect(a.revenue).toMatchObject({ value: 10, years: 2 });
  });

  it("loss to profit is described in words, with no CAGR", () => {
    const a = analyseGrowth([fin("31 Mar 2025", 0, 100, 5), fin("31 Mar 2024", 1, 80, -3)]);
    expect(a.profit).toMatchObject({ value: null, reason: "base_not_positive" });
    expect(cagrNote(a.profit, "profit")).toBe("Loss in the first year");
    expect(growthSentence(a)).toBe("From FY24 to FY25, revenue grew 25% a year and the company moved from a loss to a profit, and the profit margin widened by 8.8 points.");
  });

  it("profit to loss", () => {
    const a = analyseGrowth([fin("31 Mar 2025", 0, 90, -4), fin("31 Mar 2024", 1, 100, 6)]);
    expect(cagrNote(a.profit, "profit")).toBe("Loss in the latest year");
    expect(growthSentence(a)).toMatch(/revenue fell 10% a year and the company moved from a profit to a loss/);
  });

  it("one full year, or none: no growth figures and no sentence", () => {
    const one = analyseGrowth([fin("31 Mar 2025", 0, 100, 5), fin("30 Sep 2025", 1, 60, 3)]);
    expect(one.revenue).toMatchObject({ value: null, reason: "too_few_years" });
    expect(cagrNote(one.revenue, "revenue")).toBe("Needs two full years");
    expect(growthSentence(one)).toBeNull();
    expect(analyseGrowth(undefined).points).toEqual([]);
    expect(growthSentence(analyseGrowth([]))).toBeNull();
  });

  it("profit not reported in the first year uses the years that have it", () => {
    const a = analyseGrowth([fin("31 Mar 2025", 0, 100, 12), fin("31 Mar 2024", 1, 80, 6), fin("31 Mar 2023", 2, 50, null)]);
    expect(a.revenue.years).toBe(2);
    expect(a.profit).toMatchObject({ value: 100, years: 1, from: 6, to: 12 });
  });

  it("never gives advice", () => {
    expect(growthSentence(analyseGrowth(rows))).not.toMatch(/\b(buy|sell|subscribe|avoid|good|bad|strong|weak|attractive)\b/i);
  });
});

describe("figures from real prospectuses match a separate hand calculation", () => {
  // Year-end figures read from the live database on 14 Nov 2026 and worked out independently (outside the app).
  const cases: [string, FinancialRow[], number, number][] = [
    ["FY21 to FY23, with a newer half-year present", [fin("30 Sep 2023", 0, null, 2.65, { total_income: 616.32 }), fin("31 Mar 2023", 1, null, 31.97, { total_income: 1540.25 }), fin("31 Mar 2022", 2, null, 17.43, { total_income: 927.34 }), fin("31 Mar 2021", 3, null, 7.8, { total_income: 739.66 })], 44.3, 102.5],
    ["FY22 to FY24", [fin("31 Mar 2024", 0, 402.49, 18.3), fin("31 Mar 2023", 1, 300, 9), fin("31 Mar 2022", 2, 195.05, 1.64)], 43.6, 234],
    ["FY24 to FY26", [fin("31 Mar 2026", 0, 50.73, 4.06), fin("31 Mar 2025", 1, 49, 3), fin("31 Mar 2024", 2, 48.24, 1.7)], 2.5, 54.5],
    ["FY21 to FY23", [fin("31 Mar 2023", 0, 1398.54, 112.37), fin("31 Mar 2022", 1, 1200, 60), fin("31 Mar 2021", 2, 1129.84, 21.12)], 11.3, 130.7],
  ];
  it.each(cases)("%s", (_label, rows, revenueCagr, profitCagr) => {
    const a = analyseGrowth(rows);
    expect(a.revenue.value).toBe(revenueCagr);
    expect(a.profit.value).toBe(profitCagr);
    expect(a.revenue.years).toBe(2);
  });
});

