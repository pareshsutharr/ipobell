import assert from "node:assert/strict";
import { test } from "node:test";

import { BALANCE_SHEET_PATH, chunk, planPurge, reportsToDelete } from "../functions/_shared/balance-sheets.ts";

const U1 = "11111111-1111-1111-1111-111111111111";
const R1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const R2 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";

test("only paths the app writes are accepted", () => {
  assert.ok(BALANCE_SHEET_PATH.test(`${U1}/${R1}.xlsx`));
  assert.ok(BALANCE_SHEET_PATH.test(`${U1}/${R1}.pdf`));
  for (const bad of [`${U1}/../${R1}.xlsx`, `${U1}/${R1}.exe`, `/${U1}/${R1}.csv`, `${U1}/sub/${R1}.csv`, `${R1}.csv`, "", `${U1}/${R1}.xlsx/extra`]) assert.equal(BALANCE_SHEET_PATH.test(bad), false, bad);
});

test("plans the files and the reports to remove", () => {
  const plan = planPurge([
    { reason: "expired", report_id: R1, file_path: `${U1}/${R1}.xlsx` },
    { reason: "orphan", report_id: null, file_path: `${U1}/${R2}.pdf` },
    { reason: "orphan", report_id: null, file_path: `${U1}/${R2}.pdf` }, // listed twice: removed once
    { reason: "orphan", report_id: null, file_path: "../../etc/passwd" },
    { reason: "expired", report_id: R2 },
    null,
  ]);
  assert.deepEqual(plan.paths, [`${U1}/${R1}.xlsx`, `${U1}/${R2}.pdf`]);
  assert.deepEqual(plan.reports, [{ id: R1, path: `${U1}/${R1}.xlsx` }]);
  assert.equal(plan.skipped, 3);
});

test("junk from the database plans nothing", () => {
  for (const junk of [null, undefined, "x", 3, {}]) assert.deepEqual(planPurge(junk), { paths: [], reports: [], skipped: 0 });
});

test("a report is kept when its file could not be removed", () => {
  const plan = planPurge([
    { reason: "expired", report_id: R1, file_path: `${U1}/${R1}.xlsx` },
    { reason: "expired", report_id: R2, file_path: `${U1}/${R2}.csv` },
  ]);
  assert.deepEqual(reportsToDelete(plan, new Set()), [R1, R2]);
  assert.deepEqual(reportsToDelete(plan, new Set([`${U1}/${R1}.xlsx`])), [R2]);
});

test("chunks", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 100), []);
  assert.deepEqual(chunk([1, 2], 0), [[1], [2]]);
});
