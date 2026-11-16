// Balance sheet reports saved from the app (public.balance_sheet_reports). Pure helpers for the admin page.

export const BALANCE_SHEET_BUCKET = "balance-sheets";

export const FIGURE_COLUMNS: [string, string][] = [
  ["revenue", "Revenue"],
  ["ebitda", "EBITDA"],
  ["pat", "PAT"],
  ["netWorth", "Net worth"],
  ["borrowings", "Borrowings"],
  ["currentAssets", "Current assets"],
  ["currentLiabilities", "Current liabilities"],
  ["intangibles", "Intangibles"],
  ["financeCost", "Finance cost"],
];

export interface FigureYear {
  label: string;
  values: Record<string, number | null>;
}

/** The figures as stored by the app: at most three years, only finite numbers, anything else shown as missing. */
export function readFigures(raw: unknown): FigureYear[] {
  if (!Array.isArray(raw)) return [];
  const out: FigureYear[] = [];
  for (const item of raw) {
    if (out.length >= 3) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const values: Record<string, number | null> = {};
    for (const [key] of FIGURE_COLUMNS) values[key] = typeof r[key] === "number" && Number.isFinite(r[key] as number) ? (r[key] as number) : null;
    out.push({ label: typeof r.label === "string" && r.label.trim() ? r.label.trim().slice(0, 20) : `Year ${out.length + 1}`, values });
  }
  return out;
}

export function croreText(v: number | null): string {
  return v === null ? "Not specified" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 3 })} Cr`;
}

export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  const ms = Date.parse(expiresAt) - now.getTime();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / 86_400_000));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A file name that is safe in a Content-Disposition header. */
export function safeDownloadName(name: string, fallback = "balance-sheet"): string {
  const cleaned = name.replace(/[^\w .()-]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned && /[a-z0-9]/i.test(cleaned) ? cleaned : fallback;
}
