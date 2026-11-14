import { describe, expect, it } from "@jest/globals";

import { compareCompany, formatMetric, MIN_PEERS, parsePeer, positionLabel, quantile, spread, valuationRange, type Peer } from "@/features/business/peers";
import { DEFAULT_ISSUE_SIZE_RULES } from "@/features/business/tools";

const peer = (over: Partial<Peer>): Peer => ({ slug: "p", name: "Peer", board: "sme", status: "listed", listingDate: null, pe: null, patMargin: null, roce: null, ronw: null, debtEquity: null, period: null, revenue: null, profit: null, netWorth: null, totalBorrowing: null, ...over });

describe("reading peers from the database", () => {
  it("numbers may arrive as strings; missing stays null", () => {
    const p = parsePeer({ slug: "tex-a", name: "Tex A", board: "sme", status: "listed", listing_date: "2026-06-01", pe: "12.5", pat_margin: 8.2, roce: null, ronw: undefined, debt_equity: "0.8", period: "31 Mar 2025", revenue: "100.00", profit: "8.20", net_worth: 26, total_borrowing: 10 });
    expect(p).toMatchObject({ slug: "tex-a", pe: 12.5, patMargin: 8.2, roce: null, ronw: null, debtEquity: 0.8, revenue: 100, profit: 8.2 });
    expect(parsePeer({}).pe).toBeNull();
  });
});

describe("quartiles (same method as Excel PERCENTILE.INC)", () => {
  it("matches hand-worked values", () => {
    // 10, 12, 15, 20, 30 → Q1 12, median 15, Q3 20
    expect(spread([30, 10, 20, 12, 15])).toEqual({ n: 5, low: 12, median: 15, high: 20, min: 10, max: 30 });
    // 10, 20, 30, 40 → Q1 17.5, median 25, Q3 32.5
    expect(spread([10, 20, 30, 40])).toMatchObject({ low: 17.5, median: 25, high: 32.5 });
    expect(quantile([7], 0.25)).toBe(7);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("ignores unknown values", () => {
    expect(spread([null, 10, null, 20]).n).toBe(2);
    expect(spread([null, null])).toEqual({ n: 0, low: null, median: null, high: null, min: null, max: null });
  });
});

describe("valuation range", () => {
  const peers = [peer({ pe: 10 }), peer({ pe: 12 }), peer({ pe: 15 }), peer({ pe: 20 }), peer({ pe: 30 }), peer({ pe: null }), peer({ pe: -4 })];

  it("rule method: profit × sector multiple, less and plus the band", () => {
    // Manufacturing 15×, band 10%: PAT 5 → 75 (67.5 to 82.5)
    const r = valuationRange(5, "Manufacturing / Engineering", DEFAULT_ISSUE_SIZE_RULES, []);
    expect(r?.byRule).toEqual({ low: 67.5, high: 82.5, mid: 75, multipleLow: 13.5, multipleHigh: 16.5 });
    expect(r?.byPeers).toBeNull();
    expect(r?.overlap).toBeNull();
  });

  it("peer method: profit × the middle half of peer P/E; loss-making peers are left out", () => {
    const r = valuationRange(5, "Manufacturing / Engineering", DEFAULT_ISSUE_SIZE_RULES, peers);
    expect(r?.peersWithPe).toBe(5);
    expect(r?.peerCount).toBe(7);
    expect(r?.byPeers).toEqual({ low: 60, high: 100, mid: 75, multipleLow: 12, multipleHigh: 20 });
    expect(r?.overlap).toEqual({ low: 67.5, high: 82.5 });
  });

  it("no overlap is reported as none, not forced", () => {
    const cheap = [peer({ pe: 4 }), peer({ pe: 5 }), peer({ pe: 6 })];
    const r = valuationRange(5, "Manufacturing / Engineering", DEFAULT_ISSUE_SIZE_RULES, cheap);
    expect(r?.byPeers).toMatchObject({ low: 22.5, high: 27.5 });
    expect(r?.overlap).toBeNull();
  });

  it("fewer than three peers with a P/E: no peer range", () => {
    expect(MIN_PEERS).toBe(3);
    const r = valuationRange(5, "Manufacturing / Engineering", DEFAULT_ISSUE_SIZE_RULES, [peer({ pe: 10 }), peer({ pe: 20 })]);
    expect(r?.byPeers).toBeNull();
    expect(r?.peersWithPe).toBe(2);
  });

  it("no answer without a profit or a sector; a loss gives no valuation", () => {
    expect(valuationRange(null, "Other", DEFAULT_ISSUE_SIZE_RULES, [])).toBeNull();
    expect(valuationRange(0, "Other", DEFAULT_ISSUE_SIZE_RULES, [])).toBeNull();
    expect(valuationRange(-3, "Other", DEFAULT_ISSUE_SIZE_RULES, [])).toBeNull();
    expect(valuationRange(5, null, DEFAULT_ISSUE_SIZE_RULES, [])).toBeNull();
    expect(valuationRange(5, "Unknown sector", DEFAULT_ISSUE_SIZE_RULES, [])?.byRule).toBeNull();
  });

  it("agrees with the issue size calculator for the same inputs (no growth premium)", () => {
    const r = valuationRange(5, "Manufacturing / Engineering", DEFAULT_ISSUE_SIZE_RULES, []);
    // calcIssueSize(5, Manufacturing, null) gives marketCap 75, low 67.5, high 82.5
    expect([r?.byRule?.mid, r?.byRule?.low, r?.byRule?.high]).toEqual([75, 67.5, 82.5]);
  });
});

describe("compare my company", () => {
  const peers = [
    peer({ revenue: 50, profit: 4, patMargin: 8, debtEquity: 0.5 }),
    peer({ revenue: 80, profit: 8, patMargin: 10, debtEquity: 1 }),
    peer({ revenue: 120, profit: 15, patMargin: 12.5, debtEquity: 1.5 }),
    peer({ revenue: 200, profit: 30, patMargin: null, debtEquity: null, netWorth: 100, totalBorrowing: 200 }), // margin 15, d/e 2 worked out
    peer({ revenue: null, profit: null }),
  ];
  const row = (rows: ReturnType<typeof compareCompany>, key: string) => rows.find((r) => r.key === key)!;

  it("works out your margins and leverage and places them against the peers' middle half", () => {
    const rows = compareCompany({ revenue: 100, ebitda: 18, pat: 9, debt: 30, netWorth: 40 }, peers);
    expect(row(rows, "revenue")).toMatchObject({ yours: 100, position: "in_line" }); // peers 50,80,120,200 → Q1 72.5, Q3 140
    expect(row(rows, "revenue").peers).toMatchObject({ n: 4, low: 72.5, median: 100, high: 140 });
    expect(row(rows, "pat_margin")).toMatchObject({ yours: 9, position: "below" }); // margins 8,10,12.5,15 → Q1 9.5
    expect(row(rows, "debt_equity")).toMatchObject({ yours: 0.75, position: "below", lowerIsLighter: true }); // 0.5,1,1.5,2 → Q1 0.875
    expect(row(rows, "ebitda_margin")).toMatchObject({ yours: 18, position: null });
    expect(positionLabel(row(rows, "ebitda_margin"))).toBe("No peer figure");
    expect(positionLabel(row(rows, "revenue"))).toBe("In line with peers");
    expect(positionLabel(row(rows, "pat_margin"))).toBe("Below most peers");
  });

  it("above the peers' top quarter", () => {
    const rows = compareCompany({ revenue: 500, ebitda: null, pat: 100, debt: null, netWorth: null }, peers);
    expect(row(rows, "revenue").position).toBe("above");
    expect(row(rows, "pat_margin")).toMatchObject({ yours: 20, position: "above" });
    expect(row(rows, "debt_equity").yours).toBeNull();
    expect(positionLabel(row(rows, "debt_equity"))).toBe("Enter your figures");
  });

  it("too few peers: figures are shown but no position is claimed", () => {
    const rows = compareCompany({ revenue: 100, ebitda: null, pat: 9, debt: 10, netWorth: 40 }, peers.slice(0, 2));
    expect(row(rows, "revenue").position).toBeNull();
    expect(positionLabel(row(rows, "revenue"))).toBe("Only 2 peers with this figure");
    expect(compareCompany({ revenue: 100, ebitda: null, pat: 9, debt: 10, netWorth: 40 }, undefined).every((r) => r.position === null)).toBe(true);
  });

  it("zero or negative net worth and zero revenue give no ratio, not infinity", () => {
    const rows = compareCompany({ revenue: 0, ebitda: 5, pat: 2, debt: 10, netWorth: 0 }, peers);
    expect(row(rows, "pat_margin").yours).toBeNull();
    expect(row(rows, "ebitda_margin").yours).toBeNull();
    expect(row(rows, "debt_equity").yours).toBeNull();
  });

  it("formats figures", () => {
    expect(formatMetric(120.456, "cr")).toBe("₹120.5 Cr");
    expect(formatMetric(12.34, "pct")).toBe("12.3%");
    expect(formatMetric(0.875, "ratio")).toBe("0.88");
    expect(formatMetric(null, "cr")).toBe("—");
  });

  it("uses positions, never verdicts", () => {
    const rows = compareCompany({ revenue: 100, ebitda: 18, pat: 9, debt: 30, netWorth: 40 }, peers);
    for (const r of rows) expect(positionLabel(r)).not.toMatch(/\b(good|bad|strong|weak|better|worse|healthy)\b/i);
  });
});
