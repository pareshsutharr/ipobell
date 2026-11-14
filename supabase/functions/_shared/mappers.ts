// Pure mapping from IPO Guru API payloads → Be IPO Ready database rows, plus change detection.
// This module has NO runtime dependencies so it can be unit-tested with `node --test` and run in Deno.

// ---------------------------------------------------------------------------
// API shapes (only the parts we rely on; everything else is kept in raw_data)
// ---------------------------------------------------------------------------
export interface ApiGmp {
  price: string | null;
  percentage: string | null;
  kostak: string | null;
  subject_to_sauda: string | null;
  estimated_listing_price: number | null;
  updated_at: string | null;
  updated_at_label?: string | null;
}

export interface ApiListRow {
  slug: string;
  name: string;
  display_name?: string | null;
  type: string; // Mainboard | SME
  sub_type?: string | null;
  status: string; // Upcoming | Open | Closed
  stage?: string | null;
  dates_tba?: boolean | null;
  is_listed?: boolean | null;
  logo?: string | null;
  open_date?: string | null;
  close_date?: string | null;
  allotment_date?: string | null;
  listing_date?: string | null;
  price_band?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  issue_price?: string | number | null;
  issue_size?: string | number | null;
  lot_size?: number | null;
  min_investment?: number | null;
  gmp?: ApiGmp | null;
  subscription_total?: string | number | null;
  listing_price?: string | number | null;
  listing_gain_percent?: number | null;
  cmp?: string | number | null;
  current_gain_percent?: number | null;
  web_url?: string | null;
}

export interface ApiSubscriptionSummary {
  total?: string | number | null;
  qib?: string | number | null;
  nii?: string | number | null;
  retail?: string | number | null;
  employee?: string | number | null;
  shareholder?: string | number | null;
  anchor?: string | number | null;
  applications?: string | number | null;
  updated_at?: string | null;
}

export interface ApiSubscriptionCategory {
  key: string;
  label?: string | null;
  times?: string | null;
  times_value?: number | null;
  shares_offered?: string | null;
  shares_applied?: string | null;
  applications?: string | null;
  demand_crore?: number | null;
  sub_categories?: ApiSubscriptionCategory[];
}

export interface ApiSubscription {
  slug: string;
  summary?: ApiSubscriptionSummary | null;
  categories?: ApiSubscriptionCategory[];
  demand_price?: number | null;
  [key: string]: unknown;
}

export interface ApiDetail extends Omit<ApiListRow, "logo" | "open_date" | "close_date" | "allotment_date" | "listing_date"> {
  images?: { logo?: string | null; feature?: string | null } | null;
  timeline?: {
    open_date?: string | null;
    close_date?: string | null;
    allotment_date?: string | null;
    refund_date?: string | null;
    credit_to_demat_date?: string | null;
    listing_date?: string | null;
  } | null;
  issue?: {
    issue_size?: string | number | null;
    issue_price?: string | number | null;
    price_band?: string | null;
    price_min?: number | null;
    price_max?: number | null;
    face_value?: string | number | null;
    lot_size?: number | null;
    min_investment?: number | null;
    sale_type?: string | null;
    listing_on?: string | null;
    employee_discount?: string | null;
    bse_scrip_code?: string | null;
    nse_symbol?: string | null;
  } | null;
  subscription_summary?: ApiSubscriptionSummary | null;
  listing?: {
    listing_price?: string | number | null;
    listing_gain_percent?: number | null;
    cmp?: string | number | null;
    cmp_updated_at?: string | null;
    current_gain_percent?: number | null;
  } | null;
  lot_calculator?: unknown[] | null;
  reservation?: unknown[] | null;
  shares_offered?: Record<string, unknown> | null;
  company?: {
    about?: string | null;
    description?: string | null;
    strengths?: string[] | null;
    risks?: string[] | null;
    objects_of_issue?: { items?: { object: string; amount?: string }[]; text?: string | null } | null;
    financials?: ApiFinancials | null;
    kpis?: { key: string; label: string; value: string }[] | null;
    promoters_text?: string | null;
    promoters?: unknown[] | null;
    pre_holding?: string | null;
    post_holding?: string | null;
    holding_pattern_desc?: string | null;
  } | null;
  contacts?: {
    company?: Record<string, unknown> | null;
    registrar?: Record<string, unknown> | null;
    lead_managers?: unknown[] | null;
  } | null;
  documents?: Record<string, string | null> | null;
}

/** One entry of the mirror's GET /live: every IPO open or closed within the last day, with its subscription payload. */
export interface ApiLiveEntry {
  ipo: ApiListRow;
  subscription: ApiSubscription | null;
}

export interface ApiGmpHistory {
  summary?: { issue_price?: number | null } | null;
  trend?: {
    date: string;
    price?: string | null;
    price_value?: number | null;
    percentage?: string | null;
    kostak?: string | null;
    subject_to_sauda?: string | null;
    estimated_listing_price?: number | null;
  }[];
}

export interface ApiAnchors {
  summary?: { total_anchors?: number | null; total_amount_cr?: number | null; mutual_fund_count?: number | null; anchor_document?: string | null } | null;
  anchors?: { name?: string | null; group_entity?: string | null; shares_allotted?: number | null; amount_cr?: number | null; pct_allocated?: number | null; pct_allotment_of_issue?: number | null }[];
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------
export type IpoStatus = "upcoming" | "open" | "closed" | "listed";

/** Parse "1,23,456", "82", 82, "" → number | null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[,₹%\s]/g, "").replace(/shares?$/i, "");
  if (cleaned === "" || cleaned === "-" || cleaned.toLowerCase() === "null") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function dateOnly(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export function timestamp(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function board(type: unknown): "mainboard" | "sme" {
  return String(type ?? "").toLowerCase().includes("sme") ? "sme" : "mainboard";
}

export function deriveStatus(row: { status?: string | null; is_listed?: boolean | null; dates_tba?: boolean | null }): IpoStatus {
  if (row.is_listed) return "listed";
  if (row.dates_tba) return "upcoming";
  const s = String(row.status ?? "").toLowerCase();
  if (s === "open" || s === "closed" || s === "upcoming") return s;
  if (s === "listed") return "listed";
  return "upcoming";
}

/** Convert an ISO timestamp to the IST calendar date (YYYY-MM-DD). */
export function istDate(input: string | Date = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

export function addDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// ipos row from the list endpoint (/ipos)
// ---------------------------------------------------------------------------
export interface IpoListRowDb {
  slug: string;
  name: string;
  display_name: string | null;
  board: "mainboard" | "sme";
  sub_type: string | null;
  status: IpoStatus;
  api_status: string | null;
  stage: string | null;
  dates_tba: boolean;
  is_listed: boolean;
  logo_url: string | null;
  web_url: string | null;
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
  gmp_kostak: string | null;
  gmp_subject_to_sauda: string | null;
  gmp_expected_price: number | null;
  gmp_updated_at: string | null;
  sub_total: number | null;
  listing_price: number | null;
  listing_gain_percent: number | null;
  cmp: number | null;
  current_gain_percent: number | null;
  raw_data: Record<string, unknown>;
  list_synced_at: string;
  last_synced_at: string;
}

export function mapListRow(row: ApiListRow, now = new Date().toISOString()): IpoListRowDb {
  const g = row.gmp ?? null;
  return {
    slug: row.slug,
    name: str(row.name) ?? row.slug,
    display_name: str(row.display_name),
    board: board(row.type),
    sub_type: str(row.sub_type),
    status: deriveStatus(row),
    api_status: str(row.status),
    stage: str(row.stage),
    dates_tba: Boolean(row.dates_tba),
    is_listed: Boolean(row.is_listed),
    logo_url: str(row.logo),
    web_url: str(row.web_url),
    open_date: dateOnly(row.open_date),
    close_date: dateOnly(row.close_date),
    allotment_date: dateOnly(row.allotment_date),
    listing_date: dateOnly(row.listing_date),
    price_band: str(row.price_band),
    price_min: num(row.price_min),
    price_max: num(row.price_max),
    issue_price: num(row.issue_price),
    issue_size_cr: num(row.issue_size),
    lot_size: int(row.lot_size),
    min_investment: num(row.min_investment),
    gmp: num(g?.price),
    gmp_percent: num(g?.percentage),
    gmp_kostak: str(g?.kostak),
    gmp_subject_to_sauda: str(g?.subject_to_sauda),
    gmp_expected_price: num(g?.estimated_listing_price),
    gmp_updated_at: timestamp(g?.updated_at),
    sub_total: num(row.subscription_total),
    listing_price: num(row.listing_price),
    listing_gain_percent: num(row.listing_gain_percent),
    cmp: num(row.cmp),
    current_gain_percent: num(row.current_gain_percent),
    raw_data: { list: row },
    list_synced_at: now,
    last_synced_at: now,
  };
}

// ---------------------------------------------------------------------------
// ipos columns from the detail endpoint (/ipos/{slug})
// ---------------------------------------------------------------------------
export interface IpoDetailDb {
  slug: string;
  display_name: string | null;
  logo_url: string | null;
  feature_image_url: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  credit_to_demat_date: string | null;
  listing_date: string | null;
  price_band: string | null;
  price_min: number | null;
  price_max: number | null;
  issue_price: number | null;
  issue_size_cr: number | null;
  face_value: number | null;
  lot_size: number | null;
  min_investment: number | null;
  sale_type: string | null;
  listing_on: string | null;
  employee_discount: string | null;
  bse_scrip_code: string | null;
  nse_symbol: string | null;
  lot_calculator: unknown[];
  reservation: unknown[];
  shares_offered: Record<string, unknown>;
  sub_total: number | null;
  sub_qib: number | null;
  sub_nii: number | null;
  sub_retail: number | null;
  sub_employee: number | null;
  sub_shareholder: number | null;
  sub_anchor: number | null;
  sub_applications: number | null;
  sub_updated_at: string | null;
  listing_price: number | null;
  listing_gain_percent: number | null;
  cmp: number | null;
  cmp_updated_at: string | null;
  current_gain_percent: number | null;
  about: string | null;
  description: string | null;
  strengths: string[];
  risks: string[];
  objectives: unknown[];
  objectives_text: string | null;
  financials: Record<string, unknown>;
  kpis: unknown[];
  promoters_text: string | null;
  promoters: unknown[];
  pre_issue_holding: string | null;
  post_issue_holding: string | null;
  holding_pattern_desc: string | null;
  company_contact: Record<string, unknown>;
  registrar: Record<string, unknown>;
  lead_managers: unknown[];
  documents: Record<string, unknown>;
  detail_synced_at: string;
  last_synced_at: string;
}

export function mapDetail(d: ApiDetail, now = new Date().toISOString()): IpoDetailDb {
  const t = d.timeline ?? {};
  const i = d.issue ?? {};
  const s = d.subscription_summary ?? {};
  const l = d.listing ?? {};
  const c = d.company ?? {};
  const ct = d.contacts ?? {};
  return {
    slug: d.slug,
    display_name: str(d.display_name),
    logo_url: str(d.images?.logo),
    feature_image_url: str(d.images?.feature),
    open_date: dateOnly(t.open_date),
    close_date: dateOnly(t.close_date),
    allotment_date: dateOnly(t.allotment_date),
    refund_date: dateOnly(t.refund_date),
    credit_to_demat_date: dateOnly(t.credit_to_demat_date),
    listing_date: dateOnly(t.listing_date),
    price_band: str(i.price_band),
    price_min: num(i.price_min),
    price_max: num(i.price_max),
    issue_price: num(i.issue_price),
    issue_size_cr: num(i.issue_size),
    face_value: num(i.face_value),
    lot_size: int(i.lot_size),
    min_investment: num(i.min_investment),
    sale_type: str(i.sale_type),
    listing_on: str(i.listing_on),
    employee_discount: str(i.employee_discount),
    bse_scrip_code: str(i.bse_scrip_code),
    nse_symbol: str(i.nse_symbol),
    lot_calculator: Array.isArray(d.lot_calculator) ? d.lot_calculator : [],
    reservation: Array.isArray(d.reservation) ? d.reservation : [],
    shares_offered: d.shares_offered && typeof d.shares_offered === "object" ? d.shares_offered : {},
    sub_total: num(s.total),
    sub_qib: num(s.qib),
    sub_nii: num(s.nii),
    sub_retail: num(s.retail),
    sub_employee: num(s.employee),
    sub_shareholder: num(s.shareholder),
    sub_anchor: num(s.anchor),
    sub_applications: int(s.applications),
    sub_updated_at: timestamp(s.updated_at),
    listing_price: num(l.listing_price),
    listing_gain_percent: num(l.listing_gain_percent),
    cmp: num(l.cmp),
    cmp_updated_at: timestamp(l.cmp_updated_at),
    current_gain_percent: num(l.current_gain_percent),
    about: str(c.about),
    description: str(c.description),
    strengths: (c.strengths ?? []).filter((x): x is string => typeof x === "string" && x.trim() !== ""),
    risks: (c.risks ?? []).filter((x): x is string => typeof x === "string" && x.trim() !== ""),
    objectives: c.objects_of_issue?.items ?? [],
    objectives_text: str(c.objects_of_issue?.text),
    financials: (c.financials ?? {}) as Record<string, unknown>,
    kpis: c.kpis ?? [],
    promoters_text: str(c.promoters_text),
    promoters: Array.isArray(c.promoters) ? c.promoters : [],
    pre_issue_holding: str(c.pre_holding),
    post_issue_holding: str(c.post_holding),
    holding_pattern_desc: str(c.holding_pattern_desc),
    company_contact: ct.company ?? {},
    registrar: ct.registrar ?? {},
    lead_managers: Array.isArray(ct.lead_managers) ? ct.lead_managers : [],
    documents: d.documents ?? {},
    detail_synced_at: now,
    last_synced_at: now,
  };
}

// ---------------------------------------------------------------------------
// ipo_financials rows (flatten headers × rows)
// ---------------------------------------------------------------------------
export interface FinancialRowDb {
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

const METRIC_COLUMNS: [RegExp, keyof Omit<FinancialRowDb, "ipo_id" | "period" | "period_order" | "raw">][] = [
  [/revenue/i, "revenue"],
  [/total income/i, "total_income"],
  [/profit after tax|^pat$|net profit|profit/i, "profit"],
  [/net worth/i, "net_worth"],
  [/total assets|^assets/i, "total_assets"],
  [/borrow|debt/i, "total_borrowing"],
  [/reserves/i, "reserves"],
  [/ebitda/i, "ebitda"],
];

export interface ApiFinancials {
  headers?: string[];
  rows?: { metric: string; data: (string | number | null)[] }[];
  unit?: string;
  text?: string | null;
}

export function mapFinancials(ipoId: string, fin: ApiFinancials | null | undefined): FinancialRowDb[] {
  const headers = fin?.headers ?? [];
  const rows = fin?.rows ?? [];
  if (!headers.length || !rows.length) return [];
  return headers.map((period, idx) => {
    const out: FinancialRowDb = {
      ipo_id: ipoId,
      period: String(period),
      period_order: idx,
      revenue: null,
      total_income: null,
      profit: null,
      net_worth: null,
      total_assets: null,
      total_borrowing: null,
      reserves: null,
      ebitda: null,
      raw: {},
    };
    for (const r of rows) {
      const value = num(r.data?.[idx]);
      out.raw[r.metric] = value;
      for (const [re, col] of METRIC_COLUMNS) {
        if (re.test(r.metric) && out[col] === null) {
          out[col] = value;
          break;
        }
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// ipo_documents rows
// ---------------------------------------------------------------------------
const DOC_TITLES: Record<string, string> = {
  rhp: "Red Herring Prospectus (RHP)",
  drhp: "Draft Red Herring Prospectus (DRHP)",
  anchor: "Anchor Investor Allocation",
  boa: "Basis of Allotment",
};

export function mapDocuments(ipoId: string, docs: Record<string, string | null> | null | undefined) {
  const out: { ipo_id: string; kind: string; title: string; url: string }[] = [];
  for (const [kind, url] of Object.entries(docs ?? {})) {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      out.push({ ipo_id: ipoId, kind, title: DOC_TITLES[kind] ?? kind.toUpperCase(), url });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// ipo_subscriptions snapshot rows
// ---------------------------------------------------------------------------
export interface SubscriptionRowDb {
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

export function mapSubscriptionRows(ipoId: string, sub: ApiSubscription, fallbackTime = new Date().toISOString()): SubscriptionRowDb[] {
  const snapshot = timestamp(sub.summary?.updated_at) ?? fallbackTime;
  const out: SubscriptionRowDb[] = [];
  const push = (c: ApiSubscriptionCategory, parent: string) => {
    const times = c.times_value ?? num(c.times);
    const applied = int(c.shares_applied);
    // skip empty leaf buckets
    if (times === null && applied === null && c.demand_crore == null) return;
    out.push({
      ipo_id: ipoId,
      category_key: c.key,
      parent_key: parent,
      label: str(c.label),
      times_subscribed: times,
      shares_offered: int(c.shares_offered),
      shares_applied: applied,
      applications: int(c.applications),
      demand_crore: num(c.demand_crore),
      snapshot_time: snapshot,
    });
  };
  for (const c of sub.categories ?? []) {
    push(c, "");
    for (const sc of c.sub_categories ?? []) push(sc, c.key);
  }
  return out;
}

export function mapSubscriptionSummary(summary: ApiSubscriptionSummary | null | undefined, now = new Date().toISOString()) {
  const s = summary ?? {};
  return {
    sub_total: num(s.total),
    sub_qib: num(s.qib),
    sub_nii: num(s.nii),
    sub_retail: num(s.retail),
    sub_employee: num(s.employee),
    sub_shareholder: num(s.shareholder),
    sub_anchor: num(s.anchor),
    sub_applications: int(s.applications),
    sub_updated_at: timestamp(s.updated_at),
    subscription_synced_at: now,
    last_synced_at: now,
  };
}

// ---------------------------------------------------------------------------
// ipo_gmp_history rows
// ---------------------------------------------------------------------------
export interface GmpHistoryRowDb {
  ipo_id: string;
  recorded_on: string;
  gmp: number | null;
  gmp_percent: number | null;
  expected_price: number | null;
  kostak: string | null;
  subject_to_sauda: string | null;
  recorded_at: string;
}

export function mapGmpHistoryRows(ipoId: string, hist: ApiGmpHistory): GmpHistoryRowDb[] {
  return (hist.trend ?? [])
    .filter((p) => dateOnly(p.date))
    .map((p) => ({
      ipo_id: ipoId,
      recorded_on: dateOnly(p.date) as string,
      gmp: p.price_value ?? num(p.price),
      gmp_percent: num(p.percentage),
      expected_price: num(p.estimated_listing_price),
      kostak: str(p.kostak),
      subject_to_sauda: str(p.subject_to_sauda),
      recorded_at: `${dateOnly(p.date)}T16:30:00.000Z`, // 22:00 IST — "that day's last reading"
    }));
}

/** A single live GMP reading → today's history point (upsert on ipo_id+recorded_on). */
export function gmpReadingToHistoryRow(ipoId: string, row: Pick<IpoListRowDb, "gmp" | "gmp_percent" | "gmp_expected_price" | "gmp_kostak" | "gmp_subject_to_sauda" | "gmp_updated_at">): GmpHistoryRowDb | null {
  if (row.gmp === null || !row.gmp_updated_at) return null;
  return {
    ipo_id: ipoId,
    recorded_on: istDate(row.gmp_updated_at),
    gmp: row.gmp,
    gmp_percent: row.gmp_percent,
    expected_price: row.gmp_expected_price,
    kostak: row.gmp_kostak,
    subject_to_sauda: row.gmp_subject_to_sauda,
    recorded_at: row.gmp_updated_at,
  };
}

// ---------------------------------------------------------------------------
// ipo_anchors rows
// ---------------------------------------------------------------------------
export function mapAnchors(ipoId: string, a: ApiAnchors) {
  const rows = (a.anchors ?? [])
    .filter((x) => str(x.name))
    .map((x, position) => ({
      ipo_id: ipoId,
      name: str(x.name) as string,
      group_entity: str(x.group_entity),
      shares_allotted: int(x.shares_allotted),
      amount_cr: num(x.amount_cr),
      pct_allocated: num(x.pct_allocated),
      pct_of_issue: num(x.pct_allotment_of_issue),
      position,
    }));
  const summary = {
    anchor_total_count: int(a.summary?.total_anchors) ?? rows.length,
    anchor_total_cr: num(a.summary?.total_amount_cr),
    anchor_mf_count: int(a.summary?.mutual_fund_count),
  };
  return { rows, summary, document: str(a.summary?.anchor_document) };
}

// ---------------------------------------------------------------------------
// Change detection → notification events
// ---------------------------------------------------------------------------
export type EventType =
  | "new_ipo"
  | "listed"
  | "subscription_milestone"
  | "gmp_change";

export interface IpoEvent {
  type: EventType;
  slug: string;
  dedupeKey: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

export const MILESTONES = [1, 2, 5, 10, 25, 50, 100, 200];

export const MILESTONE_CATEGORIES: { col: "sub_retail" | "sub_nii" | "sub_qib" | "sub_total"; label: string }[] = [
  { col: "sub_total", label: "Overall" },
  { col: "sub_retail", label: "Retail" },
  { col: "sub_nii", label: "NII (HNI)" },
  { col: "sub_qib", label: "QIB" },
];

/** Highest milestone ≤ value, or null. */
export function milestoneFor(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  let hit: number | null = null;
  for (const m of MILESTONES) if (value >= m) hit = m;
  return hit;
}

export interface PrevIpoState {
  status: IpoStatus;
  open_date: string | null;
  gmp: number | null;
  gmp_percent: number | null;
  listing_price: number | null;
  sub_total: number | null;
  sub_retail: number | null;
  sub_nii: number | null;
  sub_qib: number | null;
}

export function fmtInr(n: number): string {
  // ₹1,23,456.5 Indian grouping
  const neg = n < 0;
  const [intPart, dec] = Math.abs(n).toFixed(n % 1 === 0 ? 0 : 2).split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}₹${grouped}${dec ? "." + dec : ""}`;
}

export function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function fmtTimes(n: number): string {
  return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}x`;
}

export function fmtDateShort(yyyyMmDd: string | null): string {
  if (!yyyyMmDd) return "TBA";
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

export interface DetectOptions {
  /** GMP change (percentage points of cap price) needed to raise an alert. */
  gmpThresholdPct?: number;
  /** Suppress "new IPO" events for issues whose open date is older than this many days (backfills). */
  newIpoMaxAgeDays?: number;
  today?: string; // IST date
}

export function detectEvents(
  prev: PrevIpoState | null,
  next: Pick<IpoListRowDb, "slug" | "name" | "status" | "open_date" | "close_date" | "board" | "gmp" | "gmp_percent" | "gmp_expected_price" | "listing_price" | "listing_gain_percent" | "issue_price" | "price_max" | "price_band" | "sub_total"> & Partial<Pick<IpoDetailDb, "sub_retail" | "sub_nii" | "sub_qib">>,
  opts: DetectOptions = {},
): IpoEvent[] {
  const events: IpoEvent[] = [];
  const today = opts.today ?? istDate();
  const threshold = opts.gmpThresholdPct ?? 2;
  const maxAge = opts.newIpoMaxAgeDays ?? 45;
  const boardLabel = next.board === "sme" ? "SME IPO" : "Mainboard IPO";
  const base = { slug: next.slug, board: next.board };

  // 1. New IPO
  if (!prev && (next.status === "upcoming" || next.status === "open")) {
    const tooOld = next.open_date ? next.open_date < addDays(today, -maxAge) : false;
    if (!tooOld) {
      const when = next.open_date ? `Opens ${fmtDateShort(next.open_date)}` : "Dates to be announced";
      const band = next.price_band ? ` · Price band ₹${next.price_band}` : "";
      events.push({
        type: "new_ipo",
        slug: next.slug,
        dedupeKey: `new_ipo:${next.slug}`,
        title: `New ${boardLabel}: ${next.name}`,
        body: `${when}${band}`,
        data: { ...base, type: "new_ipo" },
      });
    }
  }

  // 2. Listed (listing price appears)
  if (next.status === "listed" && next.listing_price !== null && (prev === null || prev.listing_price === null)) {
    const gain = next.listing_gain_percent ?? (next.issue_price ? ((next.listing_price - next.issue_price) / next.issue_price) * 100 : null);
    const gainTxt = gain === null ? "" : ` (${fmtPct(gain)} vs issue price)`;
    // only for fresh listings (within 3 days) so backfills don't spam
    const fresh = !next.close_date || next.close_date >= addDays(today, -10);
    if (fresh) {
      events.push({
        type: "listed",
        slug: next.slug,
        dedupeKey: `listed:${next.slug}`,
        title: `${next.name} listed at ${fmtInr(next.listing_price)}`,
        body: `${gain !== null && gain >= 0 ? "📈" : "📉"} Listed at ${fmtInr(next.listing_price)}${gainTxt}`,
        data: { ...base, type: "listed" },
      });
    }
  }

  // 3. Subscription milestones (open issues only)
  if (next.status === "open") {
    for (const { col, label } of MILESTONE_CATEGORIES) {
      const nextVal = (next as Record<string, unknown>)[col] as number | null | undefined;
      const prevVal = prev ? prev[col] : null;
      const m = milestoneFor(nextVal);
      const pm = milestoneFor(prevVal);
      if (m !== null && (pm === null || m > pm) && m >= 1) {
        events.push({
          type: "subscription_milestone",
          slug: next.slug,
          dedupeKey: `milestone:${next.slug}:${col}:${m}`,
          title: `${next.name}: ${label} subscribed ${m}x`,
          body: `${label} portion is now ${fmtTimes(nextVal as number)} subscribed${col !== "sub_total" && next.sub_total !== null ? ` · Overall ${fmtTimes(next.sub_total)}` : ""}`,
          data: { ...base, type: "subscription_milestone", category: col, milestone: String(m) },
        });
      }
    }
  }

  // 4. GMP change (upcoming/open/closed-not-listed)
  if (prev && next.status !== "listed" && next.gmp_percent !== null && prev.gmp_percent !== null) {
    const delta = next.gmp_percent - prev.gmp_percent;
    if (Math.abs(delta) >= threshold) {
      const dir = delta > 0 ? "up" : "down";
      const expected = next.gmp_expected_price ?? (next.price_max !== null && next.gmp !== null ? next.price_max + next.gmp : null);
      events.push({
        type: "gmp_change",
        slug: next.slug,
        dedupeKey: `gmp_change:${next.slug}:${today}:${dir}`,
        title: `${next.name} GMP ${dir === "up" ? "up" : "down"} to ${fmtInr(next.gmp ?? 0)}`,
        body: `GMP ${fmtPct(next.gmp_percent)}${expected ? ` · Est. listing ${fmtInr(expected)}` : ""} (was ${fmtPct(prev.gmp_percent)})`,
        data: { ...base, type: "gmp_change", direction: dir },
      });
    }
  }

  return events;
}
