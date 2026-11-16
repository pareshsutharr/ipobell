// Data score (plan step 5.2): four reported figures, each turned into points by a fixed table, added up.
// Pure and unit-tested. The table below IS the formula and is shown in full next to every score.
//
// It is arithmetic on figures the company reported. It is not a rating, a recommendation or advice, it does
// not predict listing gains, and it is never called anything but a "data score". A figure that is not
// reported earns no points and is shown as "Not specified": nothing is estimated. Off unless the
// `data_score` feature switch is on (held for legal review).
import { analyseGrowth, fullYears } from "@/features/ipos/growth";
import type { FinancialRow, Ipo } from "@/features/ipos/types";

export const DATA_SCORE_LABEL = "Data score";
export const DATA_SCORE_NOTE =
  "A data score is arithmetic on figures the company reported, using the fixed table shown here. It is not a rating, a recommendation or advice, and it says nothing about listing gains or future returns.";

export type PartKey = "growth" | "margin" | "debt" | "valuation";

export interface Band {
  /** The band applies when the value is at least this (higher-is-more parts) or at most this (lower-is-more parts). */
  limit: number;
  points: number;
}

export interface PartRule {
  key: PartKey;
  title: string;
  /** What the figure is, in words. */
  figure: string;
  unit: "%" | "x";
  /** "atLeast": more points for a higher value. "atMost": more points for a lower value. */
  direction: "atLeast" | "atMost";
  /** Best band first. A value that reaches no band earns 0. */
  bands: Band[];
}

export const PART_MAX = 25;

export const SCORE_RULES: PartRule[] = [
  { key: "growth", title: "Growth", figure: "Revenue growth a year over the full financial years reported", unit: "%", direction: "atLeast", bands: [{ limit: 30, points: 25 }, { limit: 20, points: 20 }, { limit: 10, points: 15 }, { limit: 0, points: 10 }] },
  { key: "margin", title: "Margin", figure: "Profit after tax as a share of revenue, latest full year", unit: "%", direction: "atLeast", bands: [{ limit: 15, points: 25 }, { limit: 10, points: 20 }, { limit: 5, points: 15 }, { limit: 0.1, points: 10 }] },
  { key: "debt", title: "Debt", figure: "Debt divided by equity", unit: "x", direction: "atMost", bands: [{ limit: 0.25, points: 25 }, { limit: 0.5, points: 20 }, { limit: 1, points: 15 }, { limit: 2, points: 10 }] },
  { key: "valuation", title: "Valuation", figure: "Price to earnings (P/E) at the issue price", unit: "x", direction: "atMost", bands: [{ limit: 15, points: 25 }, { limit: 25, points: 20 }, { limit: 35, points: 15 }, { limit: 50, points: 10 }] },
];

/** Points for one figure. null in, null out. A negative debt ratio or a P/E of zero or less (a loss) earns 0. */
export function pointsFor(rule: PartRule, value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (rule.direction === "atMost") {
    if (rule.key === "valuation" ? value <= 0 : value < 0) return 0;
    return rule.bands.find((b) => value <= b.limit)?.points ?? 0;
  }
  return rule.bands.find((b) => value >= b.limit)?.points ?? 0;
}

/** The table for one part as a sentence: "30% or more = 25 · 20% or more = 20 · … · otherwise 0". */
export function bandsText(rule: PartRule): string {
  const u = rule.unit === "%" ? "%" : "×";
  const word = rule.direction === "atLeast" ? "or more" : "or less";
  return [...rule.bands.map((b) => `${b.limit}${u} ${word} = ${b.points}`), "otherwise 0"].join(" · ");
}

export interface ScoreInputs {
  growth: number | null;
  margin: number | null;
  debt: number | null;
  valuation: number | null;
  /** Where each figure came from, for the screen. */
  sources: Partial<Record<PartKey, string>>;
}

export interface ScorePart {
  key: PartKey;
  title: string;
  figure: string;
  value: number | null;
  valueText: string;
  points: number | null;
  max: number;
  source: string | null;
  bands: string;
}

export interface DataScore {
  parts: ScorePart[];
  /** Points earned by the parts that have a figure. */
  points: number;
  /** 25 for each part that has a figure. */
  max: number;
  available: number;
  /** A total is shown only when at least three of the four figures are reported. */
  enough: boolean;
  missing: string[];
}

export const MIN_PARTS = 3;

export function computeDataScore(inputs: ScoreInputs): DataScore {
  const parts: ScorePart[] = SCORE_RULES.map((rule) => {
    const raw = inputs[rule.key];
    const value = raw === null || !Number.isFinite(raw) ? null : raw;
    return {
      key: rule.key,
      title: rule.title,
      figure: rule.figure,
      value,
      valueText: value === null ? "Not specified" : rule.unit === "%" ? `${value}%` : `${value}×`,
      points: pointsFor(rule, value),
      max: PART_MAX,
      source: value === null ? null : (inputs.sources[rule.key] ?? null),
      bands: bandsText(rule),
    };
  });
  const have = parts.filter((p) => p.points !== null);
  return {
    parts,
    points: have.reduce((n, p) => n + (p.points as number), 0),
    max: have.length * PART_MAX,
    available: have.length,
    enough: have.length >= MIN_PARTS,
    missing: parts.filter((p) => p.points === null).map((p) => p.title.toLowerCase()),
  };
}

/** A KPI as the feed writes it ("13.03", "34.09%", "1,200.5") → number. Anything else → null. */
export function kpiNumber(ipo: Pick<Ipo, "kpis">, key: string): number | null {
  const raw = (ipo.kpis ?? []).find((k) => k.key === key)?.value;
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/%/g, "").replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The four figures for an IPO, from its financial statements first and its reported KPIs second. */
export function scoreInputs(ipo: Pick<Ipo, "kpis">, rows: FinancialRow[] | undefined): ScoreInputs {
  const sources: ScoreInputs["sources"] = {};
  const growthA = analyseGrowth(rows);
  const growth = growthA.revenue.value;
  if (growth !== null) sources.growth = growthA.span ? `Revenue, ${growthA.span}` : "Reported revenue";

  const years = fullYears(rows);
  const latest = years[years.length - 1];
  let margin = latest?.margin ?? null;
  if (margin !== null) sources.margin = `Financial statements, ${latest.period}`;
  else {
    margin = kpiNumber(ipo, "pat_margin");
    if (margin !== null) sources.margin = "PAT margin as reported";
  }

  let debt = kpiNumber(ipo, "debt_equity");
  if (debt !== null) sources.debt = "Debt/equity as reported";
  else {
    // the latest full year in the statements (rows arrive newest first)
    const row = [...(rows ?? [])].sort((a, b) => a.period_order - b.period_order).find((r) => latest && r.period.trim() === latest.period);
    if (row && row.total_borrowing !== null && row.net_worth !== null && row.net_worth > 0) {
      debt = r2(row.total_borrowing / row.net_worth);
      sources.debt = `Borrowings ÷ net worth, ${latest.period}`;
    }
  }

  const valuation = kpiNumber(ipo, "pe");
  if (valuation !== null) sources.valuation = "P/E as reported";

  return { growth: growth === null ? null : r1(growth), margin: margin === null ? null : r1(margin), debt, valuation, sources };
}

/** "62 of 100" or, with one figure missing, "45 of 75". Never a letter, a star or a word like good or poor. */
export function scoreText(s: DataScore): string {
  return `${s.points} of ${s.max}`;
}
