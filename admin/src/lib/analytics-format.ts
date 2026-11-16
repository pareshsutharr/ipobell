// Human wording for analytics rows: screen paths, tools, events → sentences; date-range parsing (IST).
import type { AnalyticsEventRow, AnalyticsUserEventRow, Audience } from "./types";

const IST_OFFSET = "+05:30";

export const TOOL_LABEL: Record<string, string> = {
  readiness: "Readiness score",
  eligibility: "Eligibility check",
  issue_size: "Issue size calculator",
  issue_cost: "Issue cost estimator",
  valuation: "Valuation range",
  peers: "Compare my company",
  health_check: "Balance sheet check",
  checklist: "SME IPO checklist",
  book_call: "Book a call",
};

export const SOURCE_TO_TOOL: Record<string, string> = {
  "readiness-tool": "readiness",
  "eligibility-check": "eligibility",
  "issue-size-calculator": "issue_size",
  "issue-cost-estimator": "issue_cost",
  "sme-ipo-checklist": "checklist",
  "book-call": "book_call",
  "business-hub": "business-hub",
  "balance-sheet-check": "health_check",
};

export const AUDIENCE_LABEL: Record<string, string> = { investor: "Investor", business: "Business owner", unknown: "Not chosen" };

export function audienceTone(a: Audience | string): "navy" | "gold" | "neutral" {
  return a === "business" ? "gold" : a === "investor" ? "navy" : "neutral";
}

export function toolLabel(t: string | null | undefined): string {
  if (!t) return "—";
  return TOOL_LABEL[t] ?? t.replace(/[_-]/g, " ");
}

const SCREEN_LABELS: [RegExp, string][] = [
  [/^\/$/, "Home (IPO list)"],
  [/^\/index$/, "Home (IPO list)"],
  [/^\/welcome$/, "Welcome / sign-in"],
  [/^\/sign-in$/, "Email sign-in"],
  [/^\/choose-role$/, "Choose role"],
  [/^\/auth\/callback$/, "Auth callback"],
  [/^\/search$/, "Search"],
  [/^\/notifications$/, "Notification settings"],
  [/^\/watchlist$/, "Watchlist"],
  [/^\/allotment$/, "Allotment tracker"],
  [/^\/applications\/add$/, "Add application"],
  [/^\/applications\/check$/, "Check allotment"],
  [/^\/applications\/pans$/, "Saved PANs"],
  [/^\/profile$/, "Profile"],
  [/^\/about$/, "About"],
  [/^\/legal\/privacy$/, "Privacy policy"],
  [/^\/legal\/disclaimer$/, "Disclaimer"],
  [/^\/business$/, "Get Listed hub"],
  [/^\/business\/readiness$/, "Readiness tool"],
  [/^\/business\/eligibility$/, "Eligibility tool"],
  [/^\/business\/issue-size$/, "Issue size calculator"],
  [/^\/business\/issue-cost$/, "Issue cost estimator"],
  [/^\/business\/checklist$/, "SME IPO checklist"],
  [/^\/business\/book-call$/, "Book a call"],
];

/** "/ipo/bls-polymers-ipo" → { label: "IPO page", detail: "bls-polymers-ipo" } */
export function humaniseScreen(path: string | null | undefined): { label: string; detail: string | null } {
  if (!path) return { label: "—", detail: null };
  const clean = path.replace(/^\/\(tabs\)/, "").replace(/\/\([^)]*\)/g, "").split("?")[0] || "/";
  const ipo = clean.match(/^\/ipo\/([^/]+)$/);
  if (ipo) return { label: "IPO page", detail: ipo[1] === "[slug]" ? null : ipo[1] };
  for (const [re, label] of SCREEN_LABELS) if (re.test(clean)) return { label, detail: null };
  return { label: clean, detail: null };
}

export function screenLabel(path: string | null | undefined): string {
  const h = humaniseScreen(path);
  return h.detail ? `${h.label} · ${h.detail}` : h.label;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
}

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname.replace(/\/$/, "") : "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").slice(0, 60);
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(r: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
}

function cr(n: number | null): string {
  if (n === null) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 1 })} Cr`;
}

const PLATFORM_LABEL: Record<string, string> = { nse_emerge: "NSE Emerge", bse_sme: "BSE SME", mainboard: "Main Board", none: "none yet" };

/**
 * Readable one-liner for a tool result (the props of a tool_complete event, or ToolJourneyRow.result).
 * Accepts both snake_case and camelCase keys since the app has sent both.
 */
export function describeToolResult(tool: string | null | undefined, result: Record<string, unknown> | null | undefined): string {
  const r = (result ?? {}) as Record<string, unknown>;
  switch (tool) {
    case "readiness": {
      const percent = num(pick(r, "percent"));
      const score = num(pick(r, "score", "scoreOutOf10", "score_out_of_10"));
      const band = str(pick(r, "band", "band_title"));
      const weakest = pick(r, "weakest");
      const weakTxt = Array.isArray(weakest) ? weakest.map((w) => (typeof w === "string" ? w : str((w as Record<string, unknown>)?.title) ?? "")).filter(Boolean).join(", ") : str(weakest);
      const bits = [percent !== null ? `${percent}%` : score !== null ? `${score}/10` : null, band, weakTxt ? `weakest: ${weakTxt}` : null].filter(Boolean);
      return bits.length ? bits.join(" · ") : "Readiness check finished";
    }
    case "eligibility": {
      const rec = str(pick(r, "recommended"));
      const verdict = str(pick(r, "verdict"));
      const blockers = pick(r, "blockers");
      const nBlock = Array.isArray(blockers) ? blockers.length : num(blockers);
      if (rec && rec !== "none") return `${PLATFORM_LABEL[rec] ?? rec.replace(/_/g, " ")} recommended${nBlock ? ` · ${nBlock} blocker${nBlock === 1 ? "" : "s"}` : ""}`;
      return `Not eligible yet${verdict ? ` · ${verdict}` : ""}${nBlock ? ` · ${nBlock} blocker${nBlock === 1 ? "" : "s"}` : ""}`;
    }
    case "issue_size": {
      const lo = num(pick(r, "issue_low", "issueLow"));
      const hi = num(pick(r, "issue_high", "issueHigh"));
      const pe = num(pick(r, "pe"));
      const sector = str(pick(r, "sector"));
      const pat = num(pick(r, "pat", "pat_cr", "patCr"));
      const bits = [lo !== null && hi !== null ? `₹${lo}–${hi} Cr issue` : null, pe !== null ? `PE ${pe}` : null, sector, pat !== null ? `PAT ${cr(pat)}` : null].filter(Boolean);
      return bits.length ? bits.join(" · ") : "Issue size calculated";
    }
    case "issue_cost": {
      const size = num(pick(r, "issue_size_cr", "size", "issueSizeCr"));
      const total = num(pick(r, "total_cr", "total", "totalCr"));
      if (size !== null || total !== null) return `${cr(total)} cost on ${cr(size)}`;
      return "Issue cost estimated";
    }
    case "checklist": {
      const done = num(pick(r, "done"));
      const total = num(pick(r, "total"));
      const percent = num(pick(r, "percent"));
      if (done !== null && total !== null) return `${done}/${total} steps${percent !== null ? ` · ${percent}%` : ""}`;
      return percent !== null ? `${percent}% of checklist` : "Checklist updated";
    }
    case "book_call":
      return "Call requested";
    default: {
      const c = compactProps(r, 4);
      return c || "—";
    }
  }
}

/** One readable sentence for an event. Shared by the audience timeline and the events explorer. */
export function describeEvent(e: Pick<AnalyticsEventRow | AnalyticsUserEventRow, "event" | "screen" | "props" | "perspective">): string {
  const p = (e.props ?? {}) as Record<string, unknown>;
  const slug = str(p.slug);
  const name = str(p.name);
  const ipoLabel = name ? `${name}${str(p.board) ? ` (${str(p.board) === "sme" ? "SME" : "Mainboard"})` : ""}` : slug ? slug : "an IPO";
  switch (e.event) {
    case "app_open":
      return p.cold ? "Opened the app" : "Returned to the app";
    case "screen_view":
      return `Viewed ${screenLabel(e.screen ?? str(p.path))}`;
    case "sign_in": {
      const m = str(p.method);
      return m === "guest" ? "Continued as guest" : m === "signup" ? "Created an account with email" : m === "google" ? "Signed in with Google" : m === "email" ? "Signed in with email" : "Signed in";
    }
    case "role_selected":
      return `Chose "${str(p.role) === "business" ? "I own or run a business" : str(p.role) === "investor" ? "I invest in IPOs" : str(p.role) ?? "?"}"`;
    case "perspective_switch":
      return `Switched to ${str(p.to) === "business" ? "Business" : "Investor"} view`;
    case "ipo_view":
      return `Viewed IPO ${ipoLabel}${e.perspective === "business" ? " in Business view" : ""}`;
    case "insight_view":
      return `Read the business insight for ${ipoLabel}${str(p.verdict) ? ` · view: ${str(p.verdict)}` : ""}`;
    case "latest_insight_tap":
      return `Tapped a latest-insight card${slug ? ` · ${slug}` : ""}`;
    case "watchlist":
      return `${str(p.action) === "remove" ? "Removed" : "Added"} ${ipoLabel} ${str(p.action) === "remove" ? "from" : "to"} watchlist`;
    case "search":
      return `Searched "${str(p.query) ?? ""}"${p.results !== undefined ? ` · ${str(p.results)} results` : ""}`;
    case "tool_start":
      return `Started ${toolLabel(str(p.tool))}`;
    case "tool_complete": {
      const t = str(p.tool);
      const { tool: _tool, ...rest } = p;
      void _tool;
      const summary = describeToolResult(t, rest);
      return `Completed ${toolLabel(t).toLowerCase()}${summary && summary !== "—" ? ` · ${summary}` : ""}`;
    }
    case "lead_submit": {
      const src = str(p.source) ?? str(p.tool);
      const contact = [p.has_phone ? "phone" : null, p.has_email ? "email" : null].filter(Boolean).join(" + ");
      return `Submitted lead${src ? ` · ${src}` : ""}${contact ? ` · with ${contact}` : ""}`;
    }
    case "external_link":
      return `Opened link ${str(p.label) ? `${str(p.label)} · ` : ""}${host(str(p.url)) ?? "?"}`;
    case "share":
      return `Shared ${ipoLabel}`;
    case "calendar_add":
      return `Added ${ipoLabel} dates to calendar`;
    case "allotment_check":
      return `Checked allotment for ${ipoLabel}${str(p.registrar) ? ` at ${str(p.registrar)}` : ""}`;
    case "notification_pref":
      return `Set notification "${str(p.key) ?? "?"}" to ${str(p.value) ?? "?"}`;
    case "push_open":
      return `Opened a push notification${str(p.type) ? ` · ${str(p.type)}` : ""}${slug ? ` · ${slug}` : ""}`;
    default:
      return `${e.event.replace(/_/g, " ")}${Object.keys(p).length ? ` · ${compactProps(p)}` : ""}`;
  }
}

/** "slug: x · board: sme" */
export function compactProps(p: Record<string, unknown> | null | undefined, max = 6): string {
  if (!p) return "";
  return Object.entries(p)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, max)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function eventTone(event: string): "neutral" | "navy" | "green" | "amber" | "red" | "blue" | "gold" {
  switch (event) {
    case "lead_submit":
      return "gold";
    case "tool_complete":
      return "green";
    case "tool_start":
      return "blue";
    case "ipo_view":
    case "insight_view":
      return "navy";
    case "external_link":
      return "amber";
    default:
      return "neutral";
  }
}

// ---------------------------------------------------------------------------
// Date range (IST calendar days), kept in URL search params: range=today|7d|30d|90d|custom&from=&to=
// ---------------------------------------------------------------------------
export type RangePreset = "today" | "7d" | "30d" | "90d" | "custom";

export interface DateRange {
  preset: RangePreset;
  /** inclusive IST calendar day, YYYY-MM-DD */
  fromDay: string;
  /** inclusive IST calendar day, YYYY-MM-DD */
  toDay: string;
  /** ISO timestamps for the RPCs: [from, to) */
  from: string;
  to: string;
  label: string;
  days: number;
}

export function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseRange(sp: Record<string, string | string[] | undefined>): DateRange {
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const today = istToday();
  let preset = (get("range") || "30d") as RangePreset;
  let fromDay: string;
  let toDay = today;
  if (preset === "custom" && DAY.test(get("from"))) {
    fromDay = get("from");
    toDay = DAY.test(get("to")) ? get("to") : today;
    if (toDay < fromDay) [fromDay, toDay] = [toDay, fromDay];
  } else {
    if (!["today", "7d", "30d", "90d"].includes(preset)) preset = "30d";
    fromDay = preset === "today" ? today : addDays(today, -(preset === "7d" ? 6 : preset === "30d" ? 29 : 89));
  }
  const from = `${fromDay}T00:00:00${IST_OFFSET}`;
  const to = `${addDays(toDay, 1)}T00:00:00${IST_OFFSET}`;
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const label = preset === "today" ? `Today (${fmt(today)})` : preset === "custom" ? `${fmt(fromDay)} – ${fmt(toDay)}` : `Last ${days} days · ${fmt(fromDay)} – ${fmt(toDay)}`;
  return { preset, fromDay, toDay, from, to, label, days };
}

export function rangeParams(r: Pick<DateRange, "preset" | "fromDay" | "toDay">): string {
  const p = new URLSearchParams();
  p.set("range", r.preset);
  if (r.preset === "custom") {
    p.set("from", r.fromDay);
    p.set("to", r.toDay);
  }
  return p.toString();
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("en-IN");
}

export function fmtPct(num: number, den: number, decimals = 1): string {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(decimals)}%`;
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

export function userLabel(u: { display_name?: string | null; email?: string | null; user_id?: string | null; is_anonymous?: boolean | null }): string {
  return u.display_name || u.email || (u.is_anonymous === false ? shortId(u.user_id) : `Guest · ${shortId(u.user_id)}`);
}

export const AUDIENCE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "investor", label: "Investors" },
  { value: "business", label: "Business owners" },
  { value: "unknown", label: "Unknown" },
];

/** Reads ?audience= and normalises it to '' | investor | business | unknown. */
export function parseAudience(sp: Record<string, string | string[] | undefined>): string {
  const v = typeof sp.audience === "string" ? sp.audience : "";
  return ["investor", "business", "unknown"].includes(v) ? v : "";
}

export function stageLabel(stage: string): string {
  return stage === "submitted" ? "Submitted" : stage === "completed" ? "Finished, no details" : stage === "started" ? "Started, not finished" : stage;
}

export function stageTone(stage: string): "amber" | "blue" | "green" | "neutral" {
  return stage === "submitted" ? "green" : stage === "completed" ? "blue" : stage === "started" ? "amber" : "neutral";
}
