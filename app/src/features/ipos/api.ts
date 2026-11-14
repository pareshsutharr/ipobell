import { supabase } from "@/lib/supabase";
import { todayIST } from "@/lib/format";
import { parseInterest, type IpoInterest } from "@/features/ipos/interest";
import { parseSectorStat, type SectorStat } from "@/features/ipos/sectors";
import type { StateCount } from "@/features/ipos/states";
import type {
  AnchorRow,
  Board,
  DocumentRow,
  FinancialRow,
  GmpPoint,
  Ipo,
  IpoDirectoryItem,
  IpoListItem,
  IpoStatus,
  ListingStats,
  SubscriptionRow,
} from "@/features/ipos/types";

export const LIST_COLUMNS =
  "id, slug, name, display_name, board, sub_type, status, dates_tba, is_listed, logo_url, open_date, close_date, allotment_date, listing_date, price_band, price_min, price_max, issue_price, issue_size_cr, lot_size, min_investment, gmp, gmp_percent, gmp_expected_price, gmp_updated_at, sub_total, sub_retail, sub_nii, sub_qib, sub_updated_at, listing_price, listing_gain_percent, cmp, current_gain_percent, registrar";

export interface ListFilters {
  board?: Board | null;
  search?: string;
  limit?: number;
}

export async function fetchIpos(status: IpoStatus, filters: ListFilters = {}): Promise<IpoListItem[]> {
  let q = supabase.from("ipos").select(LIST_COLUMNS).eq("status", status);
  if (filters.board) q = q.eq("board", filters.board);
  if (filters.search && filters.search.trim()) q = q.ilike("name", `%${filters.search.trim()}%`);

  switch (status) {
    case "open":
      q = q.order("close_date", { ascending: true, nullsFirst: false }).order("board", { ascending: true });
      break;
    case "upcoming":
      q = q.order("open_date", { ascending: true, nullsFirst: false }).order("name");
      break;
    case "closed":
      q = q.order("listing_date", { ascending: true, nullsFirst: false }).order("close_date", { ascending: false });
      break;
    case "listed":
      q = q.order("listing_date", { ascending: false, nullsFirst: false });
      break;
  }
  const { data, error } = await q.limit(filters.limit ?? 120);
  if (error) throw error;
  return (data ?? []) as unknown as IpoListItem[];
}

export interface IpoPage {
  rows: IpoListItem[];
  /** How many IPOs match in total (all pages). */
  total: number;
  offset: number;
}

/**
 * One page of a status list. Same order as fetchIpos, plus `slug` as a final tie-breaker: without a unique last
 * sort key, IPOs that share a listing date could repeat or go missing between pages.
 */
export async function fetchIposPage(status: IpoStatus, filters: ListFilters, offset: number, pageSize: number): Promise<IpoPage> {
  let q = supabase.from("ipos").select(LIST_COLUMNS, { count: "exact" }).eq("status", status);
  if (filters.board) q = q.eq("board", filters.board);
  switch (status) {
    case "open":
      q = q.order("close_date", { ascending: true, nullsFirst: false }).order("board", { ascending: true });
      break;
    case "upcoming":
      q = q.order("open_date", { ascending: true, nullsFirst: false }).order("name");
      break;
    case "closed":
      q = q.order("listing_date", { ascending: true, nullsFirst: false }).order("close_date", { ascending: false });
      break;
    case "listed":
      q = q.order("listing_date", { ascending: false, nullsFirst: false });
      break;
  }
  const { data, error, count } = await q.order("slug", { ascending: true }).range(offset, offset + pageSize - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as IpoListItem[];
  return { rows, total: count ?? offset + rows.length, offset };
}

/** IPOs per state (registered office), split by status. The row with `state: null` is "Not specified". */
export async function fetchStateCounts(board: Board | null): Promise<StateCount[]> {
  const { data, error } = await supabase.rpc("ipo_state_counts", { p_board: board });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    state: (r.state as string | null) ?? null,
    total: Number(r.total ?? 0),
    open: Number(r.open ?? 0),
    upcoming: Number(r.upcoming ?? 0),
    closed: Number(r.closed ?? 0),
    listed: Number(r.listed ?? 0),
  }));
}

export interface DirectoryPage {
  rows: IpoDirectoryItem[];
  total: number;
  offset: number;
}

/** One page of the IPOs in a state (`state: null` = no state entered), newest first. */
export async function fetchIposByState(state: string | null, status: IpoStatus | null, offset: number, pageSize: number): Promise<DirectoryPage> {
  let q = supabase.from("ipo_directory").select(`${LIST_COLUMNS}, state, sector, industry, listing_platform`, { count: "exact" });
  q = state === null ? q.is("state", null) : q.eq("state", state);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q
    .order("open_date", { ascending: false, nullsFirst: false })
    .order("slug", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as IpoDirectoryItem[];
  return { rows, total: count ?? offset + rows.length, offset };
}

/** Per-sector counts and averages. The row with `sector: null` is "Not specified". */
export async function fetchSectorStats(board: Board | null): Promise<SectorStat[]> {
  const { data, error } = await supabase.rpc("ipo_sector_stats", { p_board: board });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(parseSectorStat);
}

/** One page of the IPOs in a sector (`sector: null` = no sector entered), newest first. */
export async function fetchIposBySector(sector: string | null, status: IpoStatus | null, offset: number, pageSize: number): Promise<DirectoryPage> {
  let q = supabase.from("ipo_directory").select(`${LIST_COLUMNS}, state, sector, industry, listing_platform`, { count: "exact" });
  q = sector === null ? q.is("sector", null) : q.eq("sector", sector);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q
    .order("open_date", { ascending: false, nullsFirst: false })
    .order("slug", { ascending: true })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  const rows = (data ?? []) as unknown as IpoDirectoryItem[];
  return { rows, total: count ?? offset + rows.length, offset };
}

/** State of every IPO that has one, for the small label on list rows. Paged because the API returns 1000 rows at most. */
export async function fetchIpoStates(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from("ipo_admin_data").select("ipo_id, state").not("state", "is", null).order("ipo_id").range(from, from + 999);
    if (error) throw error;
    for (const r of (data ?? []) as { ipo_id: string; state: string }[]) out[r.ipo_id] = r.state;
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** How many people watch this IPO / opened it this month. Totals only; small numbers come back as null. */
export async function fetchIpoInterest(ipoId: string): Promise<IpoInterest> {
  const { data, error } = await supabase.rpc("ipo_interest", { p_ipo_id: ipoId });
  if (error) throw error;
  return parseInterest(data);
}

export async function searchIpos(search: string, limit = 30): Promise<IpoListItem[]> {
  const { data, error } = await supabase
    .from("ipos")
    .select(LIST_COLUMNS)
    .ilike("name", `%${search.trim()}%`)
    .order("open_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as IpoListItem[];
}

export async function fetchIpo(slug: string): Promise<Ipo> {
  const { data, error } = await supabase.from("ipos").select("*").eq("slug", slug).single();
  if (error) throw error;
  return data as unknown as Ipo;
}

export async function fetchIposByIds(ids: string[]): Promise<IpoListItem[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from("ipos").select(LIST_COLUMNS).in("id", ids);
  if (error) throw error;
  return (data ?? []) as unknown as IpoListItem[];
}

export async function fetchLatestSubscription(ipoId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("ipo_subscription_latest")
    .select("*")
    .eq("ipo_id", ipoId)
    .order("parent_key")
    .order("category_key");
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

export async function fetchSubscriptionTrend(ipoId: string): Promise<SubscriptionRow[]> {
  const { data, error } = await supabase
    .from("ipo_subscriptions")
    .select("*")
    .eq("ipo_id", ipoId)
    .eq("parent_key", "")
    .in("category_key", ["TOTAL", "RETAIL", "NII", "QIB"])
    .order("snapshot_time", { ascending: true })
    .limit(400);
  if (error) throw error;
  return (data ?? []) as SubscriptionRow[];
}

export async function fetchGmpHistory(ipoId: string): Promise<GmpPoint[]> {
  const { data, error } = await supabase.from("ipo_gmp_history").select("*").eq("ipo_id", ipoId).order("recorded_on", { ascending: true });
  if (error) throw error;
  return (data ?? []) as GmpPoint[];
}

export async function fetchFinancials(ipoId: string): Promise<FinancialRow[]> {
  const { data, error } = await supabase.from("ipo_financials").select("*").eq("ipo_id", ipoId).order("period_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FinancialRow[];
}

export async function fetchDocuments(ipoId: string): Promise<DocumentRow[]> {
  const { data, error } = await supabase.from("ipo_documents").select("*").eq("ipo_id", ipoId).order("kind");
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

export async function fetchAnchors(ipoId: string): Promise<AnchorRow[]> {
  const { data, error } = await supabase.from("ipo_anchors").select("*").eq("ipo_id", ipoId).order("amount_cr", { ascending: false, nullsFirst: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as AnchorRow[];
}

/** IPOs with an allotment / refund / listing date within a window around today — for the Allotment screen. */
export async function fetchAllotmentWindow(): Promise<IpoListItem[]> {
  const today = todayIST();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 10);
  const to = new Date(today);
  to.setUTCDate(to.getUTCDate() + 10);
  const { data, error } = await supabase
    .from("ipos")
    .select(LIST_COLUMNS)
    .gte("allotment_date", from.toISOString().slice(0, 10))
    .lte("allotment_date", to.toISOString().slice(0, 10))
    .order("allotment_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as IpoListItem[];
}

export async function fetchListed(board: Board | null, months: number, limit = 200): Promise<IpoListItem[]> {
  let q = supabase.from("ipos").select(LIST_COLUMNS).eq("status", "listed").not("listing_price", "is", null);
  if (board) q = q.eq("board", board);
  if (months > 0) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    q = q.gte("listing_date", since.toISOString().slice(0, 10));
  }
  const { data, error } = await q.order("listing_date", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as IpoListItem[];
}

export async function fetchListingStats(board: Board | null, months: number): Promise<ListingStats> {
  const { data, error } = await supabase.rpc("get_listing_stats", { p_board: board, p_months: months });
  if (error) throw error;
  return data as ListingStats;
}
