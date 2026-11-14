// Compare IPOs side by side (pure, unit-tested). Numbers are shown as the feed reports them; nothing here ranks
// the IPOs or says which is better.
import type { FinancialRow, Ipo } from "@/features/ipos/types";
import { crore, dateRange, inr, pct, times } from "@/lib/format";

export const MAX_COMPARE = 3;
export const MIN_COMPARE = 2;

/** Slugs from the route (?slugs=a,b,c): trimmed, de-duplicated, at most MAX_COMPARE. */
export function parseSlugs(param: string | string[] | undefined): string[] {
  const raw = Array.isArray(param) ? param.join(",") : (param ?? "");
  const out: string[] = [];
  for (const s of raw.split(",").map((x) => x.trim()).filter(Boolean)) {
    if (!out.includes(s)) out.push(s);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function addSlug(slugs: string[], slug: string): string[] {
  if (slugs.includes(slug) || slugs.length >= MAX_COMPARE) return slugs;
  return [...slugs, slug];
}

export function removeSlug(slugs: string[], slug: string): string[] {
  return slugs.filter((s) => s !== slug);
}

/**
 * The financial year to compare. Prospectuses often lead with a part-year (six or nine months); comparing that
 * with another company's full year would mislead, so the latest period ending 31 March is preferred.
 * Rows arrive newest first (period_order 0 = latest).
 */
export function latestFullYear(rows: FinancialRow[] | undefined): FinancialRow | null {
  if (!rows || !rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.period_order - b.period_order);
  return sorted.find((r) => /(^|\D)31\s*(st)?\s*mar|mar(ch)?\.?\s*31/i.test(r.period)) ?? sorted[0];
}

function kpi(ipo: Ipo, key: string): string | null {
  const v = (ipo.kpis ?? []).find((k) => k.key === key)?.value;
  return v && v.trim() ? v.trim() : null;
}

const amount = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

export interface CompareItem {
  ipo: Ipo;
  financials: FinancialRow[] | undefined;
}

export interface CompareRow {
  label: string;
  values: string[];
  /** Shown under the label, e.g. the unit or which year. */
  note?: string;
}

export interface CompareSection {
  title: string;
  rows: CompareRow[];
}

/** Unit the financial figures are reported in, as the feed states it ("₹ crore", "₹ lakh", …). */
export function unitOf(ipo: Ipo): string {
  const u = ipo.financials?.unit?.trim();
  return u ? u.replace(/^Rs\.?\s*/i, "₹ ") : "₹ crore";
}

export function buildComparison(items: CompareItem[]): { sections: CompareSection[]; unitsDiffer: boolean; periods: string[] } {
  const years = items.map((it) => latestFullYear(it.financials));
  const units = items.map((it) => unitOf(it.ipo));
  const unitsDiffer = new Set(units.map((u) => u.toLowerCase())).size > 1;
  const fin = (pick: (r: FinancialRow) => number | null) => years.map((y, i) => (y ? `${amount(pick(y))}${unitsDiffer && pick(y) !== null ? ` (${units[i]})` : ""}` : "—"));
  const unitNote = unitsDiffer ? "Units differ: see each figure" : units[0];

  const sections: CompareSection[] = [
    {
      title: "The issue",
      rows: [
        { label: "Board", values: items.map(({ ipo }) => (ipo.board === "sme" ? (ipo.sub_type ?? "SME") : "Mainboard")) },
        { label: "Status", values: items.map(({ ipo }) => ipo.status.charAt(0).toUpperCase() + ipo.status.slice(1)) },
        { label: "Dates", values: items.map(({ ipo }) => (ipo.dates_tba ? "To be announced" : dateRange(ipo.open_date, ipo.close_date))) },
        { label: "Issue size", values: items.map(({ ipo }) => crore(ipo.issue_size_cr)) },
        { label: "Price band", values: items.map(({ ipo }) => (ipo.price_band ? `₹${ipo.price_band}` : "—")) },
        { label: "Lot size", values: items.map(({ ipo }) => (ipo.lot_size ? `${ipo.lot_size} shares` : "—")) },
        { label: "Minimum investment", values: items.map(({ ipo }) => inr(ipo.min_investment)) },
      ],
    },
    {
      title: "Demand",
      rows: [
        { label: "GMP", note: "Unofficial grey-market figure", values: items.map(({ ipo }) => (ipo.gmp === null ? "—" : `${inr(ipo.gmp)} (${pct(ipo.gmp_percent)})`)) },
        { label: "Subscription, total", values: items.map(({ ipo }) => times(ipo.sub_total)) },
        { label: "Retail", values: items.map(({ ipo }) => times(ipo.sub_retail)) },
        { label: "NII", values: items.map(({ ipo }) => times(ipo.sub_nii)) },
        { label: "QIB", values: items.map(({ ipo }) => times(ipo.sub_qib)) },
      ],
    },
    {
      title: "Valuation and returns",
      rows: [
        { label: "P/E ratio", values: items.map(({ ipo }) => kpi(ipo, "pe") ?? "—") },
        { label: "EPS (₹)", values: items.map(({ ipo }) => kpi(ipo, "eps") ?? "—") },
        { label: "RoNW", values: items.map(({ ipo }) => kpi(ipo, "ronw") ?? "—") },
        { label: "RoCE", values: items.map(({ ipo }) => kpi(ipo, "roce") ?? "—") },
        { label: "PAT margin", values: items.map(({ ipo }) => kpi(ipo, "pat_margin") ?? "—") },
        { label: "Debt / equity", values: items.map(({ ipo }) => kpi(ipo, "debt_equity") ?? "—") },
      ],
    },
    {
      title: "Financials",
      rows: [
        { label: "Period", values: years.map((y) => y?.period ?? "—") },
        { label: "Revenue", note: unitNote, values: fin((r) => r.revenue ?? r.total_income) },
        { label: "Profit after tax", note: unitNote, values: fin((r) => r.profit) },
        { label: "Net worth", note: unitNote, values: fin((r) => r.net_worth) },
        { label: "Total borrowing", note: unitNote, values: fin((r) => r.total_borrowing) },
      ],
    },
    {
      title: "After listing",
      rows: [
        { label: "Listing price", values: items.map(({ ipo }) => inr(ipo.listing_price)) },
        { label: "Listing-day gain", values: items.map(({ ipo }) => pct(ipo.listing_gain_percent)) },
        { label: "Gain at today's price", values: items.map(({ ipo }) => pct(ipo.current_gain_percent)) },
      ],
    },
  ];

  // A row where no IPO has a value adds nothing; a section with no rows left is dropped.
  const trimmed = sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => r.values.some((v) => v !== "—")) }))
    .filter((s) => s.rows.length > 0 && !(s.title === "Financials" && s.rows.length === 1));
  return { sections: trimmed, unitsDiffer, periods: years.map((y) => y?.period ?? "") };
}
