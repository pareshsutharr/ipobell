// Row types mirroring supabase/migrations (init_schema, business_leads, roles_admins_insights).

export type Board = "mainboard" | "sme";
export type IpoStatus = "upcoming" | "open" | "closed" | "listed";
export type InsightStatus = "draft" | "published";
export type Verdict = "positive" | "neutral" | "cautious";
export type AdminRole = "super_admin" | "editor";
export type LeadStatus = "new" | "contacted" | "qualified" | "closed" | "spam";
export type LeadSource = "readiness-tool" | "eligibility-check" | "issue-size-calculator" | "issue-cost-estimator" | "sme-ipo-checklist" | "book-call" | "business-hub" | "balance-sheet-check";

export interface IpoRow {
  id: string;
  slug: string;
  name: string;
  display_name: string | null;
  board: Board;
  sub_type: string | null;
  status: IpoStatus;
  dates_tba: boolean;
  logo_url: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  listing_date: string | null;
  price_band: string | null;
  issue_price: number | null;
  issue_size_cr: number | null;
  lot_size: number | null;
  min_investment: number | null;
  gmp: number | null;
  gmp_percent: number | null;
  sub_total: number | null;
  listing_price: number | null;
  listing_gain_percent: number | null;
  about: string | null;
  description: string | null;
  promoters_text: string | null;
  web_url: string | null;
}

export const IPO_LIST_COLUMNS =
  "id, slug, name, display_name, board, sub_type, status, dates_tba, logo_url, open_date, close_date, allotment_date, listing_date, price_band, issue_price, issue_size_cr, lot_size, min_investment, gmp, gmp_percent, sub_total, listing_price, listing_gain_percent, about, description, promoters_text, web_url";

export interface Highlight {
  label: string;
  value: string;
}

export interface GalleryItem {
  url: string;
  caption: string;
}

export interface InsightRow {
  id: string;
  ipo_id: string;
  status: InsightStatus;
  headline: string | null;
  summary: string | null;
  company_story: string | null;
  founder_story: string | null;
  listing_journey: string | null;
  lessons: string | null;
  location_city: string | null;
  location_state: string | null;
  founded_year: number | null;
  employees: string | null;
  sector: string | null;
  verdict: Verdict | null;
  verdict_note: string | null;
  takeaways: string[];
  highlights: Highlight[];
  hero_image_url: string | null;
  gallery: GalleryItem[];
  video_url: string | null;
  show_to_investors: boolean;
  author_id: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Editable subset of an insight (what the form holds). */
export type InsightDraft = Omit<InsightRow, "id" | "author_id" | "updated_by" | "published_at" | "created_at" | "updated_at">;

export function emptyInsight(ipoId: string): InsightDraft {
  return {
    ipo_id: ipoId,
    status: "draft",
    headline: null,
    summary: null,
    company_story: null,
    founder_story: null,
    listing_journey: null,
    lessons: null,
    location_city: null,
    location_state: null,
    founded_year: null,
    employees: null,
    sector: null,
    verdict: null,
    verdict_note: null,
    takeaways: [],
    highlights: [],
    hero_image_url: null,
    gallery: [],
    video_url: null,
    show_to_investors: true,
  };
}

export interface LeadRow {
  id: string;
  user_id: string | null;
  source: LeadSource;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  readiness_score: number | null;
  payload: Record<string, unknown>;
  app_version: string | null;
  status: LeadStatus;
  notes: string | null;
  assigned_to: string | null;
  forwarded_at: string | null;
  notified_at: string | null;
  notify_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUserRow {
  user_id: string;
  role: AdminRole;
  display_name: string | null;
  email: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  positive: "Worth a close look",
  neutral: "Balanced",
  cautious: "Proceed with caution",
};

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "closed", "spam"];

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  "readiness-tool": "Readiness score",
  "eligibility-check": "Eligibility check",
  "issue-size-calculator": "Issue size",
  "issue-cost-estimator": "Issue cost",
  "sme-ipo-checklist": "Checklist",
  "book-call": "Book a call",
  "business-hub": "Get Listed hub",
  "balance-sheet-check": "Balance sheet check",
};

export interface LeadNotificationSettings {
  enabled: boolean;
  emails: string[];
}

export interface AppSettingRow<T = unknown> {
  key: string;
  value: T;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

export const DEFAULT_LEAD_NOTIFICATIONS: LeadNotificationSettings = { enabled: true, emails: ["beipoready@gmail.com"] };

// ---------------------------------------------------------------------------
// Analytics (public.analytics_events + analytics_* RPCs)
// ---------------------------------------------------------------------------
export type Audience = "investor" | "business" | "unknown";

export interface AnalyticsEventRow {
  id: number;
  user_id: string | null;
  device_id: string | null;
  session_id: string | null;
  event: string;
  screen: string | null;
  props: Record<string, unknown>;
  role: string | null;
  perspective: string | null;
  platform: string | null;
  app_version: string | null;
  client_ts: string | null;
  created_at: string;
}

export interface AnalyticsTotals {
  users: number;
  new_users: number;
  sessions: number;
  events: number;
  screen_views: number;
  ipo_views: number;
  insight_views: number;
  tool_starts: number;
  tool_completions: number;
  leads: number;
  external_links: number;
  watchlist_adds: number;
  searches: number;
}

export interface AnalyticsOverview {
  totals: AnalyticsTotals;
  by_audience: { audience: Audience | string; users: number; sessions: number; events: number; ipo_views: number; tool_completions: number; leads: number }[];
  by_perspective: { perspective: string; screen_views: number; users: number }[];
  top_screens: { screen: string; views: number; users: number }[];
  top_ipos: { slug: string; name: string | null; board: string | null; views: number; users: number; business_views: number; watchlist_adds: number }[];
  top_insights: { slug: string | null; views: number; users: number }[];
  top_events: { event: string; count: number; users: number }[];
  tools: { tool: string; started: number; completed: number; leads: number; users: number }[];
  readiness_bands: { band: string | null; count: number; avg_percent: number | null }[];
  eligibility_outcomes: { recommended: string; count: number }[];
  external_links: { label: string | null; url: string | null; clicks: number; users: number }[];
  searches: { query: string; count: number }[];
  sign_in_methods: { method: string | null; users: number }[];
  platforms: { platform: string; users: number }[];
  app_versions: { version: string; users: number }[];
  hours: { hour: number; events: number }[];
}

export interface AnalyticsDailyRow {
  day: string;
  users: number;
  new_users: number;
  sessions: number;
  events: number;
  screen_views: number;
  ipo_views: number;
  tool_completions: number;
  leads: number;
  business_users: number;
  investor_users: number;
}

export interface AnalyticsUserRow {
  user_id: string | null;
  device_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  city: string | null;
  audience: Audience | string;
  is_anonymous: boolean;
  first_seen: string | null;
  last_seen: string;
  sessions: number;
  events: number;
  screen_views: number;
  ipo_views: number;
  insight_views: number;
  tools_used: string[] | null;
  tool_completions: number;
  leads: number;
  external_links: number;
  watchlist_adds: number;
  last_screen: string | null;
  last_perspective: string | null;
  platform: string | null;
  app_version: string | null;
}

export interface AnalyticsUserEventRow {
  id: number;
  created_at: string;
  session_id: string | null;
  event: string;
  screen: string | null;
  props: Record<string, unknown>;
  perspective: string | null;
  platform: string | null;
  app_version: string | null;
}

export const ANALYTICS_EVENTS = [
  "app_open",
  "screen_view",
  "sign_in",
  "role_selected",
  "perspective_switch",
  "ipo_view",
  "insight_view",
  "latest_insight_tap",
  "watchlist",
  "search",
  "tool_start",
  "tool_complete",
  "lead_submit",
  "external_link",
  "share",
  "calendar_add",
  "allotment_check",
  "notification_pref",
  "push_open",
] as const;

export const ANALYTICS_TOOLS = ["readiness", "eligibility", "issue_size", "issue_cost", "checklist", "book_call"] as const;

export type JourneyStage = "started" | "completed" | "submitted";

export interface ToolJourneyRow {
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  audience: Audience | string;
  is_anonymous: boolean;
  tool: string;
  first_started: string | null;
  last_activity: string;
  starts: number;
  completed: boolean;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  lead_submitted: boolean;
  lead_at: string | null;
  lead_id: string | null;
  stage: JourneyStage;
  last_screen: string | null;
  platform: string | null;
  app_version: string | null;
}

export const JOURNEY_STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "started", label: "Started, not finished" },
  { value: "completed", label: "Finished, no details sent" },
  { value: "not_submitted", label: "Not submitted" },
  { value: "submitted", label: "Submitted" },
];
