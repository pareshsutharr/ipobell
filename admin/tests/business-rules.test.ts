// The admin panel's save-time checks must agree with the app's own validation. Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkRule, costTotals, ELIGIBILITY_FIELDS, type Eligibility, type IssueCost, type RuleKey, type SectorPe } from "../src/lib/business-rules.ts";

function seed(): Record<RuleKey, unknown> {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114001000_business_rules.sql", import.meta.url), "utf8");
  const out: Record<string, unknown> = {};
  for (const m of sql.matchAll(/^\s*\('([a-z_]+)', '((?:[^']|'')*)'::jsonb,/gm)) out[m[1]] = JSON.parse(m[2].replace(/''/g, "'"));
  return out as Record<RuleKey, unknown>;
}
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const KEYS: RuleKey[] = ["sector_pe", "growth_premium", "issue_size", "issue_cost", "eligibility"];

test("every seeded rule passes the admin checks", () => {
  const s = seed();
  assert.deepEqual(Object.keys(s).sort(), [...KEYS].sort());
  for (const k of KEYS) assert.equal(checkRule(k, s[k]), null, k);
});

test("the keys allowed by the database are the keys the panel edits", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114001000_business_rules.sql", import.meta.url), "utf8");
  const inSql = [.../check \(key in \(([^)]*)\)\)/.exec(sql)![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(inSql.sort(), [...KEYS].sort());
});

test("the app validates the same fields the panel shows for eligibility", () => {
  const app = readFileSync(new URL("../../app/src/features/business/tools.ts", import.meta.url), "utf8");
  const block = /export interface EligibilityLimits \{([\s\S]*?)\}/.exec(app);
  assert.ok(block);
  const inApp = [...block[1].matchAll(/^\s*(\w+): number;/gm)].map((m) => m[1]);
  assert.deepEqual(ELIGIBILITY_FIELDS.map((f) => f.key).sort(), inApp.sort());
});

test("sector P/E: only the numbers may change", () => {
  const good = clone(seed().sector_pe as SectorPe[]);
  assert.equal(checkRule("sector_pe", good.map((s) => ({ ...s, pe: s.pe + 2 }))), null);
  assert.match(checkRule("sector_pe", good.slice(1)) ?? "", /exactly 12 sectors/);
  assert.match(checkRule("sector_pe", good.map((s, i) => (i === 0 ? { ...s, sector: "Software" } : s))) ?? "", /not one of the fixed sector names/);
  assert.match(checkRule("sector_pe", [...good.slice(0, -1), good[0]]) ?? "", /appears twice/);
  assert.match(checkRule("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: 0 } : s))) ?? "", /between 1 and 200/);
  assert.match(checkRule("sector_pe", good.map((s, i) => (i === 0 ? { ...s, pe: Number.NaN } : s))) ?? "", /between 1 and 200/);
  assert.match(checkRule("sector_pe", "x") ?? "", /must be a list/);
});

test("growth tiers", () => {
  assert.equal(checkRule("growth_premium", [{ minCagrPct: 10, premiumPct: 5 }]), null);
  assert.match(checkRule("growth_premium", []) ?? "", /at least one/);
  assert.match(checkRule("growth_premium", [{ minCagrPct: 10, premiumPct: 5 }, { minCagrPct: 10, premiumPct: 8 }]) ?? "", /same growth rate/);
  assert.match(checkRule("growth_premium", [{ minCagrPct: 10, premiumPct: 20 }, { minCagrPct: 30, premiumPct: 5 }]) ?? "", /cannot earn a smaller premium/);
  assert.match(checkRule("growth_premium", [{ minCagrPct: -1, premiumPct: 5 }]) ?? "", /between 0% and 500%/);
});

test("issue size", () => {
  assert.equal(checkRule("issue_size", { dilutionLowPct: 20, dilutionHighPct: 30, bandPct: 10 }), null);
  assert.match(checkRule("issue_size", { dilutionLowPct: 30, dilutionHighPct: 20, bandPct: 10 }) ?? "", /lower float cannot be above/);
  assert.match(checkRule("issue_size", { dilutionLowPct: 20, dilutionHighPct: 130, bandPct: 10 }) ?? "", /between 1% and 75%/);
  assert.match(checkRule("issue_size", { dilutionLowPct: 20, dilutionHighPct: 30, bandPct: 90 }) ?? "", /between 0% and 50%/);
});

test("issue cost: the items and the payment stages must add up to the same amount", () => {
  const good = clone(seed().issue_cost as IssueCost);
  assert.deepEqual(costTotals(good), { items: 350, stages: 350, match: true, pctOfIssue: 10 });
  const bump = clone(good);
  bump.items[0].lakhs += 10;
  assert.equal(costTotals(bump).match, false);
  assert.match(checkRule("issue_cost", bump) ?? "", /add up to ₹360 lakh but the payment stages add up to ₹350 lakh/);
  bump.stages[0].lakhs += 10;
  assert.equal(checkRule("issue_cost", bump), null);
  assert.match(checkRule("issue_cost", { ...good, items: [] }) ?? "", /at least one cost item/);
  assert.match(checkRule("issue_cost", { ...good, referenceIssueLakhs: 400 }) ?? "", /more than half/);
  assert.match(checkRule("issue_cost", { ...good, items: good.items.map((i, n) => (n === 0 ? { ...i, label: " " } : i)) }) ?? "", /needs a name/);
  assert.match(checkRule("issue_cost", { ...good, items: good.items.map((i, n) => (n === 0 ? { ...i, hint: "" } : i)) }) ?? "", /note must be/);
});

test("eligibility", () => {
  const good = clone(seed().eligibility as Eligibility);
  assert.equal(checkRule("eligibility", { ...good, smeCapitalMaxCr: 50 }), null);
  assert.match(checkRule("eligibility", { ...good, smeCapitalMinCr: 30 }) ?? "", /minimum SME capital must be below/);
  assert.match(checkRule("eligibility", { ...good, opProfitMinYears: 2.5 }) ?? "", /0, 1, 2 or 3/);
  assert.match(checkRule("eligibility", { ...good, ofsMaxPct: 120 }) ?? "", /between 0 and 100/);
  assert.match(checkRule("eligibility", { ...good, leverageMax: Number.NaN }) ?? "", /enter a number/);
  const { ntaMinCr: _omit, ...missing } = good;
  assert.match(checkRule("eligibility", missing) ?? "", /net tangible assets: enter a number/i);
});
