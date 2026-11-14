// Business rules edited here and read by the app (public.business_rules). The app validates everything it reads
// and falls back to its bundled numbers when a value is wrong (app/src/features/business/rules.ts); the checks
// below are the same rules, applied before saving so a mistake is caught here with a clear message instead of
// being silently ignored by the app. tests/business-rules.test.ts keeps the two in step.
import { SECTORS } from "./ipo-admin-data.ts";

export type RuleKey = "sector_pe" | "growth_premium" | "issue_size" | "issue_cost" | "eligibility";

export interface SectorPe {
  sector: string;
  pe: number;
}
export interface GrowthTier {
  minCagrPct: number;
  premiumPct: number;
}
export interface IssueSize {
  dilutionLowPct: number;
  dilutionHighPct: number;
  bandPct: number;
}
export interface CostItem {
  label: string;
  lakhs: number;
  hint?: string;
}
export interface CostStage {
  label: string;
  lakhs: number;
}
export interface IssueCost {
  referenceIssueLakhs: number;
  items: CostItem[];
  stages: CostStage[];
}
export interface Eligibility {
  smeCapitalMinCr: number;
  smeCapitalMaxCr: number;
  ofsMaxPct: number;
  gcpMaxPct: number;
  gcpMaxCr: number;
  netWorthMinCr: number;
  ntaMinCr: number;
  leverageMax: number;
  opProfitMinCr: number;
  opProfitMinYears: number;
}

export const ELIGIBILITY_FIELDS: { key: keyof Eligibility; label: string; unit: string }[] = [
  { key: "smeCapitalMinCr", label: "SME platforms: minimum post-issue paid-up capital", unit: "₹ Cr" },
  { key: "smeCapitalMaxCr", label: "SME platforms: maximum post-issue paid-up capital", unit: "₹ Cr" },
  { key: "ofsMaxPct", label: "Offer for sale: maximum share of the issue", unit: "%" },
  { key: "gcpMaxPct", label: "General corporate purposes: maximum share of the issue", unit: "%" },
  { key: "gcpMaxCr", label: "General corporate purposes: maximum amount", unit: "₹ Cr" },
  { key: "netWorthMinCr", label: "Minimum net worth", unit: "₹ Cr" },
  { key: "ntaMinCr", label: "Minimum net tangible assets", unit: "₹ Cr" },
  { key: "leverageMax", label: "Maximum leverage (debt ÷ equity)", unit: ": 1" },
  { key: "opProfitMinCr", label: "Operating profit (EBITDA) per year, at least", unit: "₹ Cr" },
  { key: "opProfitMinYears", label: "…in at least this many of the last 3 years", unit: "years" },
];

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Why this value cannot be saved, in plain words; null when it is fine. */
export function checkRule(key: RuleKey, value: unknown): string | null {
  switch (key) {
    case "sector_pe": {
      if (!Array.isArray(value)) return "Sector P/E must be a list.";
      if (value.length !== SECTORS.length) return `There must be exactly ${SECTORS.length} sectors.`;
      const seen = new Set<string>();
      for (const r of value) {
        if (!isObj(r) || !text(r.sector, 60)) return "Every row needs a sector name.";
        if (!(SECTORS as readonly string[]).includes(r.sector)) return `"${r.sector}" is not one of the fixed sector names.`;
        if (seen.has(r.sector)) return `"${r.sector}" appears twice.`;
        seen.add(r.sector);
        if (!num(r.pe, 1, 200)) return `${r.sector}: the P/E multiple must be between 1 and 200.`;
      }
      return null;
    }
    case "growth_premium": {
      if (!Array.isArray(value) || value.length === 0) return "Add at least one growth tier.";
      if (value.length > 10) return "At most 10 growth tiers.";
      const tiers: GrowthTier[] = [];
      for (const r of value) {
        if (!isObj(r) || !num(r.minCagrPct, 0, 500)) return "Each tier needs a growth rate between 0% and 500%.";
        if (!num(r.premiumPct, 0, 200)) return "Each tier needs a premium between 0% and 200%.";
        tiers.push({ minCagrPct: r.minCagrPct, premiumPct: r.premiumPct });
      }
      if (new Set(tiers.map((t) => t.minCagrPct)).size !== tiers.length) return "Two tiers have the same growth rate.";
      tiers.sort((a, b) => b.minCagrPct - a.minCagrPct);
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].premiumPct > tiers[i - 1].premiumPct) return `Faster growth cannot earn a smaller premium: ${tiers[i].minCagrPct}%+ gives +${tiers[i].premiumPct}% but ${tiers[i - 1].minCagrPct}%+ gives only +${tiers[i - 1].premiumPct}%.`;
      }
      return null;
    }
    case "issue_size": {
      if (!isObj(value)) return "Issue size settings are missing.";
      if (!num(value.dilutionLowPct, 1, 75) || !num(value.dilutionHighPct, 1, 75)) return "Public float must be between 1% and 75%.";
      if (value.dilutionLowPct > value.dilutionHighPct) return "The lower float cannot be above the higher float.";
      if (!num(value.bandPct, 0, 50)) return "The valuation band must be between 0% and 50%.";
      return null;
    }
    case "issue_cost": {
      if (!isObj(value)) return "Issue cost settings are missing.";
      if (!num(value.referenceIssueLakhs, 100, 1_000_000)) return "The reference issue must be between ₹100 lakh and ₹10,00,000 lakh.";
      if (!Array.isArray(value.items) || value.items.length === 0) return "Add at least one cost item.";
      if (value.items.length > 20) return "At most 20 cost items.";
      if (!Array.isArray(value.stages) || value.stages.length === 0) return "Add at least one payment stage.";
      if (value.stages.length > 12) return "At most 12 payment stages.";
      let items = 0;
      for (const i of value.items) {
        if (!isObj(i) || !text(i.label, 120)) return "Every cost item needs a name (up to 120 characters).";
        if (!num(i.lakhs, 0, 1_000_000)) return `${i.label}: the amount must be 0 or more.`;
        if (i.hint !== undefined && i.hint !== null && !text(i.hint, 200)) return `${i.label}: the note must be 1 to 200 characters, or left out.`;
        items += i.lakhs;
      }
      let stages = 0;
      for (const s of value.stages) {
        if (!isObj(s) || !text(s.label, 120)) return "Every payment stage needs a name (up to 120 characters).";
        if (!num(s.lakhs, 0, 1_000_000)) return `${s.label}: the amount must be 0 or more.`;
        stages += s.lakhs;
      }
      if (!(items > 0)) return "The cost items add up to zero.";
      if (Math.abs(items - stages) > 0.01) return `The cost items add up to ₹${fmt(items)} lakh but the payment stages add up to ₹${fmt(stages)} lakh. They are the same money, so the totals must match.`;
      if (items > value.referenceIssueLakhs * 0.5) return "The total cost is more than half of the reference issue. Check the amounts.";
      return null;
    }
    case "eligibility": {
      if (!isObj(value)) return "Eligibility limits are missing.";
      for (const f of ELIGIBILITY_FIELDS) if (typeof value[f.key] !== "number" || !Number.isFinite(value[f.key] as number)) return `${f.label}: enter a number.`;
      const v = value as unknown as Eligibility;
      if (!num(v.smeCapitalMinCr, 0, 1000) || !num(v.smeCapitalMaxCr, 1, 10_000)) return "SME capital limits are out of range.";
      if (v.smeCapitalMinCr >= v.smeCapitalMaxCr) return "The minimum SME capital must be below the maximum.";
      if (!num(v.ofsMaxPct, 0, 100) || !num(v.gcpMaxPct, 0, 100)) return "Percentages must be between 0 and 100.";
      if (!num(v.gcpMaxCr, 0, 100_000) || !num(v.netWorthMinCr, 0, 100_000) || !num(v.ntaMinCr, 0, 100_000) || !num(v.opProfitMinCr, 0, 100_000)) return "Amounts must be 0 or more.";
      if (!num(v.leverageMax, 0.1, 100)) return "Maximum leverage must be between 0.1 and 100.";
      if (!num(v.opProfitMinYears, 0, 3) || !Number.isInteger(v.opProfitMinYears)) return "Years must be 0, 1, 2 or 3.";
      return null;
    }
  }
}

export const fmt = (n: number): string => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function costTotals(cost: Pick<IssueCost, "items" | "stages" | "referenceIssueLakhs">): { items: number; stages: number; match: boolean; pctOfIssue: number } {
  const items = cost.items.reduce((n, i) => n + (Number.isFinite(i.lakhs) ? i.lakhs : 0), 0);
  const stages = cost.stages.reduce((n, s) => n + (Number.isFinite(s.lakhs) ? s.lakhs : 0), 0);
  return { items, stages, match: Math.abs(items - stages) <= 0.01, pctOfIssue: cost.referenceIssueLakhs > 0 ? (items / cost.referenceIssueLakhs) * 100 : 0 };
}
