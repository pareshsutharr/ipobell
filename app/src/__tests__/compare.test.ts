import { describe, expect, it } from "@jest/globals";

import { addSlug, buildComparison, latestFullYear, MAX_COMPARE, parseSlugs, removeSlug, unitOf, type CompareItem } from "@/features/ipos/compare";
import type { FinancialRow, Ipo } from "@/features/ipos/types";

const fin = (period: string, order: number, over: Partial<FinancialRow> = {}): FinancialRow => ({ id: `${period}-${order}`, ipo_id: "x", period, period_order: order, revenue: null, total_income: null, profit: null, net_worth: null, total_assets: null, total_borrowing: null, reserves: null, ebitda: null, raw: {}, ...over });

const ipo = (over: Partial<Ipo>): Ipo =>
  ({
    id: over.slug ?? "id", slug: "acme", name: "Acme Ltd", display_name: null, board: "sme", sub_type: "NSE SME", status: "listed", dates_tba: false, open_date: "2026-09-01", close_date: "2026-09-03",
    issue_size_cr: 30, price_band: "95-100", lot_size: 1200, min_investment: 120000, gmp: 12, gmp_percent: 12, sub_total: 45.2, sub_retail: 30.1, sub_nii: 60, sub_qib: 12.5,
    listing_price: 118, listing_gain_percent: 18, current_gain_percent: 25.5, kpis: [{ key: "pe", label: "P/E Ratio", value: "13.03" }, { key: "roce", label: "RoCE", value: "19.06%" }],
    financials: { unit: "Rs crore" }, ...over,
  }) as unknown as Ipo;

describe("choosing IPOs", () => {
  it("reads slugs from the route: trimmed, unique, at most three", () => {
    expect(parseSlugs("a, b ,a,,c,d")).toEqual(["a", "b", "c"]);
    expect(parseSlugs(undefined)).toEqual([]);
    expect(parseSlugs("")).toEqual([]);
    expect(parseSlugs(["a", "b"])).toEqual(["a", "b"]);
  });

  it("adds up to the limit and never twice", () => {
    expect(addSlug(["a"], "b")).toEqual(["a", "b"]);
    expect(addSlug(["a", "b"], "a")).toEqual(["a", "b"]);
    const full = ["a", "b", "c"];
    expect(full.length).toBe(MAX_COMPARE);
    expect(addSlug(full, "d")).toBe(full);
    expect(removeSlug(full, "b")).toEqual(["a", "c"]);
  });
});

describe("which financial year is compared", () => {
  it("prefers the latest full year over a newer part-year", () => {
    const rows = [fin("30 Sep 2025", 0), fin("31 Mar 2025", 1), fin("31 Mar 2024", 2)];
    expect(latestFullYear(rows)?.period).toBe("31 Mar 2025");
  });

  it("understands the other date spellings in the feed", () => {
    expect(latestFullYear([fin("Dec 31, 2025", 0), fin("Mar 31, 2025", 1)])?.period).toBe("Mar 31, 2025");
    expect(latestFullYear([fin("31st March 2025", 1), fin("30 June 2025", 0)])?.period).toBe("31st March 2025");
  });

  it("falls back to the newest period when there is no March year-end, whatever the input order", () => {
    expect(latestFullYear([fin("Dec 31, 2024", 1), fin("Dec 31, 2025", 0)])?.period).toBe("Dec 31, 2025");
    expect(latestFullYear([])).toBeNull();
    expect(latestFullYear(undefined)).toBeNull();
  });
});

describe("the comparison table", () => {
  const a: CompareItem = { ipo: ipo({ slug: "a", name: "Alpha" }), financials: [fin("30 Sep 2025", 0, { total_income: 40, profit: 4 }), fin("31 Mar 2025", 1, { total_income: 62.5, profit: 8.03, net_worth: 34.19, total_borrowing: 9.79 })] };
  const b: CompareItem = {
    ipo: ipo({ slug: "b", name: "Beta", board: "mainboard", sub_type: "Equity", status: "upcoming", dates_tba: true, issue_size_cr: 1200, price_band: null, gmp: null, gmp_percent: null, sub_total: null, sub_retail: null, sub_nii: null, sub_qib: null, listing_price: null, listing_gain_percent: null, current_gain_percent: null, kpis: [{ key: "pe", label: "P/E", value: "28.4" }] }),
    financials: [fin("Mar 31, 2025", 0, { revenue: 6291, profit: 162.39, total_borrowing: 1303.22 })],
  };
  const row = (c: ReturnType<typeof buildComparison>, label: string) => c.sections.flatMap((s) => s.rows).find((r) => r.label === label);

  it("puts each figure in the right column", () => {
    const c = buildComparison([a, b]);
    expect(row(c, "Board")?.values).toEqual(["NSE SME", "Mainboard"]);
    expect(row(c, "Issue size")?.values).toEqual(["₹30 Cr", "₹1,200 Cr"]);
    expect(row(c, "Dates")?.values[1]).toBe("To be announced");
    expect(row(c, "P/E ratio")?.values).toEqual(["13.03", "28.4"]);
    expect(row(c, "RoCE")?.values).toEqual(["19.06%", "—"]);
    expect(row(c, "Subscription, total")?.values).toEqual(["45.2x", "—"]);
    expect(row(c, "Listing-day gain")?.values).toEqual(["+18.00%", "—"]);
  });

  it("uses each company's full year, and total income when revenue is not reported", () => {
    const c = buildComparison([a, b]);
    expect(row(c, "Period")?.values).toEqual(["31 Mar 2025", "Mar 31, 2025"]);
    expect(row(c, "Revenue")?.values).toEqual(["62.5", "6,291"]);
    expect(row(c, "Profit after tax")?.values).toEqual(["8.03", "162.39"]);
    expect(row(c, "Total borrowing")?.values).toEqual(["9.79", "1,303.22"]);
    expect(row(c, "Net worth")?.values).toEqual(["34.19", "—"]);
    expect(row(c, "Revenue")?.note).toBe("₹ crore");
    expect(c.unitsDiffer).toBe(false);
  });

  it("when units differ, every financial figure carries its own unit", () => {
    const lakh: CompareItem = { ipo: ipo({ slug: "l", financials: { unit: "Rs lakh" } }), financials: [fin("31 Mar 2025", 0, { revenue: 4500, profit: 320 })] };
    const c = buildComparison([a, lakh]);
    expect(c.unitsDiffer).toBe(true);
    expect(row(c, "Revenue")?.values).toEqual(["62.5 (₹ crore)", "4,500 (₹ lakh)"]);
    expect(row(c, "Revenue")?.note).toMatch(/Units differ/);
    expect(unitOf(lakh.ipo)).toBe("₹ lakh");
  });

  it("drops rows and sections where nothing is known", () => {
    const bare = (slug: string): CompareItem => ({ ipo: ipo({ slug, kpis: [], gmp: null, gmp_percent: null, sub_total: null, sub_retail: null, sub_nii: null, sub_qib: null, listing_price: null, listing_gain_percent: null, current_gain_percent: null }), financials: [] });
    const c = buildComparison([bare("x"), bare("y")]);
    expect(c.sections.map((s) => s.title)).toEqual(["The issue"]);
  });

  it("financials still loading (undefined) shows dashes, not a crash", () => {
    const c = buildComparison([{ ipo: a.ipo, financials: undefined }, b]);
    expect(row(c, "Revenue")?.values).toEqual(["—", "6,291"]);
  });

  it("handles three IPOs", () => {
    const c = buildComparison([a, b, a]);
    for (const s of c.sections) for (const r of s.rows) expect(r.values.length).toBe(3);
  });

  it("never ranks or recommends", () => {
    const text = JSON.stringify(buildComparison([a, b]));
    expect(text).not.toMatch(/\b(best|better|winner|buy|avoid|recommend)/i);
  });
});
