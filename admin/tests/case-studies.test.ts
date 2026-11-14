// Unit tests for case-study slugs and save checks. Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkCaseStudy, emptyCaseStudy, EXCHANGES, slugify, toRow, type CaseStudyDraft } from "../src/lib/case-studies.ts";

const good = (over: Partial<CaseStudyDraft> = {}): CaseStudyDraft => ({ ...emptyCaseStudy(), title: "Aaron Industries", slug: "aaron-industries", summary: "A Surat elevator manufacturer listed in 2018.", exchange: "NSE Emerge", listing_year: 2018, ...over });

test("slugs: lowercase, hyphens, no punctuation, no accents, capped", () => {
  assert.equal(slugify("Aaron Industries Ltd."), "aaron-industries-ltd");
  assert.equal(slugify("  R&D  Labs (India)  "), "r-and-d-labs-india");
  assert.equal(slugify("Café Société"), "cafe-societe");
  assert.equal(slugify("---"), "");
  assert.equal(slugify("A".repeat(200)).length, 80);
  assert.ok(!slugify(`${"ab ".repeat(40)}`).endsWith("-"));
});

test("a slug made by slugify always passes the database pattern", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114001300_case_studies.sql", import.meta.url), "utf8");
  const pattern = /slug ~ '([^']+)'/.exec(sql);
  assert.ok(pattern);
  const re = new RegExp(pattern[1]);
  for (const title of ["Aaron Industries Ltd.", "R&D Labs (India)", "3M India", "X Y Z", "Café Société 2024"]) assert.ok(re.test(slugify(title)), title);
});

test("the exchange list matches the database", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261114001300_case_studies.sql", import.meta.url), "utf8");
  const block = /exchange in \(([^)]*)\)/.exec(sql);
  assert.ok(block);
  assert.deepEqual([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), [...EXCHANGES]);
});

test("a complete case study can be saved and published", () => {
  assert.equal(checkCaseStudy(good(), false), null);
  assert.equal(checkCaseStudy(good(), true), null);
});

test("a draft may leave out exchange and year; publishing may not", () => {
  const d = good({ exchange: null, listing_year: null });
  assert.equal(checkCaseStudy(d, false), null);
  assert.match(checkCaseStudy(d, true) ?? "", /exchange before publishing/);
  assert.match(checkCaseStudy(good({ listing_year: null }), true) ?? "", /listing year before publishing/);
});

test("each field is checked with a plain message", () => {
  assert.match(checkCaseStudy(good({ title: "A" }), false) ?? "", /title must be 3 to 140/);
  assert.match(checkCaseStudy(good({ slug: "Bad Slug" }), false) ?? "", /link name/);
  assert.match(checkCaseStudy(good({ slug: "ab" }), false) ?? "", /link name/);
  assert.match(checkCaseStudy(good({ summary: "short" }), false) ?? "", /summary must be 10 to 400/);
  assert.match(checkCaseStudy(good({ summary: "x".repeat(401) }), false) ?? "", /summary must be 10 to 400/);
  assert.match(checkCaseStudy(good({ body: "x".repeat(12001) }), false) ?? "", /too long/);
  assert.match(checkCaseStudy(good({ listing_year: 1850 }), false) ?? "", /between 1990 and 2100/);
  assert.match(checkCaseStudy(good({ listing_year: 2018.5 }), false) ?? "", /between 1990 and 2100/);
  assert.match(checkCaseStudy(good({ hero_image_url: "http://insecure.example/a.jpg" }), false) ?? "", /https/);
  assert.match(checkCaseStudy(good({ hero_image_url: "javascript:alert(1)" }), false) ?? "", /https/);
  assert.match(checkCaseStudy(good({ sort_order: 1.5 }), false) ?? "", /whole number/);
  assert.match(checkCaseStudy(good({ exchange: "NASDAQ" as never }), false) ?? "", /NSE Emerge, BSE SME or Mainboard/);
});

test("highlights need both parts and are capped", () => {
  assert.equal(checkCaseStudy(good({ highlights: [{ label: "Issue size", value: "₹4.9 Cr" }] }), false), null);
  assert.match(checkCaseStudy(good({ highlights: [{ label: "Issue size", value: " " }] }), false) ?? "", /both a label and a value/);
  assert.match(checkCaseStudy(good({ highlights: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: "v" })) }), false) ?? "", /At most 8/);
  assert.match(checkCaseStudy(good({ highlights: [{ label: "x".repeat(41), value: "v" }] }), false) ?? "", /40 characters/);
});

test("the saved row is trimmed and empty text becomes null", () => {
  const row = toRow(good({ title: "  Aaron Industries ", city: "  ", body: "", hero_image_url: " ", highlights: [{ label: " Issue size ", value: " ₹4.9 Cr " }] }));
  assert.equal(row.title, "Aaron Industries");
  assert.equal(row.city, null);
  assert.equal(row.body, null);
  assert.equal(row.hero_image_url, null);
  assert.deepEqual(row.highlights, [{ label: "Issue size", value: "₹4.9 Cr" }]);
});
