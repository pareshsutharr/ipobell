// Unit tests for the staff-entered IPO data logic (lists, completeness, CSV import/export). Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  csvCell, exportCsv, INDIAN_STATES, isComplete, LISTING_PLATFORMS, missingFields, normalizePlatform, normalizeSector, normalizeState,
  parseCsv, planImport, platformLabel, SECTORS, suggestPlatform, type IpoAdminData, type IpoRef,
} from "../src/lib/ipo-admin-data.ts";

const IPOS: IpoRef[] = [
  { id: "id-acme", slug: "acme-textiles-ipo", name: "Acme Textiles Limited", display_name: "Acme Textiles" },
  { id: "id-beta", slug: "beta-pharma-ipo", name: "Beta Pharma Limited", display_name: null },
  { id: "id-twin1", slug: "twin-one-ipo", name: "Twin Industries Limited" },
  { id: "id-twin2", slug: "twin-two-ipo", name: "Twin Industries Limited" },
];
const EXISTING: IpoAdminData[] = [{ ipo_id: "id-beta", state: "Gujarat", sector: "Pharma / Healthcare", industry: "Generic formulations", listing_platform: "bse_sme" }];

test("the state list is the same as the database constraint", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114000600_ipo_admin_data.sql", import.meta.url), "utf8");
  const block = /state is null or state in \(([\s\S]*?)\)\)/.exec(sql);
  assert.ok(block, "state CHECK constraint not found in the migration");
  const inSql = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(inSql.length, 36);
  assert.deepEqual([...inSql].sort(), [...INDIAN_STATES].sort());
  assert.equal(new Set(INDIAN_STATES).size, 36, "no duplicates");
});

test("the platform list is the same as the database constraint", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114000600_ipo_admin_data.sql", import.meta.url), "utf8");
  const block = /listing_platform in \(([^)]*)\)/.exec(sql);
  assert.ok(block);
  assert.deepEqual([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort(), LISTING_PLATFORMS.map((p) => p.value).sort());
});

test("the sector list matches the app's issue-size calculator and fits the column", () => {
  const tools = readFileSync(new URL("../../app/src/features/business/tools.ts", import.meta.url), "utf8");
  const block = /export const SECTOR_PE[^=]*=\s*\[([\s\S]*?)\];/.exec(tools);
  assert.ok(block, "SECTOR_PE not found in the app");
  const inApp = [...block[1].matchAll(/sector: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...SECTORS], inApp);
  for (const s of SECTORS) assert.ok(s.length >= 2 && s.length <= 60, s);
});

test("completeness needs state, sector and platform; industry is optional", () => {
  assert.deepEqual(missingFields(null), ["state", "sector", "listing platform"]);
  assert.deepEqual(missingFields({ state: "Gujarat", sector: null, listing_platform: null }), ["sector", "listing platform"]);
  assert.equal(isComplete({ state: "Gujarat", sector: "Other", listing_platform: "bse_sme" }), true);
  assert.equal(isComplete({ state: "", sector: "Other", listing_platform: "bse_sme" }), false);
  assert.equal(isComplete(undefined), false);
});

test("platform suggestion from the feed and labels", () => {
  assert.equal(suggestPlatform("mainboard", "Equity"), "mainboard");
  assert.equal(suggestPlatform("sme", "NSE SME"), "nse_emerge");
  assert.equal(suggestPlatform("sme", "BSE SME"), "bse_sme");
  assert.equal(suggestPlatform("sme", null), null);
  assert.equal(suggestPlatform(null, null), null);
  assert.equal(platformLabel("nse_emerge"), "NSE Emerge");
  assert.equal(platformLabel(null), "Not specified");
  assert.equal(platformLabel("nasdaq"), "Not specified");
});

test("state names are matched without guessing", () => {
  assert.equal(normalizeState("gujarat"), "Gujarat");
  assert.equal(normalizeState("  TAMIL   NADU "), "Tamil Nadu");
  assert.equal(normalizeState("Orissa"), "Odisha");
  assert.equal(normalizeState("New Delhi"), "Delhi");
  assert.equal(normalizeState("Pondicherry"), "Puducherry");
  assert.equal(normalizeState("J&K"), "Jammu and Kashmir");
  assert.equal(normalizeState("Andaman & Nicobar Islands"), "Andaman and Nicobar Islands");
  assert.equal(normalizeState("Daman and Diu"), "Dadra and Nagar Haveli and Daman and Diu");
  assert.equal(normalizeState("UP"), "Uttar Pradesh");
  assert.equal(normalizeState("Gujrat"), null, "a misspelling is an error, not a best guess");
  assert.equal(normalizeState("Surat"), null, "a city is not a state");
  assert.equal(normalizeState(""), null);
});

test("sector and platform matching", () => {
  assert.equal(normalizeSector("textile / apparel"), "Textile / Apparel");
  assert.equal(normalizeSector("IT/Software Services"), "IT / Software Services");
  assert.equal(normalizeSector("Textiles"), null);
  assert.equal(normalizePlatform("NSE Emerge"), "nse_emerge");
  assert.equal(normalizePlatform("nse sme"), "nse_emerge");
  assert.equal(normalizePlatform("BSE SME"), "bse_sme");
  assert.equal(normalizePlatform("Main Board"), "mainboard");
  assert.equal(normalizePlatform("nse_emerge"), "nse_emerge");
  assert.equal(normalizePlatform("NASDAQ"), null);
});

test("CSV parsing: quotes, commas, line breaks, CRLF, BOM, blank lines", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2,3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(parseCsv('﻿slug,name\r\nx,"Acme, Ltd"\r\n'), [["slug", "name"], ["x", "Acme, Ltd"]]);
  assert.deepEqual(parseCsv('a,"say ""hi""",c'), [["a", 'say "hi"', "c"]]);
  assert.deepEqual(parseCsv('a,"two\nlines",c\n'), [["a", "two\nlines", "c"]]);
  assert.deepEqual(parseCsv("a,b\n\n , \n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a,,c\n,,"), [["a", "", "c"]]);
  assert.deepEqual(parseCsv(""), []);
});

test("CSV cells are quoted when needed and formulas are neutralised", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("Acme, Ltd"), '"Acme, Ltd"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), "");
  assert.equal(csvCell("=HYPERLINK(\"http://evil\")"), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell("+91 98765"), "'+91 98765");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-1"), "'-1");
});

test("export lists every IPO with what is already entered", () => {
  const csv = exportCsv(IPOS, EXISTING);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ["slug", "name", "state", "sector", "industry", "listing_platform"]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[1], ["acme-textiles-ipo", "Acme Textiles", "", "", "", ""]);
  assert.deepEqual(rows[2], ["beta-pharma-ipo", "Beta Pharma Limited", "Gujarat", "Pharma / Healthcare", "Generic formulations", "BSE SME"]);
});

test("export then import with no edits changes nothing", () => {
  const plan = planImport(exportCsv(IPOS, EXISTING), IPOS, EXISTING);
  assert.equal(plan.total, 4);
  assert.deepEqual(plan.rows, []);
  assert.deepEqual(plan.issues, []);
  assert.equal(plan.unchanged, 4);
});

test("import fills blanks, keeps existing values where the sheet is blank", () => {
  const csv = ["slug,name,state,sector,industry,listing_platform", "acme-textiles-ipo,Acme,gujarat,textile / apparel,Technical textiles,NSE Emerge", "beta-pharma-ipo,,Maharashtra,,,"].join("\n");
  const plan = planImport(csv, IPOS, EXISTING);
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.rows, [
    { ipo_id: "id-acme", state: "Gujarat", sector: "Textile / Apparel", industry: "Technical textiles", listing_platform: "nse_emerge" },
    { ipo_id: "id-beta", state: "Maharashtra", sector: "Pharma / Healthcare", industry: "Generic formulations", listing_platform: "bse_sme" },
  ]);
});

test("import matches by name when there is no slug, and refuses ambiguous or unknown names", () => {
  const csv = ["name,state", "acme textiles,Goa", "ACME TEXTILES LIMITED,Kerala", "Twin Industries Limited,Punjab", "Nobody Ltd,Assam", ",Bihar"].join("\n");
  const plan = planImport(csv, IPOS, EXISTING);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].state, "Kerala", "the later line for the same IPO wins");
  const messages = plan.issues.map((i) => `${i.line}: ${i.message}`);
  assert.ok(messages.some((m) => m.startsWith("3:") && /more than once/.test(m)));
  assert.ok(messages.some((m) => m.startsWith("4:") && /2 IPOs are named/.test(m)));
  assert.ok(messages.some((m) => m.startsWith("5:") && /No IPO is named "Nobody Ltd"/.test(m)));
  assert.ok(messages.some((m) => m.startsWith("6:") && /no slug and no name/.test(m)));
});

test("a line with a bad value is rejected whole; good lines still import", () => {
  const csv = ["slug,state,sector,listing_platform", "acme-textiles-ipo,Gujrat,Textiles,NASDAQ", "beta-pharma-ipo,Kerala,,", "missing-ipo,Goa,,"].join("\n");
  const plan = planImport(csv, IPOS, EXISTING);
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].ipo_id, "id-beta");
  assert.equal(plan.issues.length, 2);
  assert.match(plan.issues[0].message, /Acme Textiles: unknown state "Gujrat"; unknown sector "Textiles".*; unknown listing platform "NASDAQ"/);
  assert.equal(plan.issues[0].line, 2);
  assert.match(plan.issues[1].message, /No IPO has the slug "missing-ipo"/);
});

test("header problems are reported clearly", () => {
  assert.match(planImport("", IPOS, EXISTING).issues[0].message, /empty/);
  assert.match(planImport("company,state\nAcme,Goa", IPOS, EXISTING).issues[0].message, /"slug" or "name"/);
  assert.match(planImport("slug,notes\nacme-textiles-ipo,hello", IPOS, EXISTING).issues[0].message, /No data columns/);
});

test("headers are forgiving about case, spaces and order; 'platform' is accepted", () => {
  const csv = "Platform, STATE ,Slug\nmain board,delhi,ACME-TEXTILES-IPO\n";
  const plan = planImport(csv, IPOS, EXISTING);
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.rows, [{ ipo_id: "id-acme", state: "Delhi", sector: null, industry: null, listing_platform: "mainboard" }]);
});

test("industry length is checked; an apostrophe added by the export is removed", () => {
  const long = "x".repeat(121);
  const plan = planImport(`slug,industry\nacme-textiles-ipo,${long}\nbeta-pharma-ipo,'-commerce logistics`, IPOS, EXISTING);
  assert.match(plan.issues[0].message, /industry must be 2 to 120 characters/);
  assert.equal(plan.rows[0].industry, "-commerce logistics");
});

test("a 500-line file imports in one pass", () => {
  const ipos: IpoRef[] = Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}`, slug: `ipo-${i}`, name: `Company ${i} Limited` }));
  const csv = "slug,state,sector,listing_platform\n" + ipos.map((p, i) => `${p.slug},${INDIAN_STATES[i % 36]},${SECTORS[i % 12]},${["NSE Emerge", "BSE SME", "Mainboard"][i % 3]}`).join("\n");
  const plan = planImport(csv, ipos, []);
  assert.equal(plan.rows.length, 500);
  assert.deepEqual(plan.issues, []);
  assert.ok(plan.rows.every((r) => isComplete(r)));
});
