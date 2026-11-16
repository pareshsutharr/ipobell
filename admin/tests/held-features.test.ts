import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkPromotion, HELD_FEATURES, promotionError, promotionStatus, readSwitches, todayIST } from "../src/lib/held-features.ts";

test("switches are off unless a row says enabled: true", () => {
  assert.deepEqual(readSwitches(null), { data_score: false, promoted_ipos: false });
  assert.deepEqual(readSwitches([{ key: "data_score", enabled: "yes" }, { key: "x", enabled: true }, null]), { data_score: false, promoted_ipos: false });
  assert.deepEqual(readSwitches([{ key: "promoted_ipos", enabled: true }]), { data_score: false, promoted_ipos: true });
});

test("the panel lists exactly the switches the database has, and both are seeded off", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261116000200_data_score_and_promoted.sql", import.meta.url), "utf8");
  for (const f of HELD_FEATURES) assert.ok(sql.includes(`('${f.key}', false,`), f.key);
  assert.ok(sql.includes("check (key in ('data_score','promoted_ipos'))"));
  assert.equal(HELD_FEATURES.length, 2);
  for (const f of HELD_FEATURES) assert.match(f.before, /legal/i);
});

test("the app and the admin panel read the same switch keys", () => {
  const app = readFileSync(new URL("../../app/src/features/flags/switches.ts", import.meta.url), "utf8");
  for (const f of HELD_FEATURES) assert.ok(app.includes(`"${f.key}"`), f.key);
});

test("promotion checks", () => {
  const today = "2026-11-16";
  assert.equal(checkPromotion({ is_promoted: false, promoted_until: null }, today), null);
  assert.equal(checkPromotion({ is_promoted: true, promoted_until: null }, today), null);
  assert.equal(checkPromotion({ is_promoted: true, promoted_until: "2026-11-16" }, today), null);
  assert.match(checkPromotion({ is_promoted: true, promoted_until: "2026-11-15" }, today)!, /past/);
  assert.match(checkPromotion({ is_promoted: true, promoted_until: "16/11/2026" }, today)!, /valid date/);
  assert.match(checkPromotion({ is_promoted: true, promoted_until: "2026-13-40" }, today)!, /valid date/);
  assert.match(checkPromotion({ is_promoted: false, promoted_until: "2026-12-01" }, today)!, /Remove the end date/);
});

test("says in words whether the app shows it", () => {
  const today = "2026-11-16";
  const on = { is_promoted: true, promoted_until: null };
  assert.equal(promotionStatus({ is_promoted: false, promoted_until: null }, "open", true, today), "Not promoted.");
  assert.match(promotionStatus(on, "open", false, today), /switched off/);
  assert.match(promotionStatus(on, "listed", true, today), /no longer upcoming or open/);
  assert.match(promotionStatus({ is_promoted: true, promoted_until: "2026-11-01" }, "open", true, today), /end date has passed/);
  assert.match(promotionStatus(on, "upcoming", true, today), /Shown under the “Promoted” label.*until the IPO closes/);
  assert.match(promotionStatus({ is_promoted: true, promoted_until: "2026-11-20" }, "open", true, today), /until 2026-11-20/);
});

test("today in India and error wording", () => {
  assert.equal(todayIST(new Date("2026-11-16T19:00:00Z")), "2026-11-17");
  assert.equal(todayIST(new Date("2026-11-16T05:00:00Z")), "2026-11-16");
  assert.equal(promotionError("ONLY_SUPER_ADMIN_PROMOTES"), "Only a super admin can mark an IPO as promoted.");
  assert.match(promotionError("column ipo_admin_data.promoted_until does not exist"), /20261116000200/);
  assert.equal(promotionError("something else"), "something else");
});
