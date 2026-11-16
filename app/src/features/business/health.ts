// Balance sheet health report: ratios and SME rule checks from a company's own figures. Pure logic, no network.
//
// Figures are in ₹ crore, newest year first, for up to three years. A figure that was not given stays null and
// every ratio or check that needs it says "Not specified"; nothing is estimated. The report states numbers and
// whether a published limit is met. It does not say whether a company should list, and it is not a grade.
import { DEFAULT_ELIGIBILITY_LIMITS, type Check, type EligibilityLimits } from "@/features/business/tools";

export const FIGURE_KEYS = ["revenue", "ebitda", "pat", "netWorth", "borrowings", "currentAssets", "currentLiabilities", "intangibles", "financeCost"] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];

export const FIGURE_LABELS: Record<FigureKey, { label: string; hint: string; from: "pl" | "bs" }> = {
  revenue: { label: "Revenue from operations", hint: "Sales for the year, without other income.", from: "pl" },
  ebitda: { label: "Operating profit (EBITDA)", hint: "Profit before interest, tax, depreciation and amortisation.", from: "pl" },
  pat: { label: "Profit after tax", hint: "Net profit for the year. Use a minus sign for a loss.", from: "pl" },
  financeCost: { label: "Finance cost", hint: "Interest and other borrowing costs for the year.", from: "pl" },
  netWorth: { label: "Net worth", hint: "Share capital plus reserves and surplus.", from: "bs" },
  borrowings: { label: "Total borrowings", hint: "Long-term plus short-term borrowings.", from: "bs" },
  currentAssets: { label: "Current assets", hint: "Total current assets.", from: "bs" },
  currentLiabilities: { label: "Current liabilities", hint: "Total current liabilities.", from: "bs" },
  intangibles: { label: "Intangible assets", hint: "Goodwill, software, brands. Enter 0 if there are none.", from: "bs" },
};

export const MAX_YEARS = 3;

export type YearFigures = { label: string } & Record<FigureKey, number | null>;

export function emptyYear(label = ""): YearFigures {
  return { label, revenue: null, ebitda: null, pat: null, netWorth: null, borrowings: null, currentAssets: null, currentLiabilities: null, intangibles: null, financeCost: null };
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Accepts stored or typed figures and returns a clean copy: at most three years, only finite numbers. */
export function sanitizeFigures(input: unknown): YearFigures[] {
  if (!Array.isArray(input)) return [];
  const out: YearFigures[] = [];
  for (const raw of input) {
    if (out.length >= MAX_YEARS) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const y = emptyYear(typeof r.label === "string" ? r.label.slice(0, 20) : "");
    for (const k of FIGURE_KEYS) y[k] = fin(r[k]) && Math.abs(r[k] as number) < 1e7 ? (r[k] as number) : null;
    out.push(y);
  }
  return out;
}

export function countFigures(years: YearFigures[]): number {
  return years.reduce((n, y) => n + FIGURE_KEYS.filter((k) => y[k] !== null).length, 0);
}

export type RatioKey = "revenueGrowth" | "revenueCagr" | "ebitdaMargin" | "patMargin" | "returnOnNetWorth" | "debtToEquity" | "currentRatio" | "interestCover";

export interface Ratio {
  key: RatioKey;
  label: string;
  /** null = a figure it needs was not given, or it cannot be calculated (for example net worth is not positive). */
  value: number | null;
  unit: "%" | "x";
  /** How it was worked out, in words. */
  basis: string;
  /** Why there is no value, when there is none. */
  missing?: string;
}

export interface HealthReport {
  /** Label of the newest year the report is based on. */
  year: string;
  years: number;
  ratios: Ratio[];
  checks: Check[];
  /** Things that look like a typing or unit mistake. Shown above the report so the user can fix the figures. */
  warnings: string[];
  met: number;
  notMet: number;
  unknown: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function pct(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || !(whole > 0)) return null;
  return r1((part / whole) * 100);
}

function need(names: [string, number | null][]): string | undefined {
  const miss = names.filter(([, v]) => v === null).map(([n]) => n);
  return miss.length ? `Not specified: ${miss.join(", ")}` : undefined;
}

/** Net worth less intangible assets: the usual working approximation of net tangible assets. */
export function netTangibleAssets(y: YearFigures | undefined): number | null {
  if (!y || y.netWorth === null || y.intangibles === null) return null;
  return r2(y.netWorth - y.intangibles);
}

export function buildHealthReport(input: YearFigures[], L: EligibilityLimits = DEFAULT_ELIGIBILITY_LIMITS): HealthReport {
  const years = sanitizeFigures(input);
  const a = years[0] ?? emptyYear();
  const b = years[1];
  const c = years[2];

  const ratios: Ratio[] = [];
  const add = (key: RatioKey, label: string, unit: "%" | "x", basis: string, value: number | null, missing?: string) =>
    ratios.push({ key, label, unit, basis, value, ...(value === null ? { missing: missing ?? "Cannot be calculated from these figures" } : {}) });

  // Growth
  const growth = b && a.revenue !== null && b.revenue !== null && b.revenue > 0 ? r1((a.revenue / b.revenue - 1) * 100) : null;
  add("revenueGrowth", "Revenue growth over the previous year", "%", "Latest revenue ÷ previous year's revenue − 1", growth, b ? need([["latest revenue", a.revenue], ["previous year's revenue", b.revenue]]) : "Needs two years of revenue");
  const cagr = c && a.revenue !== null && c.revenue !== null && c.revenue > 0 && a.revenue > 0 ? r1((Math.sqrt(a.revenue / c.revenue) - 1) * 100) : null;
  add("revenueCagr", "Revenue growth per year over two years (CAGR)", "%", "Compound yearly growth from the oldest to the latest year", cagr, c ? need([["latest revenue", a.revenue], ["revenue two years ago", c.revenue]]) : "Needs three years of revenue");

  // Margins
  add("ebitdaMargin", "Operating margin (EBITDA ÷ revenue)", "%", "Operating profit as a share of revenue", pct(a.ebitda, a.revenue), need([["operating profit", a.ebitda], ["revenue", a.revenue]]));
  add("patMargin", "Net margin (PAT ÷ revenue)", "%", "Profit after tax as a share of revenue", pct(a.pat, a.revenue), need([["profit after tax", a.pat], ["revenue", a.revenue]]));
  add("returnOnNetWorth", "Return on net worth (PAT ÷ net worth)", "%", "Profit after tax as a share of net worth", pct(a.pat, a.netWorth), need([["profit after tax", a.pat], ["net worth", a.netWorth]]) ?? "Net worth is not positive");

  // Debt and liquidity
  const de = a.borrowings !== null && a.netWorth !== null && a.netWorth > 0 ? r2(a.borrowings / a.netWorth) : null;
  add("debtToEquity", "Debt to equity (borrowings ÷ net worth)", "x", "Total borrowings divided by net worth", de, need([["total borrowings", a.borrowings], ["net worth", a.netWorth]]) ?? "Net worth is not positive");
  const cr = a.currentAssets !== null && a.currentLiabilities !== null && a.currentLiabilities > 0 ? r2(a.currentAssets / a.currentLiabilities) : null;
  add("currentRatio", "Current ratio (current assets ÷ current liabilities)", "x", "Current assets divided by current liabilities", cr, need([["current assets", a.currentAssets], ["current liabilities", a.currentLiabilities]]));
  const cover = a.ebitda !== null && a.financeCost !== null && a.financeCost > 0 ? r1(a.ebitda / a.financeCost) : null;
  add("interestCover", "Interest cover (EBITDA ÷ finance cost)", "x", "Operating profit divided by finance cost", cover, need([["operating profit", a.ebitda], ["finance cost", a.financeCost]]) ?? "No finance cost in the latest year");

  // SME rule checks. The limits are the same ones the eligibility check uses (editable in the admin panel).
  const checks: Check[] = [];

  checks.push({
    label: `Net worth of at least ₹${L.netWorthMinCr} Cr in each of the last 2 years`,
    ok: a.netWorth === null ? null : a.netWorth < L.netWorthMinCr ? false : !b || b.netWorth === null ? null : b.netWorth >= L.netWorthMinCr,
    detail: a.netWorth === null ? "Not specified: net worth" : !b || b.netWorth === null ? (a.netWorth < L.netWorthMinCr ? `Latest: ₹${a.netWorth} Cr` : `Latest: ₹${a.netWorth} Cr. Previous year not specified`) : `Latest: ₹${a.netWorth} Cr, previous: ₹${b.netWorth} Cr`,
    severity: "gap",
  });

  const nta = netTangibleAssets(a);
  checks.push({
    label: `Net tangible assets of at least ₹${L.ntaMinCr} Cr (latest year)`,
    ok: nta === null ? null : nta >= L.ntaMinCr,
    detail: nta === null ? need([["net worth", a.netWorth], ["intangible assets", a.intangibles]]) : `Net worth less intangible assets: ₹${nta} Cr`,
    severity: "gap",
  });

  // Operating profit in N of the last 3 years: "met" as soon as enough known years pass, "not met" only when
  // the years not given could no longer make up the difference.
  const ebitdas = [a, b, c].map((y) => (y ? y.ebitda : null));
  const known = ebitdas.filter((v): v is number => v !== null);
  const passing = known.filter((v) => v >= L.opProfitMinCr).length;
  const unknownYears = 3 - known.length;
  checks.push({
    label: `Operating profit (EBITDA) of at least ₹${L.opProfitMinCr} Cr in ${L.opProfitMinYears} of the last 3 years`,
    ok: known.length === 0 ? null : passing >= L.opProfitMinYears ? true : passing + unknownYears < L.opProfitMinYears ? false : null,
    detail: known.length === 0 ? "Not specified: operating profit" : `${passing} of ${known.length} year${known.length === 1 ? "" : "s"} given ${known.length === 1 ? "is" : "are"} at or above the limit${unknownYears ? `. ${unknownYears} year${unknownYears === 1 ? "" : "s"} not specified` : ""}`,
    severity: "gap",
  });

  checks.push({
    label: "Operating profit in the latest year",
    ok: a.ebitda === null ? null : a.ebitda > 0,
    detail: a.ebitda === null ? "Not specified: operating profit" : `Latest: ₹${a.ebitda} Cr`,
    severity: "gap",
  });

  checks.push({
    label: `Debt to equity of ${L.leverageMax}:1 or lower`,
    ok: a.borrowings === null || a.netWorth === null ? null : a.netWorth > 0 ? a.borrowings / a.netWorth <= L.leverageMax + 1e-9 : a.borrowings <= 0,
    detail: de !== null ? `Latest: ${de}:1` : need([["total borrowings", a.borrowings], ["net worth", a.netWorth]]) ?? "Net worth is not positive",
    severity: "gap",
  });

  // Likely typing or unit mistakes.
  const warnings: string[] = [];
  for (const y of years) {
    const name = y.label || "one year";
    if (y.revenue !== null && y.revenue < 0) warnings.push(`Revenue for ${name} is negative. Please check it.`);
    if (y.revenue !== null && y.pat !== null && y.revenue > 0 && y.pat > y.revenue) warnings.push(`Profit after tax for ${name} is larger than revenue. Please check both figures.`);
    if (y.revenue !== null && y.ebitda !== null && y.revenue > 0 && y.ebitda > y.revenue) warnings.push(`Operating profit for ${name} is larger than revenue. Please check both figures.`);
    if (y.ebitda !== null && y.pat !== null && y.pat > y.ebitda && y.ebitda > 0) warnings.push(`Profit after tax for ${name} is larger than operating profit. This is unusual; please check.`);
    if (y.intangibles !== null && y.intangibles < 0) warnings.push(`Intangible assets for ${name} are negative. Please check.`);
    if (y.revenue !== null && y.revenue >= 50_000) warnings.push(`Revenue for ${name} is ₹${y.revenue} Cr. If your file is in lakh or rupees, change the unit.`);
  }

  return {
    year: a.label,
    years: years.length,
    ratios,
    checks,
    warnings: [...new Set(warnings)],
    met: checks.filter((x) => x.ok === true).length,
    notMet: checks.filter((x) => x.ok === false).length,
    unknown: checks.filter((x) => x.ok === null).length,
  };
}

export function formatRatio(r: Ratio): string {
  if (r.value === null) return "Not specified";
  return r.unit === "%" ? `${r.value}%` : `${r.value}×`;
}

/** Human-readable figures and results for the lead sent to the team. */
export function healthPayload(input: YearFigures[], report: HealthReport, source: "file" | "typed"): Record<string, string> {
  const years = sanitizeFigures(input);
  const out: Record<string, string> = { "Figures from": source === "file" ? "Uploaded file (checked by the user)" : "Typed by the user" };
  for (const k of FIGURE_KEYS) {
    const vals = years.map((y) => `${y.label || "year"}: ${y[k] === null ? "not specified" : `₹${y[k]} Cr`}`);
    if (years.some((y) => y[k] !== null)) out[FIGURE_LABELS[k].label] = vals.join(" · ");
  }
  for (const r of report.ratios) if (r.value !== null) out[r.label] = formatRatio(r);
  for (const c of report.checks) out[c.label] = c.ok === null ? "Not specified" : c.ok ? "Met" : "Not met";
  return out;
}

export function healthMessage(report: HealthReport): string {
  return `Balance sheet check${report.year ? ` (${report.year})` : ""}: ${report.met} of ${report.checks.length} SME rule checks met, ${report.notMet} not met, ${report.unknown} not specified.`;
}
