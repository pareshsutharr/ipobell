// Finds the figures the health report needs inside a spreadsheet of financial statements. Pure logic: it is given
// the cells (see sheetRead.ts for reading the file) and returns what it found, with where it found it.
//
// It only takes a number when the row label is one it recognises and the column sits under a year heading.
// Anything else stays empty for the user to type; nothing is guessed. The user always reviews the figures
// before a report is shown.
import { emptyYear, FIGURE_KEYS, MAX_YEARS, type FigureKey, type YearFigures } from "@/features/business/health";

export type Cell = string | number | boolean | Date | null | undefined;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

export const UNIT_KEYS = ["rupees", "hundreds", "thousands", "lakhs", "millions", "crores"] as const;
export type UnitKey = (typeof UNIT_KEYS)[number];
/** label, and what one unit is in ₹ crore */
export const UNITS: Record<UnitKey, { label: string; crore: number }> = {
  rupees: { label: "Rupees", crore: 1e-7 },
  hundreds: { label: "₹ hundred", crore: 1e-5 },
  thousands: { label: "₹ thousand", crore: 1e-4 },
  lakhs: { label: "₹ lakh", crore: 1e-2 },
  millions: { label: "₹ million", crore: 1e-1 },
  crores: { label: "₹ crore", crore: 1 },
};

// ---------------------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------------------
const UNIT_CUE = /(₹|\brs\b|\binr\b|\bamounts?\b|\bfigures?\b|\brupees?\b|\bin\b)/i;
const UNIT_WORDS: [RegExp, UnitKey][] = [
  [/\bcrores?\b|\bcr\b/i, "crores"],
  [/\blakhs?\b|\blacs?\b/i, "lakhs"],
  [/\bmillions?\b|\bmn\b/i, "millions"],
  [/\bthousands?\b|(^|[^0-9])'?000s?\b/i, "thousands"],
  [/\bhundreds?\b/i, "hundreds"],
];

/** The unit named in a note such as "(₹ in Lakhs)" or "Amount in Rs. '000". null when the cell is not such a note. */
export function unitOfText(text: string): UnitKey | null {
  const t = text.trim();
  if (t.length < 2 || t.length > 70 || !UNIT_CUE.test(t)) return null;
  // a note about units has no amounts in it ("Rs. 10 lakh share capital" is a row label, not a unit note)
  if (/\d/.test(t.replace(/'?000s?/g, ""))) return null;
  for (const [re, unit] of UNIT_WORDS) if (re.test(t)) return unit;
  if (/\b(amounts?|figures?)\b.*(₹|\brs\b|\binr\b|\brupees?\b)/i.test(t) || /\bin\s+(₹|rs\.?|inr|rupees)\s*\)?$/i.test(t)) return "rupees";
  return null;
}

export function detectUnit(sheet: Sheet): UnitKey | null {
  for (const row of sheet.rows.slice(0, 40)) {
    for (const cell of row) {
      if (typeof cell !== "string") continue;
      const u = unitOfText(cell);
      if (u) return u;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Year headings
// ---------------------------------------------------------------------------------------------------------
const okYear = (y: number) => y >= 1995 && y <= 2100;

/** The financial year a heading refers to, as the year it ends in ("2024-25", "31 March 2025", "FY25" → 2025). */
export function yearOf(cell: Cell): number | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    const y = new Date(cell.getTime() + 12 * 3600 * 1000).getUTCFullYear(); // midday: safe against time-zone shifts
    return okYear(y) ? y : null;
  }
  if (typeof cell === "number") return Number.isInteger(cell) && okYear(cell) && cell >= 2000 ? cell : null;
  if (typeof cell !== "string") return null;
  const t = cell.trim();
  if (!t || t.length > 60) return null;

  // 31/03/2025, 31.03.2025, 31-03-2025 (the last date wins: "01-04-2024 to 31-03-2025")
  const dates = [...t.matchAll(/\b\d{1,2}[./-]\d{1,2}[./-](\d{4})\b/g)];
  if (dates.length) {
    const y = Number(dates[dates.length - 1][1]);
    return okYear(y) ? y : null;
  }
  // 2024-25, 2024-2025, 2024/25, FY 2024–25
  const range = t.match(/\b(20\d{2})\s*[-–/]\s*(\d{4}|\d{2})\b/);
  if (range) {
    const start = Number(range[1]);
    const end = range[2].length === 4 ? Number(range[2]) : Math.floor(start / 100) * 100 + Number(range[2]);
    return end === start + 1 && okYear(end) ? end : null;
  }
  // FY25, FY'25, F.Y. 25
  const fy = t.match(/\bf\.?\s?y\.?\s*'?(\d{2})\b/i);
  if (fy && !/\d{3}/.test(t)) return 2000 + Number(fy[1]);
  // "As at 31st March, 2025", "Year ended March 31, 2025", "FY 2025", "2025"
  const years = [...t.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length && new Set(years).size === 1) {
    if (/^\s*20\d{2}\s*$/.test(t) || /(as at|as on|ended|ending|march|\bmar\b|december|\bdec\b|\bfy\b|f\.y|year|31)/i.test(t)) return okYear(years[0]) ? years[0] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Numbers and labels
// ---------------------------------------------------------------------------------------------------------
/** "1,23,456.50" → 123456.5, "(1,200)" → -1200, "-" → 0. null when the cell is not an amount. */
export function amountOf(cell: Cell): number | null {
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  if (typeof cell !== "string") return null;
  let t = cell.trim();
  if (!t) return null;
  if (/^(-|–|—|nil)$/i.test(t)) return 0;
  const negative = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[₹,\s()]/g, "").replace(/^(rs\.?|inr)/i, "").replace(/(cr|dr)\.?$/i, "").replace(/^-/, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** "(b) Profit / (Loss) for the year" → "profit for the year" */
export function normaliseLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\((?:[^()]*)\)/g, " ") // (net), (loss), (a), (refer note 4)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[ivx]{1,4}|[a-z]|\d{1,2})\s+(?=[a-z])/, "") // "ii revenue…", "a share capital", "1 revenue…"
    .replace(/\b(?:or|and)? ?loss\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Line =
  | FigureKey
  | "pbt"
  | "depreciation"
  | "shareCapital"
  | "reserves"
  | "borrowingsPart"
  | "intangiblesPart";

interface Matcher {
  line: Line;
  /** lower = more exact; a better match on a later row replaces a looser one */
  rank: number;
  re: RegExp;
  /** rows are added together (long-term + short-term borrowings) instead of the first one winning */
  sum?: boolean;
}

const MATCHERS: Matcher[] = [
  { line: "revenue", rank: 1, re: /^(total )?revenue from operations$/ },
  { line: "revenue", rank: 2, re: /^((net|gross) )?(sales|turnover|revenue)$|^sales turnover$|^income from operations$/ },
  { line: "revenue", rank: 3, re: /^sale of (products|services|goods)$/ },
  { line: "revenue", rank: 4, re: /^total (income|revenue)$/ },

  { line: "ebitda", rank: 1, re: /^ebitda$|^operating profit( ebitda)?$|^earnings before interest tax depreciation and amorti[sz]ation$/ },

  { line: "pbt", rank: 1, re: /^(net )?profit before tax( expense)?$/ },
  { line: "pbt", rank: 2, re: /^(net )?profit before (exceptional|extraordinary)( and extraordinary)? items and tax$/ },

  { line: "pat", rank: 1, re: /^(net )?profit after tax( pat)?$|^pat$|^(net )?profit for the (year|period)( after tax)?$/ },
  { line: "pat", rank: 2, re: /^profit for the (year|period) from continuing operations$|^profit after tax for the (year|period)$/ },

  { line: "financeCost", rank: 1, re: /^finance costs?$|^financial (costs?|charges)$/ },
  { line: "financeCost", rank: 2, re: /^interest( and finance charges| expenses?| costs?)?$/ },

  { line: "depreciation", rank: 1, re: /^depreciation( and amorti[sz]ation)?( expenses?)?$/ },

  { line: "netWorth", rank: 1, re: /^net ?worth$|^total equity$|^(total )?share ?holders?( s)? funds?$/ },
  { line: "netWorth", rank: 2, re: /^equity attributable to (the )?owners/ },
  { line: "shareCapital", rank: 1, re: /^(equity )?share capital$|^paid up( equity)?( share)? capital$/ },
  { line: "reserves", rank: 1, re: /^reserves and surplus$|^other equity$/ },

  { line: "borrowings", rank: 1, re: /^total (borrowings|debt)$/ },
  { line: "borrowingsPart", rank: 1, sum: true, re: /^(long term|short term|non current|current)? ?borrowings$|^current maturities of long term (debt|borrowings)$/ },

  { line: "currentAssets", rank: 1, re: /^total current assets$/ },
  { line: "currentLiabilities", rank: 1, re: /^total current liabilities$/ },

  { line: "intangibles", rank: 1, re: /^total intangible assets$/ },
  { line: "intangiblesPart", rank: 1, sum: true, re: /^(other )?intangible assets$|^goodwill$|^intangible assets under development$/ },
];

export function matchLabel(text: string): Matcher | null {
  const label = normaliseLabel(text);
  if (!label || label.length > 80) return null;
  return MATCHERS.find((m) => m.re.test(label)) ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// Reading sheets
// ---------------------------------------------------------------------------------------------------------
interface Found {
  value: number;
  rank: number;
  label: string;
}
type YearLines = Partial<Record<Line, Found>>;

/** Year headings in a row: column → year. Empty unless the row is a heading (years to the right of column A, no amounts). */
function headingOf(row: Cell[]): Map<number, number> {
  const cols = new Map<number, number>();
  for (let c = 1; c < row.length; c++) {
    const cell = row[c];
    if (cell === null || cell === undefined || cell === "") continue;
    const y = yearOf(cell);
    if (y !== null) cols.set(c, y);
    else if (typeof cell === "number") return new Map(); // a row with other numbers is data, not a heading
  }
  // the same year twice means these are not year columns (for example "Note 2025" twice)
  return new Set(cols.values()).size === cols.size ? cols : new Map();
}

function readSheet(sheet: Sheet): Map<number, YearLines> {
  const byYear = new Map<number, YearLines>();
  let cols = new Map<number, number>();
  for (const row of sheet.rows.slice(0, 3000)) {
    if (!Array.isArray(row)) continue;
    const heading = headingOf(row);
    if (heading.size) {
      cols = heading;
      continue;
    }
    if (!cols.size) continue;
    const labelCell = row.find((cell) => typeof cell === "string" && /[a-z]/i.test(cell)) as string | undefined;
    if (!labelCell) continue;
    const m = matchLabel(labelCell);
    if (!m) continue;
    for (const [c, year] of cols) {
      const value = amountOf(row[c]);
      if (value === null) continue;
      const lines = byYear.get(year) ?? {};
      const have = lines[m.line];
      if (m.sum) lines[m.line] = { value: (have?.value ?? 0) + value, rank: m.rank, label: have ? `${have.label} + ${labelCell.trim()}` : labelCell.trim() };
      else if (!have || m.rank < have.rank) lines[m.line] = { value, rank: m.rank, label: labelCell.trim() };
      byYear.set(year, lines);
    }
  }
  return byYear;
}

export interface FigureSource {
  sheet: string;
  /** The row label(s) the number came from. */
  label: string;
  /** Set when the number was worked out from other rows, for example "Share capital + reserves". */
  derived?: string;
}

export interface ParsedStatements {
  /** Newest year first, at most three. Values are in `unit` (not yet in crore) when `unit` is known. */
  years: YearFigures[];
  /** Where each figure of the newest year came from. */
  sources: Partial<Record<FigureKey, FigureSource>>;
  /** The unit named in the file. null = the file does not say, and the user must choose. */
  unit: UnitKey | null;
  /** How many figures were found in all. */
  found: number;
  /** Figures of the newest year that were not found. */
  missing: FigureKey[];
}

interface Picked {
  value: number;
  source: FigureSource;
}

function directOrDerived(lines: YearLines, sheet: string): { direct: Partial<Record<FigureKey, Picked>>; derived: Partial<Record<FigureKey, Picked>> } {
  const direct: Partial<Record<FigureKey, Picked>> = {};
  const derived: Partial<Record<FigureKey, Picked>> = {};
  for (const k of FIGURE_KEYS) {
    const f = lines[k];
    if (f) direct[k] = { value: f.value, source: { sheet, label: f.label } };
  }
  if (lines.shareCapital && lines.reserves) {
    derived.netWorth = { value: lines.shareCapital.value + lines.reserves.value, source: { sheet, label: `${lines.shareCapital.label} + ${lines.reserves.label}`, derived: "Share capital plus reserves" } };
  }
  if (lines.borrowingsPart) derived.borrowings = { value: lines.borrowingsPart.value, source: { sheet, label: lines.borrowingsPart.label, derived: "Borrowing rows added together" } };
  if (lines.intangiblesPart) derived.intangibles = { value: lines.intangiblesPart.value, source: { sheet, label: lines.intangiblesPart.label, derived: "Intangible asset rows added together" } };
  if (lines.pbt && lines.financeCost && lines.depreciation) {
    derived.ebitda = {
      value: lines.pbt.value + lines.financeCost.value + lines.depreciation.value,
      source: { sheet, label: `${lines.pbt.label} + ${lines.financeCost.label} + ${lines.depreciation.label}`, derived: "Profit before tax plus finance cost plus depreciation" },
    };
  }
  return { direct, derived };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function fyLabel(endYear: number): string {
  return `FY ${endYear - 1}-${String(endYear).slice(2)}`;
}

/** Read every sheet and put together the newest three years. The first sheet that has a figure wins. */
export function parseStatements(sheets: Sheet[]): ParsedStatements {
  const units = sheets.map(detectUnit);
  const unit = units.find((u): u is UnitKey => u !== null) ?? null;

  const picked = new Map<number, Partial<Record<FigureKey, Picked>>>();
  const later = new Map<number, Partial<Record<FigureKey, Picked>>>();

  sheets.slice(0, 30).forEach((sheet, i) => {
    // a sheet in another unit than the rest of the file is brought to the file's unit
    const factor = unit && units[i] && units[i] !== unit ? UNITS[units[i] as UnitKey].crore / UNITS[unit].crore : 1;
    for (const [year, lines] of readSheet(sheet)) {
      const { direct, derived } = directOrDerived(lines, sheet.name);
      for (const [target, src] of [[picked, direct], [later, derived]] as const) {
        const y = target.get(year) ?? {};
        for (const k of FIGURE_KEYS) {
          const p = src[k];
          if (p && !y[k]) y[k] = { value: p.value * factor, source: p.source };
        }
        target.set(year, y);
      }
    }
  });

  // a number read straight from a row beats one worked out from other rows
  for (const [year, derived] of later) {
    const y = picked.get(year) ?? {};
    for (const k of FIGURE_KEYS) if (!y[k] && derived[k]) y[k] = derived[k];
    picked.set(year, y);
  }

  const yearsDesc = [...picked.entries()].filter(([, v]) => Object.keys(v).length > 0).sort((x, y) => y[0] - x[0]).slice(0, MAX_YEARS);
  const years: YearFigures[] = yearsDesc.map(([year, vals]) => {
    const y = emptyYear(fyLabel(year));
    for (const k of FIGURE_KEYS) y[k] = vals[k] ? round(vals[k]!.value) : null;
    return y;
  });

  const sources: Partial<Record<FigureKey, FigureSource>> = {};
  const newest = yearsDesc[0]?.[1] ?? {};
  for (const k of FIGURE_KEYS) if (newest[k]) sources[k] = newest[k]!.source;

  return {
    years,
    sources,
    unit,
    found: years.reduce((n, y) => n + FIGURE_KEYS.filter((k) => y[k] !== null).length, 0),
    missing: years.length ? FIGURE_KEYS.filter((k) => years[0][k] === null) : [...FIGURE_KEYS],
  };
}

/** Figures in the file's unit → ₹ crore. */
export function toCrore(years: YearFigures[], unit: UnitKey): YearFigures[] {
  const f = UNITS[unit].crore;
  return years.map((y) => {
    const out = emptyYear(y.label);
    for (const k of FIGURE_KEYS) out[k] = y[k] === null ? null : Math.round((y[k] as number) * f * 1000) / 1000;
    return out;
  });
}
