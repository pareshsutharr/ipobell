/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { ALL_OFF, parseSwitches } from "@/features/flags/switches";
import { bandsText, computeDataScore, DATA_SCORE_LABEL, DATA_SCORE_NOTE, kpiNumber, MIN_PARTS, PART_MAX, pointsFor, SCORE_RULES, scoreInputs, scoreText, type PartKey, type ScoreInputs } from "@/features/ipos/dataScore";
import { MAX_PROMOTED, parsePromoted, PROMOTED_LABEL, PROMOTED_NOTE, promotedBlock } from "@/features/ipos/promoted";
import type { FinancialRow, Ipo, IpoListItem } from "@/features/ipos/types";

const rule = (k: PartKey) => SCORE_RULES.find((r) => r.key === k)!;
const inputs = (o: Partial<ScoreInputs>): ScoreInputs => ({ growth: null, margin: null, debt: null, valuation: null, sources: {}, ...o });
const fin = (period: string, order: number, o: Partial<FinancialRow>): FinancialRow => ({ id: period, ipo_id: "i", period, period_order: order, revenue: null, total_income: null, profit: null, net_worth: null, total_assets: null, total_borrowing: null, reserves: null, ebitda: null, raw: {}, ...o });
const kpis = (o: Record<string, string>) => ({ kpis: Object.entries(o).map(([key, value]) => ({ key, label: key, value })) }) as Pick<Ipo, "kpis">;

describe("feature switches", () => {
  it("everything is off unless a row says enabled: true", () => {
    expect(ALL_OFF).toEqual({ dataScore: false, promotedIpos: false });
    expect(parseSwitches(null)).toEqual(ALL_OFF);
    expect(parseSwitches("x")).toEqual(ALL_OFF);
    expect(parseSwitches([])).toEqual(ALL_OFF);
    expect(parseSwitches([{ key: "data_score", enabled: "true" }, { key: "promoted_ipos", enabled: 1 }, null, { key: "other", enabled: true }])).toEqual(ALL_OFF);
    expect(parseSwitches([{ key: "data_score", enabled: true }])).toEqual({ dataScore: true, promotedIpos: false });
    expect(parseSwitches([{ key: "data_score", enabled: false }, { key: "promoted_ipos", enabled: true }])).toEqual({ dataScore: false, promotedIpos: true });
  });

  it("the migration seeds both switches off", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261116000200_data_score_and_promoted.sql"), "utf8");
    expect(sql).toMatch(/\('data_score', false,/);
    expect(sql).toMatch(/\('promoted_ipos', false,/);
    expect(sql).not.toMatch(/\('(data_score|promoted_ipos)', true/);
    expect(sql).toContain(`limit ${MAX_PROMOTED};`);
  });
});

describe("data score formula", () => {
  it("every band edge gives the points in the table", () => {
    const cases: [PartKey, number, number][] = [
      ["growth", 45, 25], ["growth", 30, 25], ["growth", 29.9, 20], ["growth", 20, 20], ["growth", 19.9, 15], ["growth", 10, 15], ["growth", 9.9, 10], ["growth", 0, 10], ["growth", -0.1, 0], ["growth", -40, 0],
      ["margin", 22, 25], ["margin", 15, 25], ["margin", 14.9, 20], ["margin", 10, 20], ["margin", 9.9, 15], ["margin", 5, 15], ["margin", 4.9, 10], ["margin", 0.1, 10], ["margin", 0, 0], ["margin", -8, 0],
      ["debt", 0, 25], ["debt", 0.25, 25], ["debt", 0.26, 20], ["debt", 0.5, 20], ["debt", 0.51, 15], ["debt", 1, 15], ["debt", 1.01, 10], ["debt", 2, 10], ["debt", 2.01, 0], ["debt", 9, 0], ["debt", -1.5, 0],
      ["valuation", 8, 25], ["valuation", 15, 25], ["valuation", 15.1, 20], ["valuation", 25, 20], ["valuation", 25.1, 15], ["valuation", 35, 15], ["valuation", 35.1, 10], ["valuation", 50, 10], ["valuation", 50.1, 0], ["valuation", 0, 0], ["valuation", -12, 0],
    ];
    for (const [key, value, points] of cases) expect([key, value, pointsFor(rule(key), value)]).toEqual([key, value, points]);
  });

  it("a missing figure earns nothing and is not turned into a number", () => {
    for (const r of SCORE_RULES) {
      expect(pointsFor(r, null)).toBeNull();
      expect(pointsFor(r, Number.NaN)).toBeNull();
      expect(pointsFor(r, Number.POSITIVE_INFINITY)).toBeNull();
    }
  });

  it("the table is consistent: four parts of 25, best band first, points fall as the band gets worse", () => {
    expect(SCORE_RULES.map((r) => r.key)).toEqual(["growth", "margin", "debt", "valuation"]);
    for (const r of SCORE_RULES) {
      expect(r.bands[0].points).toBe(PART_MAX);
      for (let i = 1; i < r.bands.length; i++) {
        expect(r.bands[i].points).toBeLessThan(r.bands[i - 1].points);
        if (r.direction === "atLeast") expect(r.bands[i].limit).toBeLessThan(r.bands[i - 1].limit);
        else expect(r.bands[i].limit).toBeGreaterThan(r.bands[i - 1].limit);
      }
    }
  });

  it("the formula shown is the formula used", () => {
    expect(bandsText(rule("growth"))).toBe("30% or more = 25 · 20% or more = 20 · 10% or more = 15 · 0% or more = 10 · otherwise 0");
    expect(bandsText(rule("debt"))).toBe("0.25× or less = 25 · 0.5× or less = 20 · 1× or less = 15 · 2× or less = 10 · otherwise 0");
    // every number in the sentence comes from the table, so the two cannot drift apart
    for (const r of SCORE_RULES) for (const b of r.bands) expect(bandsText(r)).toContain(`${b.limit}${r.unit === "%" ? "%" : "×"} ${r.direction === "atLeast" ? "or more" : "or less"} = ${b.points}`);
  });

  it("adds the parts up", () => {
    const s = computeDataScore(inputs({ growth: 24.5, margin: 14.4, debt: 2.91, valuation: 13.03 }));
    expect(s.parts.map((p) => p.points)).toEqual([20, 20, 0, 25]);
    expect([s.points, s.max, s.available, s.enough]).toEqual([65, 100, 4, true]);
    expect(scoreText(s)).toBe("65 of 100");
    expect(s.missing).toEqual([]);
  });

  it("with one figure missing the total is out of 75, and it says which one is missing", () => {
    const s = computeDataScore(inputs({ growth: 12, margin: 6, valuation: 40 }));
    expect(s.parts[2].valueText).toBe("Not specified");
    expect(s.parts[2].points).toBeNull();
    expect([s.points, s.max, s.enough]).toEqual([40, 75, true]);
    expect(scoreText(s)).toBe("40 of 75");
    expect(s.missing).toEqual(["debt"]);
  });

  it("with fewer than three figures there is no total", () => {
    expect(MIN_PARTS).toBe(3);
    const s = computeDataScore(inputs({ growth: 50, valuation: 10 }));
    expect(s.enough).toBe(false);
    expect(computeDataScore(inputs({})).enough).toBe(false);
    expect(computeDataScore(inputs({})).points).toBe(0);
  });

  it("reads KPIs as the feed writes them", () => {
    const ipo = kpis({ pe: "13.03", pat_margin: "14.37%", debt_equity: " 2.91 ", roce: "1,204.5", eps: "N/A", nav: "" });
    expect(kpiNumber(ipo, "pe")).toBe(13.03);
    expect(kpiNumber(ipo, "pat_margin")).toBe(14.37);
    expect(kpiNumber(ipo, "debt_equity")).toBe(2.91);
    expect(kpiNumber(ipo, "roce")).toBe(1204.5);
    expect(kpiNumber(ipo, "eps")).toBeNull();
    expect(kpiNumber(ipo, "nav")).toBeNull();
    expect(kpiNumber(ipo, "missing")).toBeNull();
    expect(kpiNumber({ kpis: undefined as unknown as Ipo["kpis"] }, "pe")).toBeNull();
  });

  it("takes the four figures from the statements and the KPIs", () => {
    const rows = [
      fin("30 Sep 2025", 0, { revenue: 70, profit: 9, net_worth: 60, total_borrowing: 20 }), // part-year: ignored
      fin("31 Mar 2025", 1, { revenue: 144, profit: 18, net_worth: 50, total_borrowing: 30 }),
      fin("31 Mar 2024", 2, { revenue: 120, profit: 12 }),
      fin("31 Mar 2023", 3, { revenue: 100, profit: 8 }),
    ];
    const withKpi = scoreInputs(kpis({ pe: "18.5", debt_equity: "0.45", pat_margin: "99%" }), rows);
    expect(withKpi.growth).toBe(20); // 100 → 144 over two years
    expect(withKpi.margin).toBe(12.5); // statements win over the KPI
    expect(withKpi.debt).toBe(0.45);
    expect(withKpi.valuation).toBe(18.5);
    expect(withKpi.sources).toEqual({ growth: "Revenue, FY23 to FY25", margin: "Financial statements, 31 Mar 2025", debt: "Debt/equity as reported", valuation: "P/E as reported" });

    const noKpi = scoreInputs(kpis({}), rows);
    expect(noKpi.debt).toBe(0.6); // 30 ÷ 50, the full year, not the half-year
    expect(noKpi.sources.debt).toBe("Borrowings ÷ net worth, 31 Mar 2025");
    expect(noKpi.valuation).toBeNull();

    const nothing = scoreInputs(kpis({}), undefined);
    expect(nothing).toEqual({ growth: null, margin: null, debt: null, valuation: null, sources: {} });
    expect(scoreInputs(kpis({}), [fin("31 Mar 2025", 0, { revenue: 10, profit: 1, net_worth: -4, total_borrowing: 9 })]).debt).toBeNull(); // negative net worth: no ratio
  });

  it("is only ever called a data score, and never grades or recommends", () => {
    expect(DATA_SCORE_LABEL).toBe("Data score");
    expect(DATA_SCORE_NOTE).toMatch(/not a rating, a recommendation or advice/);
    const s = computeDataScore(inputs({ growth: 24.5, margin: 14.4, debt: 2.91, valuation: 13.03 }));
    const text = JSON.stringify([s, SCORE_RULES.map(bandsText), scoreText(s)]).toLowerCase();
    for (const word of ["good", "bad", "strong", "weak", "poor", "excellent", "buy", "sell", "subscribe", "avoid", "apply", "grade", "star", "rating", "recommend", "should", "attractive", "cheap", "expensive", "risky", "safe"]) expect(text).not.toMatch(new RegExp(`\\b${word}`));
    const screen = fs.readFileSync(path.join(__dirname, "../features/ipos/components/detail/DataScoreSection.tsx"), "utf8");
    expect(screen).toContain("DATA_SCORE_LABEL");
    expect(screen).toContain("DATA_SCORE_NOTE");
    expect(screen).toContain("p.bands"); // the formula is on the screen, not behind a tap
    expect(screen).toContain("switches.dataScore");
  });
});

describe("promoted IPOs", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
  const C = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
  const ipo = (id: string, status: string) => ({ id, slug: id, name: id, status }) as unknown as IpoListItem;

  it("reads the server list", () => {
    expect(parsePromoted([{ ipo_id: A }, { ipo_id: A }, { ipo_id: "x" }, null, { ipo_id: B }, { ipo_id: C }])).toEqual([A, B]);
    expect(parsePromoted(null)).toEqual([]);
    expect(parsePromoted({})).toEqual([]);
  });

  it("shows nothing while the switch is off", () => {
    expect(promotedBlock(false, [A, B], [[ipo(A, "open"), ipo(B, "upcoming")]])).toEqual([]);
  });

  it("shows only upcoming or open IPOs that are loaded, at most two, in the server's order", () => {
    const open = [ipo(B, "open")];
    const upcoming = [ipo(A, "upcoming"), ipo(C, "upcoming")];
    expect(promotedBlock(true, [A, B], [open, upcoming]).map((i) => i.id)).toEqual([A, B]);
    expect(promotedBlock(true, [A, B, C], [open, upcoming]).length).toBe(MAX_PROMOTED);
    expect(promotedBlock(true, [A], [[ipo(A, "listed")]])).toEqual([]);
    expect(promotedBlock(true, [A], [[ipo(A, "closed")]])).toEqual([]);
    expect(promotedBlock(true, [A], [undefined, []])).toEqual([]);
    expect(promotedBlock(true, [], [open])).toEqual([]);
    expect(promotedBlock(true, undefined, [open])).toEqual([]);
  });

  it("never touches the ordinary lists", () => {
    const open = [ipo(C, "open"), ipo(B, "open"), ipo(A, "open")];
    const before = JSON.stringify(open);
    promotedBlock(true, [A, B], [open]);
    expect(JSON.stringify(open)).toBe(before);
  });

  it("the label is always on the block and on every card in it", () => {
    expect(PROMOTED_LABEL).toBe("Promoted");
    expect(PROMOTED_NOTE).toMatch(/paid placement/);
    expect(PROMOTED_NOTE).toMatch(/not a recommendation/);
    const src = fs.readFileSync(path.join(__dirname, "../features/ipos/components/PromotedBlock.tsx"), "utf8");
    // the heading and the per-card tag both render the label constant, with no condition around them
    expect(src.match(/\{PROMOTED_LABEL\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("{PROMOTED_NOTE}");
    expect(src).not.toMatch(/\?\s*\(?\s*<[^>]*>\s*\{PROMOTED_LABEL\}/); // not inside a ternary
    expect(src).not.toMatch(/&&\s*\(?\s*<[^>]*>\s*\{PROMOTED_LABEL\}/); // not behind &&
  });
});
