// Peer comparison and valuation range (pure, unit-tested). Peers are the IPOs our team has tagged with the same
// sector (public.sector_peers). Everything here is arithmetic on reported figures: medians, quartiles and
// simple multiples. Nothing is a valuation opinion, and when there are too few peers the tools say so instead
// of showing a number.
import type { IssueSizeRules } from "@/features/business/tools";

export interface Peer {
  slug: string;
  name: string;
  board: string;
  status: string;
  listingDate: string | null;
  pe: number | null;
  patMargin: number | null;
  roce: number | null;
  ronw: number | null;
  debtEquity: number | null;
  period: string | null;
  revenue: number | null;
  profit: number | null;
  netWorth: number | null;
  totalBorrowing: number | null;
}

const nn = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function parsePeer(r: Record<string, unknown>): Peer {
  return {
    slug: String(r.slug ?? ""), name: String(r.name ?? ""), board: String(r.board ?? ""), status: String(r.status ?? ""),
    listingDate: typeof r.listing_date === "string" ? r.listing_date : null,
    pe: nn(r.pe), patMargin: nn(r.pat_margin), roce: nn(r.roce), ronw: nn(r.ronw), debtEquity: nn(r.debt_equity),
    period: typeof r.period === "string" ? r.period : null,
    revenue: nn(r.revenue), profit: nn(r.profit), netWorth: nn(r.net_worth), totalBorrowing: nn(r.total_borrowing),
  };
}

/** Fewer peers with a figure than this and a "typical" value would mislead. */
export const MIN_PEERS = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Value at quantile q (0..1) with linear interpolation, the same method as Excel's PERCENTILE.INC. */
export function quantile(values: number[], q: number): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return round2(v[lo] + (v[hi] - v[lo]) * (pos - lo));
}

export interface Spread {
  n: number;
  low: number | null; // 25th percentile
  median: number | null;
  high: number | null; // 75th percentile
  min: number | null;
  max: number | null;
}

export function spread(values: (number | null)[]): Spread {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  return { n: v.length, low: quantile(v, 0.25), median: quantile(v, 0.5), high: quantile(v, 0.75), min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null };
}

// ---------------------------------------------------------------------------------------------------------
// Valuation range
// ---------------------------------------------------------------------------------------------------------
export interface ValuationRange {
  low: number; // ₹ crore
  high: number;
  mid: number;
  multipleLow: number;
  multipleHigh: number;
}

export interface ValuationResult {
  /** Profit × the sector multiple from the firm's rules, less and plus the band. */
  byRule: ValuationRange | null;
  /** Profit × the middle half (25th to 75th percentile) of the P/E of listed peers. Null when fewer than MIN_PEERS have a positive P/E. */
  byPeers: ValuationRange | null;
  /** How many peers have a usable P/E, and how many peers there are in all. */
  peersWithPe: number;
  peerCount: number;
  /** Where both methods agree. Null when there is only one method or they do not overlap. */
  overlap: { low: number; high: number } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function valuationRange(patCr: number | null, sector: string | null, rules: IssueSizeRules, peers: Peer[] | undefined): ValuationResult | null {
  if (patCr === null || !(patCr > 0) || !sector) return null;
  const basePe = rules.sectorPe.find((s) => s.sector === sector)?.pe ?? null;
  const band = rules.bandPct / 100;
  const byRule: ValuationRange | null = basePe
    ? { low: r1(patCr * basePe * (1 - band)), high: r1(patCr * basePe * (1 + band)), mid: r1(patCr * basePe), multipleLow: round2(basePe * (1 - band)), multipleHigh: round2(basePe * (1 + band)) }
    : null;

  // A negative or zero P/E (a loss-making peer) says nothing about what a profit is worth.
  const pes = (peers ?? []).map((p) => p.pe).filter((x): x is number => x !== null && x > 0);
  const s = spread(pes);
  const byPeers: ValuationRange | null =
    s.n >= MIN_PEERS && s.low !== null && s.high !== null && s.median !== null
      ? { low: r1(patCr * s.low), high: r1(patCr * s.high), mid: r1(patCr * s.median), multipleLow: s.low, multipleHigh: s.high }
      : null;

  let overlap: ValuationResult["overlap"] = null;
  if (byRule && byPeers) {
    const low = Math.max(byRule.low, byPeers.low);
    const high = Math.min(byRule.high, byPeers.high);
    if (low <= high) overlap = { low, high };
  }
  return { byRule, byPeers, peersWithPe: s.n, peerCount: (peers ?? []).length, overlap };
}

// ---------------------------------------------------------------------------------------------------------
// Compare my company
// ---------------------------------------------------------------------------------------------------------
export interface CompanyInput {
  revenue: number | null; // ₹ crore, latest full year
  ebitda: number | null;
  pat: number | null;
  debt: number | null;
  netWorth: number | null;
}

export type Position = "above" | "in_line" | "below";

export interface MetricComparison {
  key: "revenue" | "profit" | "pat_margin" | "ebitda_margin" | "debt_equity";
  label: string;
  unit: "cr" | "pct" | "ratio";
  yours: number | null;
  peers: Spread;
  /** Against the peers' middle half: above the 75th percentile, below the 25th, or in between. Null when it cannot be said. */
  position: Position | null;
  /** For debt, lower is the lighter balance sheet; the wording uses this. */
  lowerIsLighter?: boolean;
}

function position(yours: number | null, s: Spread): Position | null {
  if (yours === null || s.n < MIN_PEERS || s.low === null || s.high === null) return null;
  if (yours > s.high) return "above";
  if (yours < s.low) return "below";
  return "in_line";
}

const pctOf = (part: number | null, whole: number | null): number | null => (part === null || whole === null || !(whole > 0) ? null : round2((part / whole) * 100));

export function compareCompany(input: CompanyInput, peers: Peer[] | undefined): MetricComparison[] {
  const list = peers ?? [];
  const yoursMargin = pctOf(input.pat, input.revenue);
  const yoursEbitdaMargin = pctOf(input.ebitda, input.revenue);
  const yoursDe = input.debt !== null && input.netWorth !== null && input.netWorth > 0 ? round2(input.debt / input.netWorth) : null;

  // Peer margin: the feed's own PAT margin where it gives one, otherwise profit ÷ revenue of the same year.
  const peerMargin = list.map((p) => p.patMargin ?? pctOf(p.profit, p.revenue));
  const peerDe = list.map((p) => p.debtEquity ?? (p.totalBorrowing !== null && p.netWorth !== null && p.netWorth > 0 ? round2(p.totalBorrowing / p.netWorth) : null));

  const rows: MetricComparison[] = [
    { key: "revenue", label: "Revenue", unit: "cr", yours: input.revenue, peers: spread(list.map((p) => p.revenue)), position: null },
    { key: "profit", label: "Profit after tax", unit: "cr", yours: input.pat, peers: spread(list.map((p) => p.profit)), position: null },
    { key: "pat_margin", label: "PAT margin", unit: "pct", yours: yoursMargin, peers: spread(peerMargin), position: null },
    // Peers' EBITDA is not in the data, so this row shows the company's own figure only.
    { key: "ebitda_margin", label: "EBITDA margin", unit: "pct", yours: yoursEbitdaMargin, peers: spread([]), position: null },
    { key: "debt_equity", label: "Debt ÷ equity", unit: "ratio", yours: yoursDe, peers: spread(peerDe), position: null, lowerIsLighter: true },
  ];
  return rows.map((r) => ({ ...r, position: position(r.yours, r.peers) }));
}

/** "Above most peers" / "In line with peers" / "Below most peers" — a position, not a judgement. */
export function positionLabel(m: MetricComparison): string {
  if (m.position === null) {
    if (m.yours === null) return "Enter your figures";
    return m.peers.n === 0 ? "No peer figure" : `Only ${m.peers.n} ${m.peers.n === 1 ? "peer" : "peers"} with this figure`;
  }
  if (m.position === "in_line") return "In line with peers";
  return m.position === "above" ? "Above most peers" : "Below most peers";
}

export function formatMetric(v: number | null, unit: MetricComparison["unit"]): string {
  if (v === null) return "—";
  if (unit === "pct") return `${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
  if (unit === "ratio") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 1 })} Cr`;
}
