import assert from "node:assert/strict";
import { test } from "node:test";

import { croreText, daysLeft, FIGURE_COLUMNS, isUuid, readFigures, safeDownloadName } from "../src/lib/balance-sheets.ts";

test("reads stored figures and shows anything unusable as missing", () => {
  const years = readFigures([{ label: "FY 2024-25", revenue: 52, pat: "4", netWorth: Number.NaN, extra: 9 }, null, { revenue: 41 }, {}, {}]);
  assert.equal(years.length, 3);
  assert.equal(years[0].label, "FY 2024-25");
  assert.equal(years[0].values.revenue, 52);
  assert.equal(years[0].values.pat, null);
  assert.equal(years[0].values.netWorth, null);
  assert.equal("extra" in years[0].values, false);
  assert.equal(years[1].label, "Year 2");
  assert.deepEqual(Object.keys(years[0].values), FIGURE_COLUMNS.map(([k]) => k));
  assert.deepEqual(readFigures("x"), []);
  assert.deepEqual(readFigures(null), []);
});

test("the columns are the nine figures the app stores", () => {
  assert.deepEqual(FIGURE_COLUMNS.map(([k]) => k), ["revenue", "ebitda", "pat", "netWorth", "borrowings", "currentAssets", "currentLiabilities", "intangibles", "financeCost"]);
});

test("formats amounts and missing values", () => {
  assert.equal(croreText(null), "Not specified");
  assert.equal(croreText(17.505), "₹17.505 Cr");
  assert.equal(croreText(-1.2), "₹-1.2 Cr");
  assert.equal(croreText(1234.5), "₹1,234.5 Cr");
});

test("days left", () => {
  const now = new Date("2026-11-16T05:00:00Z");
  assert.equal(daysLeft("2027-02-14T05:00:00Z", now), 90);
  assert.equal(daysLeft("2026-11-01T00:00:00Z", now), 0);
  assert.equal(daysLeft("junk", now), 0);
});

test("ids and download names", () => {
  assert.equal(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"), true);
  for (const bad of ["", "1", "../x", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1/..", 5, null]) assert.equal(isUuid(bad), false);
  assert.equal(safeDownloadName("FY25 accounts (final).xlsx"), "FY25 accounts (final).xlsx");
  assert.equal(safeDownloadName('a"b\r\nSet-Cookie: x.xlsx'), "a_b_Set-Cookie_ x.xlsx");
  assert.equal(safeDownloadName("///"), "balance-sheet");
  assert.equal(safeDownloadName(""), "balance-sheet");
});
