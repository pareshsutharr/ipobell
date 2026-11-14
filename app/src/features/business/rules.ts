// Business rules that can be changed without an app release (public.business_rules, edited in the admin panel).
// The app always has a bundled copy (DEFAULT_RULES). A remote value replaces the bundled one only if it passes
// strict validation; anything missing, malformed or implausible falls back to the bundled value for that key,
// so a typo in the admin panel can never break a calculator.
//
// Not remote on purpose: the SME IPO checklist. Ticks are saved by position, so editing the list remotely
// would scramble progress users have already saved.
import {
  DEFAULT_ELIGIBILITY_LIMITS,
  DEFAULT_ISSUE_COST_RULES,
  DEFAULT_ISSUE_SIZE_RULES,
  type EligibilityLimits,
  type GrowthTier,
  type IssueCostRules,
  type IssueSizeRules,
} from "@/features/business/tools";

export interface BusinessRules {
  issueSize: IssueSizeRules;
  issueCost: IssueCostRules;
  eligibility: EligibilityLimits;
}

export const DEFAULT_RULES: BusinessRules = { issueSize: DEFAULT_ISSUE_SIZE_RULES, issueCost: DEFAULT_ISSUE_COST_RULES, eligibility: DEFAULT_ELIGIBILITY_LIMITS };

/** Keys in public.business_rules. */
export const RULE_KEYS = ["sector_pe", "growth_premium", "issue_size", "issue_cost", "eligibility"] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const numIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/**
 * Sector P/E. Only the multiples may change remotely: the sector names are shared with the admin panel's sector
 * list and the notification filters, so the remote list must contain exactly the bundled names.
 */
export function validateSectorPe(raw: unknown): IssueSizeRules["sectorPe"] | null {
  if (!Array.isArray(raw)) return null;
  const bundled = DEFAULT_ISSUE_SIZE_RULES.sectorPe;
  if (raw.length !== bundled.length) return null;
  const byName = new Map<string, number>();
  for (const r of raw) {
    if (!isObj(r) || !text(r.sector, 60) || !numIn(r.pe, 1, 200)) return null;
    byName.set(r.sector, r.pe);
  }
  if (byName.size !== bundled.length || !bundled.every((b) => byName.has(b.sector))) return null;
  return bundled.map((b) => ({ sector: b.sector, pe: byName.get(b.sector) as number }));
}

export function validateGrowthTiers(raw: unknown): GrowthTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const tiers: GrowthTier[] = [];
  for (const r of raw) {
    if (!isObj(r) || !numIn(r.minCagrPct, 0, 500) || !numIn(r.premiumPct, 0, 200)) return null;
    tiers.push({ minCagrPct: r.minCagrPct, premiumPct: r.premiumPct });
  }
  if (new Set(tiers.map((t) => t.minCagrPct)).size !== tiers.length) return null;
  tiers.sort((a, b) => b.minCagrPct - a.minCagrPct);
  // faster growth must never earn a smaller premium
  for (let i = 1; i < tiers.length; i++) if (tiers[i].premiumPct > tiers[i - 1].premiumPct) return null;
  return tiers;
}

export function validateIssueSize(raw: unknown): Pick<IssueSizeRules, "dilutionLowPct" | "dilutionHighPct" | "bandPct"> | null {
  if (!isObj(raw)) return null;
  const { dilutionLowPct, dilutionHighPct, bandPct } = raw;
  if (!numIn(dilutionLowPct, 1, 75) || !numIn(dilutionHighPct, 1, 75) || !numIn(bandPct, 0, 50)) return null;
  if (dilutionLowPct > dilutionHighPct) return null;
  return { dilutionLowPct, dilutionHighPct, bandPct };
}

export function validateIssueCost(raw: unknown): IssueCostRules | null {
  if (!isObj(raw) || !numIn(raw.referenceIssueLakhs, 100, 1_000_000)) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > 20) return null;
  if (!Array.isArray(raw.stages) || raw.stages.length === 0 || raw.stages.length > 12) return null;
  const items: IssueCostRules["items"] = [];
  for (const i of raw.items) {
    if (!isObj(i) || !text(i.label, 120) || !numIn(i.lakhs, 0, 1_000_000)) return null;
    if (i.hint !== undefined && i.hint !== null && !text(i.hint, 200)) return null;
    items.push({ label: i.label.trim(), lakhs: i.lakhs, ...(typeof i.hint === "string" ? { hint: i.hint.trim() } : {}) });
  }
  const stages: IssueCostRules["stages"] = [];
  for (const st of raw.stages) {
    if (!isObj(st) || !text(st.label, 120) || !numIn(st.lakhs, 0, 1_000_000)) return null;
    stages.push({ label: st.label.trim(), lakhs: st.lakhs });
  }
  const itemTotal = items.reduce((n, i) => n + i.lakhs, 0);
  const stageTotal = stages.reduce((n, st) => n + st.lakhs, 0);
  if (!(itemTotal > 0)) return null;
  // the payment stages are the same money as the line items, split over time: the two totals must agree
  if (Math.abs(itemTotal - stageTotal) > 0.01) return null;
  // a total cost above half the issue is not a plausible planning number
  if (itemTotal > raw.referenceIssueLakhs * 0.5) return null;
  return { referenceIssueLakhs: raw.referenceIssueLakhs, items, stages };
}

export function validateEligibility(raw: unknown): EligibilityLimits | null {
  if (!isObj(raw)) return null;
  const r = raw;
  if (!numIn(r.smeCapitalMinCr, 0, 1000) || !numIn(r.smeCapitalMaxCr, 1, 10_000) || r.smeCapitalMinCr >= r.smeCapitalMaxCr) return null;
  if (!numIn(r.ofsMaxPct, 0, 100) || !numIn(r.gcpMaxPct, 0, 100) || !numIn(r.gcpMaxCr, 0, 100_000)) return null;
  if (!numIn(r.netWorthMinCr, 0, 100_000) || !numIn(r.ntaMinCr, 0, 100_000) || !numIn(r.leverageMax, 0.1, 100) || !numIn(r.opProfitMinCr, 0, 100_000)) return null;
  if (!numIn(r.opProfitMinYears, 0, 3) || !Number.isInteger(r.opProfitMinYears)) return null;
  return {
    smeCapitalMinCr: r.smeCapitalMinCr, smeCapitalMaxCr: r.smeCapitalMaxCr, ofsMaxPct: r.ofsMaxPct, gcpMaxPct: r.gcpMaxPct, gcpMaxCr: r.gcpMaxCr,
    netWorthMinCr: r.netWorthMinCr, ntaMinCr: r.ntaMinCr, leverageMax: r.leverageMax, opProfitMinCr: r.opProfitMinCr, opProfitMinYears: r.opProfitMinYears,
  };
}

export interface RuleRow {
  key: string;
  value: unknown;
}

export interface MergedRules {
  rules: BusinessRules;
  /** Keys taken from the server. */
  remote: RuleKey[];
  /** Keys present on the server but rejected by validation (the bundled value is used instead). */
  rejected: RuleKey[];
}

/** Bundled rules with every valid remote value laid over them. */
export function mergeRules(rows: RuleRow[] | null | undefined): MergedRules {
  const by = new Map((rows ?? []).filter((r) => r && typeof r.key === "string").map((r) => [r.key, r.value]));
  const remote: RuleKey[] = [];
  const rejected: RuleKey[] = [];
  const take = <T>(key: RuleKey, validate: (raw: unknown) => T | null): T | null => {
    if (!by.has(key)) return null;
    const v = validate(by.get(key));
    (v === null ? rejected : remote).push(key);
    return v;
  };

  const sectorPe = take("sector_pe", validateSectorPe);
  const growthTiers = take("growth_premium", validateGrowthTiers);
  const size = take("issue_size", validateIssueSize);
  const issueCost = take("issue_cost", validateIssueCost);
  const eligibility = take("eligibility", validateEligibility);

  return {
    rules: {
      issueSize: { ...DEFAULT_ISSUE_SIZE_RULES, ...(sectorPe ? { sectorPe } : {}), ...(growthTiers ? { growthTiers } : {}), ...(size ?? {}) },
      issueCost: issueCost ?? DEFAULT_ISSUE_COST_RULES,
      eligibility: eligibility ?? DEFAULT_ELIGIBILITY_LIMITS,
    },
    remote,
    rejected,
  };
}

/** The bundled rules in the shape stored in public.business_rules (used to seed the table and by tests). */
export function defaultRuleRows(): { key: RuleKey; value: unknown }[] {
  const d = DEFAULT_RULES;
  return [
    { key: "sector_pe", value: d.issueSize.sectorPe },
    { key: "growth_premium", value: d.issueSize.growthTiers },
    { key: "issue_size", value: { dilutionLowPct: d.issueSize.dilutionLowPct, dilutionHighPct: d.issueSize.dilutionHighPct, bandPct: d.issueSize.bandPct } },
    { key: "issue_cost", value: d.issueCost },
    { key: "eligibility", value: d.eligibility },
  ];
}
