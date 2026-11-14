// Staff-entered facts per IPO (public.ipo_admin_data): the fixed lists the form offers, completeness, and the
// CSV import/export logic. Pure functions only (no React, no Supabase), so they are unit-tested with node --test.
//
// INDIAN_STATES must match the CHECK constraint in supabase/migrations/20261114000600_ipo_admin_data.sql
// (tests/ipo-admin-data.test.ts compares the two).

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry",
] as const;
export type IndianState = (typeof INDIAN_STATES)[number];

/** Same names as the app's issue-size calculator (SECTOR_PE), so an IPO's sector can be matched to a P/E later. */
export const SECTORS = [
  "IT / Software Services", "FMCG / Consumer Goods", "Pharma / Healthcare", "Manufacturing / Engineering", "Infrastructure / EPC",
  "Textile / Apparel", "Financial Services / NBFC", "Retail / E-commerce", "Agro / Food Processing", "Renewable Energy",
  "Chemicals / Specialty", "Other",
] as const;

export const LISTING_PLATFORMS = [
  { value: "nse_emerge", label: "NSE Emerge" },
  { value: "bse_sme", label: "BSE SME" },
  { value: "mainboard", label: "Mainboard" },
] as const;
export type ListingPlatform = (typeof LISTING_PLATFORMS)[number]["value"];

export interface IpoAdminData {
  ipo_id: string;
  state: string | null;
  sector: string | null;
  industry: string | null;
  listing_platform: ListingPlatform | null;
}

export const ADMIN_DATA_COLUMNS = "ipo_id, state, sector, industry, listing_platform";

export function platformLabel(v: string | null | undefined): string {
  return LISTING_PLATFORMS.find((p) => p.value === v)?.label ?? "Not specified";
}

/** What the feed implies about the platform. A suggestion for the form only; staff confirm it. */
export function suggestPlatform(board: string | null | undefined, subType: string | null | undefined): ListingPlatform | null {
  if (board === "mainboard") return "mainboard";
  if (board === "sme") {
    if (/nse/i.test(subType ?? "")) return "nse_emerge";
    if (/bse/i.test(subType ?? "")) return "bse_sme";
  }
  return null;
}

/** Fields the app's filters need. Industry is optional detail and does not count. */
export function missingFields(row: Pick<IpoAdminData, "state" | "sector" | "listing_platform"> | null | undefined): ("state" | "sector" | "listing platform")[] {
  const out: ("state" | "sector" | "listing platform")[] = [];
  if (!row?.state) out.push("state");
  if (!row?.sector) out.push("sector");
  if (!row?.listing_platform) out.push("listing platform");
  return out;
}

export function isComplete(row: Pick<IpoAdminData, "state" | "sector" | "listing_platform"> | null | undefined): boolean {
  return missingFields(row).length === 0;
}

// ---------------------------------------------------------------------------------------------------------
// Normalising what a person types into a spreadsheet
// ---------------------------------------------------------------------------------------------------------
const key = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const STATE_ALIASES: Record<string, IndianState> = {
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
  "new delhi": "Delhi",
  "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  "j and k": "Jammu and Kashmir",
  jk: "Jammu and Kashmir",
  "andaman and nicobar": "Andaman and Nicobar Islands",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  up: "Uttar Pradesh",
  mp: "Madhya Pradesh",
  ap: "Andhra Pradesh",
  hp: "Himachal Pradesh",
  tn: "Tamil Nadu",
  wb: "West Bengal",
};
const STATE_BY_KEY = new Map<string, IndianState>(INDIAN_STATES.map((s) => [key(s), s]));

export function normalizeState(input: string): IndianState | null {
  const k = key(input);
  return STATE_BY_KEY.get(k) ?? STATE_ALIASES[k] ?? null;
}

const SECTOR_BY_KEY = new Map<string, string>(SECTORS.map((s) => [key(s), s]));
export function normalizeSector(input: string): string | null {
  return SECTOR_BY_KEY.get(key(input)) ?? null;
}

const PLATFORM_ALIASES: Record<string, ListingPlatform> = {
  "nse emerge": "nse_emerge",
  "nse sme": "nse_emerge",
  nse: "nse_emerge",
  emerge: "nse_emerge",
  "bse sme": "bse_sme",
  bse: "bse_sme",
  mainboard: "mainboard",
  "main board": "mainboard",
  main: "mainboard",
};
export function normalizePlatform(input: string): ListingPlatform | null {
  return PLATFORM_ALIASES[key(input)] ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------------------
/** RFC 4180 parser: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Quote a value for CSV, and neutralise spreadsheet formulas (a cell starting with = + - @ runs as a formula in Excel). */
export function csvCell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface IpoRef {
  id: string;
  slug: string;
  name: string;
  display_name?: string | null;
}

export const CSV_HEADERS = ["slug", "name", "state", "sector", "industry", "listing_platform"] as const;

/** A sheet of every IPO with what is already entered: fill the blanks in Excel and import it back. */
export function exportCsv(ipos: IpoRef[], existing: IpoAdminData[]): string {
  const by = new Map(existing.map((e) => [e.ipo_id, e]));
  const lines = [CSV_HEADERS.join(",")];
  for (const ipo of ipos) {
    const e = by.get(ipo.id);
    lines.push([ipo.slug, ipo.display_name ?? ipo.name, e?.state ?? "", e?.sector ?? "", e?.industry ?? "", e?.listing_platform ? platformLabel(e.listing_platform) : ""].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export interface ImportIssue {
  line: number; // 1-based line in the file, header = 1
  message: string;
}

export interface ImportPlan {
  /** Full rows to upsert (existing values kept where the sheet was blank). */
  rows: IpoAdminData[];
  /** Lines that matched an IPO but changed nothing. */
  unchanged: number;
  issues: ImportIssue[];
  /** Data lines read (excluding the header). */
  total: number;
}

/**
 * Turn an uploaded sheet into rows to save. Rules:
 *  - the IPO is found by `slug`; if there is no slug, by exact company name (case-insensitive);
 *  - a blank cell means "leave as it is", never "clear";
 *  - a line with any invalid value is rejected whole and reported, the rest of the file still imports;
 *  - nothing is guessed: an unknown state, sector or platform is an error, not a best match.
 */
export function planImport(text: string, ipos: IpoRef[], existing: IpoAdminData[]): ImportPlan {
  const table = parseCsv(text);
  const issues: ImportIssue[] = [];
  if (!table.length) return { rows: [], unchanged: 0, issues: [{ line: 1, message: "The file is empty." }], total: 0 };

  const header = table[0].map((h) => key(h).replace(/ /g, "_"));
  const col = (name: string) => header.indexOf(name);
  const iSlug = col("slug");
  const iName = col("name");
  if (iSlug < 0 && iName < 0) return { rows: [], unchanged: 0, issues: [{ line: 1, message: 'The first line must name the columns and include "slug" or "name".' }], total: table.length - 1 };
  const iState = col("state");
  const iSector = col("sector");
  const iIndustry = col("industry");
  const iPlatform = Math.max(col("listing_platform"), col("platform"));
  if (iState < 0 && iSector < 0 && iIndustry < 0 && iPlatform < 0) {
    return { rows: [], unchanged: 0, issues: [{ line: 1, message: "No data columns found. Expected any of: state, sector, industry, listing_platform." }], total: table.length - 1 };
  }

  const bySlug = new Map(ipos.map((i) => [i.slug.toLowerCase(), i]));
  const byName = new Map<string, IpoRef[]>();
  for (const i of ipos) {
    for (const n of new Set([i.name, i.display_name ?? i.name])) {
      const k = key(n);
      byName.set(k, [...(byName.get(k) ?? []), i]);
    }
  }
  const current = new Map(existing.map((e) => [e.ipo_id, e]));
  const out = new Map<string, IpoAdminData>();
  let unchanged = 0;

  for (let r = 1; r < table.length; r++) {
    const line = r + 1;
    const cells = table[r];
    const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim().replace(/^'(?=[=+\-@])/, "") : "");
    const slug = get(iSlug);
    const name = get(iName);

    let ipo: IpoRef | undefined;
    if (slug) {
      ipo = bySlug.get(slug.toLowerCase());
      if (!ipo) {
        issues.push({ line, message: `No IPO has the slug "${slug}".` });
        continue;
      }
    } else if (name) {
      const matches = byName.get(key(name)) ?? [];
      const distinct = [...new Map(matches.map((m) => [m.id, m])).values()];
      if (distinct.length === 0) {
        issues.push({ line, message: `No IPO is named "${name}". Use the slug column from the downloaded sheet.` });
        continue;
      }
      if (distinct.length > 1) {
        issues.push({ line, message: `${distinct.length} IPOs are named "${name}". Use the slug column to say which one.` });
        continue;
      }
      ipo = distinct[0];
    } else {
      issues.push({ line, message: "This line has no slug and no name." });
      continue;
    }

    const problems: string[] = [];
    const base: IpoAdminData = out.get(ipo.id) ?? current.get(ipo.id) ?? { ipo_id: ipo.id, state: null, sector: null, industry: null, listing_platform: null };
    const next: IpoAdminData = { ...base };

    const state = get(iState);
    if (state) {
      const s = normalizeState(state);
      if (s) next.state = s;
      else problems.push(`unknown state "${state}"`);
    }
    const sector = get(iSector);
    if (sector) {
      const s = normalizeSector(sector);
      if (s) next.sector = s;
      else problems.push(`unknown sector "${sector}" (use one from the sector list)`);
    }
    const industry = get(iIndustry);
    if (industry) {
      if (industry.length < 2 || industry.length > 120) problems.push("industry must be 2 to 120 characters");
      else next.industry = industry;
    }
    const platform = get(iPlatform);
    if (platform) {
      const p = normalizePlatform(platform);
      if (p) next.listing_platform = p;
      else problems.push(`unknown listing platform "${platform}" (NSE Emerge, BSE SME or Mainboard)`);
    }

    if (problems.length) {
      issues.push({ line, message: `${ipo.display_name ?? ipo.name}: ${problems.join("; ")}.` });
      continue;
    }
    if (out.has(ipo.id)) issues.push({ line, message: `${ipo.display_name ?? ipo.name} appears more than once; the later line wins.` });
    const before = current.get(ipo.id);
    const same = (before?.state ?? null) === next.state && (before?.sector ?? null) === next.sector && (before?.industry ?? null) === next.industry && (before?.listing_platform ?? null) === next.listing_platform;
    if (same) {
      out.delete(ipo.id);
      unchanged++;
      continue;
    }
    out.set(ipo.id, next);
  }

  return { rows: [...out.values()], unchanged, issues, total: table.length - 1 };
}
