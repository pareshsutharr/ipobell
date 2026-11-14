// Listing statistics helpers (pure, unit-tested). The numbers come from the `get_listing_stats` database function;
// this file only derives what the screen shows from them.
import type { ListingStats } from "@/features/ipos/types";

export const STAT_PERIODS = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "1 year" },
  { months: 0, label: "All" },
] as const;

export function periodLabel(months: number): string {
  if (months <= 0) return "all listed IPOs on record";
  return months === 12 ? "the last 12 months" : `the last ${months} months`;
}

/** Share of IPOs that listed above their issue price, in percent (one decimal). Null when there are none. */
export function hitRate(s: Pick<ListingStats, "count" | "positive_count"> | null | undefined): number | null {
  if (!s || !s.count) return null;
  return Math.round((s.positive_count / s.count) * 1000) / 10;
}

export interface StatsSummary {
  count: number;
  hitRate: number | null;
  /** "34 of 50 listed above issue price" */
  hitRateDetail: string;
  avgListingGain: number | null;
  medianListingGain: number | null;
  avgCurrentGain: number | null;
  totalRaisedCr: number | null;
  /** Too few IPOs for an average to mean much. */
  smallSample: boolean;
}

export const SMALL_SAMPLE = 5;

export function summarise(s: ListingStats | null | undefined): StatsSummary {
  const count = s?.count ?? 0;
  const positive = s?.positive_count ?? 0;
  return {
    count,
    hitRate: hitRate(s),
    hitRateDetail: count ? `${positive} of ${count} listed above issue price` : "No listings in this period",
    avgListingGain: count ? (s?.avg_listing_gain ?? null) : null,
    medianListingGain: count ? (s?.median_listing_gain ?? null) : null,
    avgCurrentGain: count ? (s?.avg_current_gain ?? null) : null,
    totalRaisedCr: count ? (s?.total_raised_cr ?? null) : null,
    smallSample: count > 0 && count < SMALL_SAMPLE,
  };
}
