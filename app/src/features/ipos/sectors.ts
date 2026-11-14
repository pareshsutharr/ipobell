// Sector view helpers (pure, unit-tested). Sector is entered by the team in the admin panel; an IPO with none
// is "Not specified". Averages come from the `ipo_sector_stats` database function.
import { NOT_SPECIFIED_PARAM } from "@/features/ipos/states";

export interface SectorStat {
  /** null = no sector entered */
  sector: string | null;
  total: number;
  open: number;
  upcoming: number;
  closed: number;
  listed: number;
  /** Average listing-day gain of the listed IPOs, in percent. Null when none has listed. */
  avgListingGain: number | null;
  listedAboveIssue: number;
  listedWithPrice: number;
  /** Average total subscription (times). Null when no IPO has a figure. */
  avgSubscription: number | null;
  totalRaisedCr: number | null;
}

const n = (v: unknown): number => (v === null || v === undefined || !Number.isFinite(Number(v)) ? 0 : Number(v));
const nn = (v: unknown): number | null => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** A row of ipo_sector_stats (numbers may arrive as strings) → SectorStat. */
export function parseSectorStat(r: Record<string, unknown>): SectorStat {
  return {
    sector: typeof r.sector === "string" && r.sector.trim() ? r.sector : null,
    total: n(r.total), open: n(r.open), upcoming: n(r.upcoming), closed: n(r.closed), listed: n(r.listed),
    avgListingGain: nn(r.avg_listing_gain), listedAboveIssue: n(r.listed_above_issue), listedWithPrice: n(r.listed_with_price),
    avgSubscription: nn(r.avg_subscription), totalRaisedCr: nn(r.total_raised_cr),
  };
}

/** Share of the sector's listed IPOs that listed above issue price, in percent. Null when none has listed. */
export function sectorHitRate(s: Pick<SectorStat, "listedAboveIssue" | "listedWithPrice">): number | null {
  return s.listedWithPrice > 0 ? Math.round((s.listedAboveIssue / s.listedWithPrice) * 1000) / 10 : null;
}

export type SectorSort = "count" | "gain" | "subscription";

/** Named sectors in the chosen order; "Not specified" is returned separately. Sectors without the figure go last. */
export function splitSectorStats(rows: SectorStat[] | undefined, sort: SectorSort = "count"): { sectors: SectorStat[]; notSpecified: SectorStat | null; totalIpos: number; withSector: number } {
  const all = rows ?? [];
  const value = (s: SectorStat) => (sort === "gain" ? s.avgListingGain : sort === "subscription" ? s.avgSubscription : s.total);
  const sectors = all
    .filter((r) => r.sector && r.total > 0)
    .sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va === null && vb === null) return (a.sector as string).localeCompare(b.sector as string);
      if (va === null) return 1;
      if (vb === null) return -1;
      return vb - va || (a.sector as string).localeCompare(b.sector as string);
    });
  const notSpecified = all.find((r) => !r.sector && r.total > 0) ?? null;
  const withSector = sectors.reduce((sum, r) => sum + r.total, 0);
  return { sectors, notSpecified, totalIpos: withSector + (notSpecified?.total ?? 0), withSector };
}

/**
 * Route parameter for a sector. Sector names contain "/" ("IT / Software Services"), which would split the path
 * into two segments, so the name is percent-encoded here. paramToState() decodes it, whether or not the router
 * has already decoded it once.
 */
export function sectorToParam(sector: string | null | undefined): string {
  return sector && sector.trim() ? encodeURIComponent(sector) : NOT_SPECIFIED_PARAM;
}

/** Fewer listed IPOs than this and an average says little. */
export const SMALL_SECTOR_SAMPLE = 3;
