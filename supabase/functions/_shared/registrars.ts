// Registrar allotment-status drivers. Each driver queries the registrar's public status service
// for one PAN and returns a normalised result. Unknown / protected registrars return `manual`.
//
// Supported automatically: MUFG Intime (ex Link Intime), Bigshare.
// Manual (CAPTCHA / WAF / undocumented): KFintech, Maashitla, Skyline, Cameo, Purva.

export type AllotmentStatus = "allotted" | "not_allotted" | "not_found" | "manual" | "error";

export interface AllotmentResult {
  status: AllotmentStatus;
  sharesAllotted: number | null;
  sharesApplied: number | null;
  amountRefunded: number | null;
  category: string | null;
  applicationNo: string | null;
  message: string;
  manualUrl?: string | null;
  raw?: unknown;
}

export interface RegistrarInfo {
  name?: string | null;
  driver?: string | null;
  status_page?: string | null;
  website?: string | null;
}

const UA = "BeIPOReady/1.0 (+https://beipoready.com; allotment status check on behalf of the applicant)";
const TIMEOUT_MS = 20_000;

export const AUTO_DRIVERS = new Set(["mufg", "linkintime", "bigshare"]);

export function manualUrlFor(reg: RegistrarInfo | null | undefined): string | null {
  return reg?.status_page || reg?.website || null;
}

// ---------------------------------------------------------------------------
// Company-name matching (registrar lists use their own spelling)
// ---------------------------------------------------------------------------
const STOP = new Set(["limited", "ltd", "ltd.", "private", "pvt", "pvt.", "ipo", "sme", "india", "the", "and", "&", "of", "-", "–"]);

export function normalizeName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

export function nameScore(a: string, b: string): number {
  const ta = normalizeName(a);
  const tb = new Set(normalizeName(b));
  if (!ta.length || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  const prefix = ta.slice(0, 2).every((t) => tb.has(t)) ? 0.15 : 0;
  return hit / Math.max(ta.length, tb.size) + prefix;
}

export function bestMatch<T extends { name: string }>(target: string, candidates: T[], minScore = 0.6): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = nameScore(target, c.name);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore >= minScore ? best : null;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, headers: { "User-Agent": UA, ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// MUFG Intime (formerly Link Intime)
// ---------------------------------------------------------------------------
const MUFG_BASE = "https://in.mpms.mufg.com/Initial_Offer";

function xmlBlocks(xml: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const rec: Record<string, string> = {};
    const inner = m[1];
    const fre = /<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fre.exec(inner))) rec[f[1]] = f[2].trim();
    out.push(rec);
  }
  return out;
}

async function mufgJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithTimeout(`${MUFG_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MUFG ${path} HTTP ${res.status}`);
  const j = (await res.json()) as { d: T };
  return j.d;
}

export async function mufgCompanies(): Promise<{ id: string; name: string }[]> {
  const xml = await mufgJson<string>("IPO.aspx/GetDetails", {});
  return xmlBlocks(xml, "Table").map((r) => ({ id: r.company_id, name: r.companyname?.replace(/ /g, " ") ?? "" })).filter((c) => c.id && c.name);
}

export async function checkMufg(ipoName: string, pan: string, reg: RegistrarInfo | null): Promise<AllotmentResult> {
  const companies = await mufgCompanies();
  const company = bestMatch(ipoName, companies);
  if (!company) {
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: "IPO not listed on MUFG Intime yet", manualUrl: manualUrlFor(reg) };
  }
  const token = await mufgJson<string>("IPO.aspx/generateToken", {});
  const xml = await mufgJson<string>("IPO.aspx/SearchOnPan", { clientid: company.id, PAN: pan, IFSC: "", CHKVAL: "1", token });
  const rows = xmlBlocks(xml, "Table");
  if (!rows.length) {
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: "No application found for this PAN yet", manualUrl: manualUrlFor(reg), raw: xml.slice(0, 500) };
  }
  const allotted = rows.reduce((s, r) => s + (num(r.ALLOT) ?? 0), 0);
  const applied = rows.reduce((s, r) => s + (num(r.SHARES) ?? 0), 0);
  const refund = rows.reduce((s, r) => s + (num(r.RFNDAMT) ?? 0), 0);
  return {
    status: allotted > 0 ? "allotted" : "not_allotted",
    sharesAllotted: allotted,
    sharesApplied: applied || null,
    amountRefunded: refund || null,
    category: rows[0].PEMNDG ?? null,
    applicationNo: rows[0].RFNDNO ?? null,
    message: allotted > 0 ? `Allotted ${allotted} shares` : "Not allotted",
    raw: rows,
  };
}

// ---------------------------------------------------------------------------
// Bigshare
// ---------------------------------------------------------------------------
const BIGSHARE_BASE = "https://ipo.bigshareonline.com";

export async function bigshareCompanies(): Promise<{ id: string; name: string }[]> {
  const res = await fetchWithTimeout(`${BIGSHARE_BASE}/IPO_Status.html`);
  if (!res.ok) throw new Error(`Bigshare page HTTP ${res.status}`);
  const html = await res.text();
  const out: { id: string; name: string }[] = [];
  const re = /<option value="(\d+)">([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ id: m[1], name: m[2].trim() });
  return out;
}

export async function checkBigshare(ipoName: string, pan: string, reg: RegistrarInfo | null): Promise<AllotmentResult> {
  const companies = await bigshareCompanies();
  const company = bestMatch(ipoName, companies);
  if (!company) {
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: "IPO not listed on Bigshare yet", manualUrl: manualUrlFor(reg) };
  }
  const res = await fetchWithTimeout(`${BIGSHARE_BASE}/Data.aspx/FetchIpodetails`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
    body: JSON.stringify({ Applicationno: "", Company: company.id, SelectionType: "PN", PanNo: pan, txtcsdl: "", txtDPID: "", txtClId: "", ddlType: "0", lang: "en" }),
  });
  if (!res.ok) throw new Error(`Bigshare lookup HTTP ${res.status}`);
  const j = (await res.json()) as { d: Record<string, unknown> & { Records?: Record<string, unknown>[] } };
  const d = j.d ?? {};
  const status = String(d.Status ?? "").toUpperCase();
  if (status.includes("NOTFOUND") || status.includes("NOT FOUND")) {
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: "No application found for this PAN yet", manualUrl: manualUrlFor(reg), raw: d };
  }
  const records = Array.isArray(d.Records) && d.Records.length ? d.Records : [d];
  let allotted = 0;
  let applied = 0;
  let sawAllotField = false;
  for (const r of records) {
    const a = String(r.ALLOTED ?? r.H_ALLOTED ?? "");
    if (a) sawAllotField = true;
    if (!/NON/i.test(a)) allotted += num(a) ?? 0;
    applied += num(r.APPLIED ?? r.H_APPLIED) ?? 0;
  }
  if (!sawAllotField) {
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: String(d.Message ?? "No result yet"), manualUrl: manualUrlFor(reg), raw: d };
  }
  return {
    status: allotted > 0 ? "allotted" : "not_allotted",
    sharesAllotted: allotted,
    sharesApplied: applied || null,
    amountRefunded: null,
    category: null,
    applicationNo: String(records[0].APPLICATION_NO ?? records[0].H_APPLICATION_NO ?? "") || null,
    message: allotted > 0 ? `Allotted ${allotted} shares` : "Not allotted",
    raw: d,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------
export async function checkAllotment(driver: string | null | undefined, ipoName: string, pan: string, reg: RegistrarInfo | null): Promise<AllotmentResult> {
  const d = (driver ?? "").toLowerCase();
  try {
    if (d === "mufg" || d === "linkintime") return await checkMufg(ipoName, pan, reg);
    if (d === "bigshare") return await checkBigshare(ipoName, pan, reg);
  } catch (e) {
    return { status: "error", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: e instanceof Error ? e.message : String(e), manualUrl: manualUrlFor(reg) };
  }
  return {
    status: "manual",
    sharesAllotted: null,
    sharesApplied: null,
    amountRefunded: null,
    category: null,
    applicationNo: null,
    message: `${reg?.name ?? "This registrar"} requires a manual check (CAPTCHA-protected)`,
    manualUrl: manualUrlFor(reg),
  };
}
