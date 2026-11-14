import { supabase } from "@/lib/supabase";
import { todayIST } from "@/lib/format";
import type {
  AnchorRow,
  Board,
  DocumentRow,
  FinancialRow,
  GmpPoint,
  Ipo,
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
