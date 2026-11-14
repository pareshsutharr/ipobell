// Row types mirroring supabase/migrations/20261026000100_init_schema.sql

export type IpoStatus = "upcoming" | "open" | "closed" | "listed";
export type Board = "mainboard" | "sme";

export interface Registrar {
  name?: string | null;
  slug?: string | null;
  logo?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  status_page?: string | null;
  driver?: string | null;
  supports_in_app?: boolean | null;
}

export interface LeadManager {
  name?: string | null;
  slug?: string | null;
  logo?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CompanyContact {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface LotTier {
  label: string;
  lots: number;
  shares: number;
  amount: number;
}

export interface ReservationRow {
  category: string;
  reservation: string;
}

export interface Kpi {
  key: string;
  label: string;
  value: string;
}

export interface Objective {
  object: string;
  amount?: string | null;
}

export interface FinancialsJson {
  headers?: string[];
  rows?: { metric: string; data: (string | number | null)[] }[];
  unit?: string;
  text?: string | null;
}

export interface DocumentsJson {
  rhp?: string | null;
  drhp?: string | null;
  anchor?: string | null;
  boa?: string | null;
}

/** Columns used by list screens (keep in sync with LIST_COLUMNS in api.ts). */
export interface IpoListItem {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  board: Board;
  sub_type: string | null;
  status: IpoStatus;
  dates_tba: boolean;
  is_listed: boolean;
  logo_url: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  listing_date: string | null;
  price_band: string | null;
  price_min: number | null;
  price_max: number | null;
  issue_price: number | null;
  issue_size_cr: number | null;
  lot_size: number | null;
  min_investment: number | null;
  gmp: number | null;
  gmp_percent: number | null;
  gmp_expected_price: number | null;
  gmp_updated_at: string | null;
  sub_total: number | null;
  sub_retail: number | null;
  sub_nii: number | null;
  sub_qib: number | null;
  sub_updated_at: string | null;
  listing_price: number | null;
  listing_gain_percent: number | null;
  cmp: number | null;
  current_gain_percent: number | null;
  registrar: Registrar | null;
}

export interface Ipo extends IpoListItem {
  api_status: string | null;
  stage: string | null;
  feature_image_url: string | null;
  web_url: string | null;
  refund_date: string | null;
  credit_to_demat_date: string | null;
  face_value: number | null;
  sale_type: string | null;
  listing_on: string | null;
  employee_discount: string | null;
  bse_scrip_code: string | null;
  nse_symbol: string | null;
  lot_calculator: LotTier[];
  reservation: ReservationRow[];
  shares_offered: Record<string, string | number | null>;
  gmp_kostak: string | null;
  gmp_subject_to_sauda: string | null;
  sub_employee: number | null;
  sub_shareholder: number | null;
  sub_anchor: number | null;
  sub_applications: number | null;
  cmp_updated_at: string | null;
  about: string | null;
  description: string | null;
  strengths: string[];
  risks: string[];
  objectives: Objective[];
  objectives_text: string | null;
  financials: FinancialsJson;
  kpis: Kpi[];
  promoters_text: string | null;
  promoters: unknown[];
  pre_issue_holding: string | null;
  post_issue_holding: string | null;
  holding_pattern_desc: string | null;
  company_contact: CompanyContact;
  lead_managers: LeadManager[];
  documents: DocumentsJson;
  anchor_total_count: number | null;
  anchor_total_cr: number | null;
  anchor_mf_count: number | null;
  detail_synced_at: string | null;
  last_synced_at: string | null;
  updated_at: string;
}

export interface SubscriptionRow {
  id: string;
  ipo_id: string;
  category_key: string;
  parent_key: string;
  label: string | null;
  times_subscribed: number | null;
  shares_offered: number | null;
  shares_applied: number | null;
  applications: number | null;
  demand_crore: number | null;
  snapshot_time: string;
}

export interface GmpPoint {
  id: string;
  ipo_id: string;
  recorded_on: string;
  gmp: number | null;
  gmp_percent: number | null;
  expected_price: number | null;
  kostak: string | null;
  subject_to_sauda: string | null;
  recorded_at: string;
}

export interface FinancialRow {
  id: string;
  ipo_id: string;
  period: string;
  period_order: number;
  revenue: number | null;
  total_income: number | null;
  profit: number | null;
  net_worth: number | null;
  total_assets: number | null;
  total_borrowing: number | null;
  reserves: number | null;
  ebitda: number | null;
  raw: Record<string, number | null>;
}

export interface DocumentRow {
  id: string;
  ipo_id: string;
  kind: string;
  title: string;
  url: string;
}

export interface AnchorRow {
  id: string;
  ipo_id: string;
  name: string;
  group_entity: string | null;
  shares_allotted: number | null;
  amount_cr: number | null;
  pct_allocated: number | null;
  pct_of_issue: number | null;
  position: number;
}

export interface ListingStats {
  count: number;
  avg_listing_gain: number | null;
  median_listing_gain: number | null;
  positive_count: number;
  negative_count: number;
  flat_count: number;
  best: { slug: string; name: string; gain: number } | null;
  worst: { slug: string; name: string; gain: number } | null;
  avg_current_gain: number | null;
  total_raised_cr: number | null;
}

export type UserRole = "investor" | "business";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  is_anonymous: boolean;
  role: UserRole | null;
  company_name: string | null;
  phone: string | null;
  city: string | null;
  is_premium: boolean;
  premium_until: string | null;
  premium_product_id: string | null;
}

export interface NotificationPreferences {
  user_id: string;
  new_ipo: boolean;
  opens_today: boolean;
  closes_today: boolean;
  closing_soon: boolean;
  allotment: boolean;
  refund_demat: boolean;
  listing: boolean;
  subscription_milestone: boolean;
  gmp_change: boolean;
  only_watchlist: boolean;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  ipo_id: string;
  created_at: string;
}
