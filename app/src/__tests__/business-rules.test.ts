/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { DEFAULT_RULES, defaultRuleRows, mergeRules, RULE_KEYS, validateEligibility, validateGrowthTiers, validateIssueCost, validateIssueSize, validateSectorPe, type RuleRow } from "@/features/business/rules";
import { calcIssueCost, calcIssueSize, checkEligibility, EMPTY_ELIGIBILITY, growthHint, growthPremium } from "@/features/business/tools";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rows = (): RuleRow[] => clone(defaultRuleRows());
const withRow = (key: string, value: unknown): RuleRow[] => rows().map((r) => (r.key === key ? { key, value } : r));

/** The seed rows written in the migration, parsed back out of the SQL. */
function seedFromMigration(): RuleRow[] {
  const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261114001000_business_rules.sql"), "utf8");
  const out: RuleRow[] = [];
  for (const m of sql.matchAll(/^\s*\('([a-z_]+)', '((?:[^']|'')*)'::jsonb,/gm)) out.push({ key: m[1], value: JSON.parse(m[2].replace(/''/g, "'")) });
  return out;
}

describe("bundled rules and the database seed", () => {
  it("the migration seeds exactly the bundled numbers", () => {
    const seed = seedFromMigration();
    expect(seed.map((r) => r.key).sort()).toEqual([...RULE_KEYS].sort());
    expect(seed).toEqual(expect.arrayContaining(clone(defaultRuleRows())));
  });

  it("the seed passes validation and reproduces the bundled rules", () => {
    const merged = mergeRules(seedFromMigration());
    expect(merged.rejected).toEqual([]);
    expect([...merged.remote].sort()).toEqual([...RULE_KEYS].sort());
    expect(merged.rules).toEqual(clone(DEFAULT_RULES));
  });

  it("with no rows, an empty table or no answer, the bundled rules are used", () => {
    for (const input of [[], null, undefined]) {
      const m = mergeRules(input);
      expect(m.rules).toEqual(DEFAULT_RULES);
      expect(m.remote).toEqual([]);
      expect(m.rejected).toEqual([]);
    }
  });

  it("the bundled calculators give the same answers as before the rules became remote", () => {
    // Website parity values: ₹35 Cr issue costs ₹3.5 Cr (10%); PAT 5 Cr in Manufacturing at 22% CAGR.
    expect(calcIssueCost(35)?.totalCr).toBeCloseTo(3.5, 6);
    expect(calcIssueCost(35)?.totalPct).toBeCloseTo(10, 6);
    const size = calcIssueSize(5, "Manufacturing / Engineering", 22);
    expect(size).toMatchObject({ basePe: 15, premiumPct: 15, pe: 17.3, marketCap: 86.3, marketCapLow: 77.6, marketCapHigh: 94.9, issueLow: 15.5, issueHigh: 28.5, dilutionLow: 20, dilutionHigh: 30 });
    expect(growthHint()).toBe("Adds a growth premium: 10%+ → +5% · 20%+ → +15% · 30%+ → +25% on the multiple.");
  });
});

describe("a change in the admin panel reaches the calculators", () => {
  it("sector P/E", () => {
    const pe = clone(DEFAULT_RULES.issueSize.sectorPe).map((s) => (s.sector === "Manufacturing / Engineering" ? { ...s, pe: 20 } : s));
    const m = mergeRules(withRow("sector_pe", pe));
    expect(m.rejected).toEqual([]);
    expect(calcIssueSize(5, "Manufacturing / Engineering", null, m.rules.issueSize)?.marketCap).toBe(100);
    expect(calcIssueSize(5, "Manufacturing / Engineering", null)?.marketCap).toBe(75); // bundled copy untouched
  });

  it("growth premium tiers, in any stored order", () => {
    const m = mergeRules(withRow("growth_premium", [{ minCagrPct: 15, premiumPct: 10 }, { minCagrPct: 40, premiumPct: 30 }]));
    expect(m.rejected).toEqual([]);
    expect(growthPremium(14, m.rules.issueSize.growthTiers)).toBe(0);
    expect(growthPremium(15, m.rules.issueSize.growthTiers)).toBe(10);
    expect(growthPremium(60, m.rules.issueSize.growthTiers)).toBe(30);
    expect(growthHint(m.rules.issueSize.growthTiers)).toBe("Adds a growth premium: 15%+ → +10% · 40%+ → +30% on the multiple.");
  });

  it("float and valuation band", () => {
    const m = mergeRules(withRow("issue_size", { dilutionLowPct: 25, dilutionHighPct: 35, bandPct: 20 }));
    const r = calcIssueSize(10, "Other", null, m.rules.issueSize);
    expect(r).toMatchObject({ marketCap: 150, marketCapLow: 120, marketCapHigh: 180, issueLow: 30, issueHigh: 63, dilutionLow: 25, dilutionHigh: 35 });
  });

  it("cost items and stages", () => {
    const cost = clone(DEFAULT_RULES.issueCost);
    cost.items[1].lakhs += 35; // BRLM fee 50 → 85
    cost.stages[cost.stages.length - 1].lakhs += 35;
    const m = mergeRules(withRow("issue_cost", cost));
    expect(m.rejected).toEqual([]);
    const r = calcIssueCost(35, m.rules.issueCost);
    expect(r?.totalCr).toBeCloseTo(3.85, 6);
    expect(r?.totalPct).toBeCloseTo(11, 6);
    expect(r?.stages[r.stages.length - 1].cumulativePct).toBeCloseTo(100, 6);
  });

  it("eligibility limits change both the check and the wording", () => {
    const m = mergeRules(withRow("eligibility", { ...DEFAULT_RULES.eligibility, smeCapitalMaxCr: 50, ofsMaxPct: 25 }));
    expect(m.rejected).toEqual([]);
    const input = { ...EMPTY_ELIGIBILITY, postIssueCapital: 40, issueSize: 100, ofsPortion: 24 };
    const before = checkEligibility(input).platforms[0].checks;
    const after = checkEligibility(input, m.rules.eligibility).platforms[0].checks;
    const find = (cs: typeof before, re: RegExp) => cs.find((c) => re.test(c.label));
    expect(find(before, /paid-up capital between/)?.ok).toBe(false);
    expect(find(after, /paid-up capital between/)).toMatchObject({ ok: true, label: "Post-issue paid-up capital between ₹1 Cr and ₹50 Cr" });
    expect(find(before, /Offer for sale/)?.ok).toBe(false);
    expect(find(after, /Offer for sale/)).toMatchObject({ ok: true, label: "Offer for sale ≤ 25% of the total issue" });
  });
});

describe("a bad value never reaches a calculator", () => {
  const rejected = (key: string, value: unknown) => {
    const m = mergeRules(withRow(key, value));
    expect(m.rejected).toEqual([key]);
    expect(m.rules).toEqual(clone(DEFAULT_RULES));
  };

  it("sector P/E: wrong shape, missing or renamed sector, silly multiple", () => {
    const good = clone(DEFAULT_RULES.issueSize.sectorPe);
    rejected("sector_pe", "28");
    rejected("sector_pe", {});
    rejected("sector_pe", good.slice(1));
    rejected("sector_pe", good.map((s, i) => (i === 0 ? { ...s, sector: "Software" } : s)));
    rejected("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: 0 } : s)));
    rejected("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: -5 } : s)));
    rejected("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: "28" } : s)));
    rejected("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: 5000 } : s)));
    rejected("sector_pe", [...good.slice(0, -1), good[0]]); // a duplicate in place of the last sector
    expect(validateSectorPe([...good].reverse())?.map((s) => s.sector)).toEqual(good.map((s) => s.sector)); // order is normalised, not rejected
  });

  it("growth tiers: empty, duplicates, negative, or a smaller premium for faster growth", () => {
    rejected("growth_premium", []);
    rejected("growth_premium", [{ minCagrPct: 10, premiumPct: 5 }, { minCagrPct: 10, premiumPct: 8 }]);
    rejected("growth_premium", [{ minCagrPct: -1, premiumPct: 5 }]);
    rejected("growth_premium", [{ minCagrPct: 10, premiumPct: 20 }, { minCagrPct: 30, premiumPct: 5 }]);
    rejected("growth_premium", [{ minCagrPct: 10 }]);
    expect(validateGrowthTiers([{ minCagrPct: 10, premiumPct: 5 }])).toEqual([{ minCagrPct: 10, premiumPct: 5 }]);
  });

  it("issue size: inverted or impossible percentages", () => {
    rejected("issue_size", { dilutionLowPct: 30, dilutionHighPct: 20, bandPct: 10 });
    rejected("issue_size", { dilutionLowPct: 20, dilutionHighPct: 130, bandPct: 10 });
    rejected("issue_size", { dilutionLowPct: 20, dilutionHighPct: 30, bandPct: 90 });
    rejected("issue_size", { dilutionLowPct: 0, dilutionHighPct: 30, bandPct: 10 });
    rejected("issue_size", [20, 30, 10]);
    expect(validateIssueSize({ dilutionLowPct: 20, dilutionHighPct: 20, bandPct: 0 })).not.toBeNull();
  });

  it("issue cost: totals that disagree, no items, absurd totals, bad labels", () => {
    const good = clone(DEFAULT_RULES.issueCost);
    const bump = clone(good);
    bump.items[0].lakhs += 10; // items no longer add up to the stages
    rejected("issue_cost", bump);
    rejected("issue_cost", { ...good, items: [] });
    rejected("issue_cost", { ...good, stages: [] });
    rejected("issue_cost", { ...good, referenceIssueLakhs: 0 });
    rejected("issue_cost", { ...good, referenceIssueLakhs: 400 }); // cost would be 87% of the issue
    rejected("issue_cost", { ...good, items: good.items.map((i, n) => (n === 0 ? { ...i, label: "" } : i)) });
    rejected("issue_cost", { ...good, items: good.items.map((i, n) => (n === 0 ? { ...i, lakhs: -1 } : i)) });
    rejected("issue_cost", { ...good, items: good.items.map((i) => ({ ...i, lakhs: 0 })), stages: good.stages.map((st) => ({ ...st, lakhs: 0 })) });
    expect(validateIssueCost(good)).toEqual(good);
  });

  it("eligibility: missing field, inverted capital range, fractional years, wrong types", () => {
    const good = DEFAULT_RULES.eligibility;
    const { leverageMax: _omit, ...missing } = good;
    rejected("eligibility", missing);
    rejected("eligibility", { ...good, smeCapitalMinCr: 30 });
    rejected("eligibility", { ...good, opProfitMinYears: 2.5 });
    rejected("eligibility", { ...good, opProfitMinYears: 4 });
    rejected("eligibility", { ...good, ofsMaxPct: 120 });
    rejected("eligibility", { ...good, ntaMinCr: "3" });
    rejected("eligibility", { ...good, leverageMax: 0 });
    rejected("eligibility", null);
    expect(validateEligibility({ ...good, extra: "ignored" })).toEqual(good);
  });

  it("one bad key does not stop the good ones", () => {
    const pe = clone(DEFAULT_RULES.issueSize.sectorPe).map((s) => ({ ...s, pe: s.pe + 1 }));
    const m = mergeRules([{ key: "sector_pe", value: pe }, { key: "issue_cost", value: "broken" }, { key: "unknown_key", value: { x: 1 } }, { key: 5 as never, value: 1 }]);
    expect(m.remote).toEqual(["sector_pe"]);
    expect(m.rejected).toEqual(["issue_cost"]);
    expect(m.rules.issueSize.sectorPe[0].pe).toBe(DEFAULT_RULES.issueSize.sectorPe[0].pe + 1);
    expect(m.rules.issueCost).toEqual(DEFAULT_RULES.issueCost);
  });
});
