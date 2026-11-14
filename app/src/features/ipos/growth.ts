// Growth analysis from an IPO's reported financials (pure, unit-tested): revenue and profit CAGR, year-on-year
// change and margin trend. Only full financial years are used; a part-year (six or nine months) would make
// growth look like a collapse. Nothing is annualised or estimated: when a figure cannot be computed honestly
// (a loss in the base year, fewer than two full years) the result says so instead of showing a number.
import type { FinancialRow } from "@/features/ipos/types";

const FULL_YEAR = /(^|\D)31\s*(st)?\s*mar|mar(ch)?\.?\s*31/i;

export interface YearPoint {
  period: string;
  /** Financial year end, e.g. 2025 for "31 Mar 2025". Null when the period text has no readable year. */
  year: number | null;
  revenue: number | null;
  profit: number | null;
  /** Profit as a share of revenue, in percent. */
  margin: number | null;
}

export interface Cagr {
  /** Percent per year, one decimal. Null when it cannot be computed; see `reason`. */
  value: number | null;
  years: number;
  from: number | null;
  to: number | null;
  reason: "ok" | "too_few_years" | "missing" | "base_not_positive" | "turned_negative";
}

export interface GrowthAnalysis {
  /** Oldest first. */
  points: YearPoint[];
  revenue: Cagr;
  profit: Cagr;
  /** Change in profit margin from the first to the last year, in percentage points. */
  marginChange: number | null;
  /** "FY23 to FY25" */
  span: string | null;
}

export function periodYear(period: string): number | null {
  const four = /(19|20)\d{2}/.exec(period);
  if (four) return Number(four[0]);
  const two = /(?:^|[^\d])(\d{2})\s*[a-z]?\s*$/i.exec(period.trim());
  return two ? 2000 + Number(two[1]) : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Full financial years, oldest first, one per year (the feed sometimes repeats a period). */
export function fullYears(rows: FinancialRow[] | undefined): YearPoint[] {
  const picked = (rows ?? []).filter((r) => FULL_YEAR.test(r.period));
  const points = picked.map((r) => {
    const revenue = r.revenue ?? r.total_income;
    const margin = revenue !== null && revenue > 0 && r.profit !== null ? round1((r.profit / revenue) * 100) : null;
    return { period: r.period.trim(), year: periodYear(r.period), revenue, profit: r.profit, margin, order: r.period_order };
  });
  // newest row has period_order 0; sort oldest first by year when known, otherwise by feed order
  points.sort((a, b) => {
    if (a.year !== null && b.year !== null) return a.year !== b.year ? a.year - b.year : a.order - b.order; // same year twice: the newer feed row first, so it is the one kept
    return b.order - a.order;
  });
  const seen = new Set<number>();
  const out: YearPoint[] = [];
  for (const p of points) {
    if (p.year !== null) {
      if (seen.has(p.year)) continue;
      seen.add(p.year);
    }
    out.push({ period: p.period, year: p.year, revenue: p.revenue, profit: p.profit, margin: p.margin });
  }
  return out;
}

/** Compound annual growth between the first and last value, over `years` years. */
export function cagr(from: number | null, to: number | null, years: number): Cagr {
  const base = { years, from, to };
  if (years < 1) return { ...base, value: null, reason: "too_few_years" };
  if (from === null || to === null) return { ...base, value: null, reason: "missing" };
  if (from <= 0) return { ...base, value: null, reason: "base_not_positive" };
  if (to <= 0) return { ...base, value: null, reason: "turned_negative" };
  return { ...base, value: round1((Math.pow(to / from, 1 / years) - 1) * 100), reason: "ok" };
}

function seriesCagr(points: YearPoint[], pick: (p: YearPoint) => number | null): Cagr {
  const have = points.filter((p) => pick(p) !== null);
  if (have.length < 2) return { value: null, years: 0, from: have[0] ? pick(have[0]) : null, to: null, reason: points.length < 2 ? "too_few_years" : "missing" };
  const first = have[0];
  const last = have[have.length - 1];
  // years between the two year-ends when both are known; otherwise one year per step
  const years = first.year !== null && last.year !== null ? last.year - first.year : have.length - 1;
  return cagr(pick(first), pick(last), years);
}

const fy = (year: number | null) => (year === null ? null : `FY${String(year % 100).padStart(2, "0")}`);

export function analyseGrowth(rows: FinancialRow[] | undefined): GrowthAnalysis {
  const points = fullYears(rows);
  const first = points[0];
  const last = points[points.length - 1];
  // from the unrounded margins, so two rounded figures do not add up to a wrong difference
  const rawMargin = (p: YearPoint) => (p.revenue !== null && p.revenue > 0 && p.profit !== null ? (p.profit / p.revenue) * 100 : null);
  const m0 = first ? rawMargin(first) : null;
  const m1 = last ? rawMargin(last) : null;
  const marginChange = points.length >= 2 && m0 !== null && m1 !== null ? round1(m1 - m0) : null;
  const span = points.length >= 2 && fy(first.year) && fy(last.year) ? `${fy(first.year)} to ${fy(last.year)}` : null;
  return { points, revenue: seriesCagr(points, (p) => p.revenue), profit: seriesCagr(points, (p) => p.profit), marginChange, span };
}

/** Year-on-year change in percent (one decimal), or null when the earlier value is not positive. */
export function yoy(prev: number | null, next: number | null): number | null {
  if (prev === null || next === null || prev <= 0) return null;
  return round1(((next - prev) / prev) * 100);
}

/** What to show in place of a CAGR that could not be computed. */
export function cagrNote(c: Cagr, what: "revenue" | "profit"): string | null {
  switch (c.reason) {
    case "ok":
      return null;
    case "too_few_years":
      return "Needs two full years";
    case "missing":
      return "Not reported";
    case "base_not_positive":
      return what === "profit" ? "Loss in the first year" : "No revenue in the first year";
    case "turned_negative":
      return what === "profit" ? "Loss in the latest year" : "No revenue in the latest year";
  }
}

/** One plain sentence about the trend, with no judgement about whether to invest. */
export function growthSentence(a: GrowthAnalysis): string | null {
  if (a.points.length < 2 || !a.span) return null;
  const parts: string[] = [];
  if (a.revenue.value !== null) parts.push(`revenue ${a.revenue.value >= 0 ? "grew" : "fell"} ${Math.abs(a.revenue.value)}% a year`);
  if (a.profit.value !== null) parts.push(`profit ${a.profit.value >= 0 ? "grew" : "fell"} ${Math.abs(a.profit.value)}% a year`);
  else if (a.profit.reason === "base_not_positive" && a.profit.to !== null && a.profit.to > 0) parts.push("the company moved from a loss to a profit");
  else if (a.profit.reason === "turned_negative") parts.push("the company moved from a profit to a loss");
  if (!parts.length) return null;
  const margin = a.marginChange === null || a.marginChange === 0 ? "" : `, and the profit margin ${a.marginChange > 0 ? "widened" : "narrowed"} by ${Math.abs(a.marginChange)} points`;
  return `From ${a.span}, ${parts.join(" and ")}${margin}.`;
}
