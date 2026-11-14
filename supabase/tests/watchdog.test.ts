// Unit tests for the sync watchdog decision logic. Run: node --test supabase/tests/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { assessSync, formatMinutes, isMarketTime, renderWatchdogMail, type SyncRun } from "../functions/_shared/watchdog.ts";

// 12:00 IST on a weekday = 06:30 UTC (market time). 23:00 IST = 17:30 UTC (off hours).
const NOON_IST = new Date("2026-11-16T06:30:00Z");
const NIGHT_IST = new Date("2026-11-16T17:30:00Z");

function run(now: Date, minutesAgo: number, ok: boolean | null, opts: { error?: string; unfinished?: boolean } = {}): SyncRun {
  const started = new Date(now.getTime() - minutesAgo * 60_000);
  return {
    started_at: started.toISOString(),
    finished_at: opts.unfinished ? null : new Date(started.getTime() + 30_000).toISOString(),
    ok: opts.unfinished ? null : ok,
    error: opts.error ?? null,
  };
}

test("market time is 08:30 to 18:30 IST", () => {
  assert.equal(isMarketTime(new Date("2026-11-16T02:59:00Z")), false); // 08:29 IST
  assert.equal(isMarketTime(new Date("2026-11-16T03:00:00Z")), true); // 08:30 IST
  assert.equal(isMarketTime(new Date("2026-11-16T12:59:00Z")), true); // 18:29 IST
  assert.equal(isMarketTime(new Date("2026-11-16T13:00:00Z")), false); // 18:30 IST
  assert.equal(isMarketTime(new Date("2026-11-16T20:00:00Z")), false); // 01:30 IST next day
});

test("healthy: recent successes, nothing to send", () => {
  const a = assessSync([run(NOON_IST, 5, true), run(NOON_IST, 20, true), run(NOON_IST, 35, true)], NOON_IST, null);
  assert.equal(a.healthy, true);
  assert.equal(a.action, "none");
  assert.deepEqual(a.reasons, []);
  assert.equal(a.consecutiveFailures, 0);
});

test("one or two failures after a success are tolerated", () => {
  const a = assessSync([run(NOON_IST, 5, false, { error: "503 not_synced" }), run(NOON_IST, 20, false), run(NOON_IST, 35, true)], NOON_IST, null);
  assert.equal(a.healthy, true);
  assert.equal(a.consecutiveFailures, 2);
  assert.equal(a.action, "none");
});

test("three failures in a row raise an alert with the newest error", () => {
  const runs = [run(NOON_IST, 5, false, { error: "401 invalid_key: check IPO_API_KEY" }), run(NOON_IST, 20, false, { error: "older error" }), run(NOON_IST, 35, false), run(NOON_IST, 50, true)];
  const a = assessSync(runs, NOON_IST, null);
  assert.equal(a.healthy, false);
  assert.equal(a.action, "alert");
  assert.equal(a.consecutiveFailures, 3);
  assert.equal(a.lastError, "401 invalid_key: check IPO_API_KEY");
  assert.match(a.reasons[0], /last 3 sync runs failed/);
  assert.deepEqual(a.nextState, { alerting: true, last_alert_at: NOON_IST.toISOString() });
});

test("run order in the input does not matter", () => {
  const runs = [run(NOON_IST, 50, true), run(NOON_IST, 35, false), run(NOON_IST, 5, false, { error: "newest" }), run(NOON_IST, 20, false)];
  const a = assessSync(runs, NOON_IST, null);
  assert.equal(a.consecutiveFailures, 3);
  assert.equal(a.lastError, "newest");
});

test("no successful run for 2 hours in market time alerts; 1 h 59 min does not", () => {
  const stale = assessSync([run(NOON_IST, 121, true)], NOON_IST, null);
  assert.equal(stale.healthy, false);
  assert.match(stale.reasons[0], /No successful sync for 2 h/);
  const fresh = assessSync([run(NOON_IST, 118, true)], NOON_IST, null);
  assert.equal(fresh.healthy, true);
});

test("outside market time the limit is 4 hours", () => {
  assert.equal(assessSync([run(NIGHT_IST, 180, true)], NIGHT_IST, null).healthy, true);
  const a = assessSync([run(NIGHT_IST, 245, true)], NIGHT_IST, null);
  assert.equal(a.healthy, false);
  assert.match(a.reasons[0], /outside market time/);
});

test("empty history is unhealthy", () => {
  const a = assessSync([], NOON_IST, null);
  assert.equal(a.healthy, false);
  assert.equal(a.action, "alert");
  assert.equal(a.lastSuccessAt, null);
  assert.match(a.reasons[0], /No successful sync was found/);
});

test("a run still going for under 10 minutes is ignored; a stuck one counts as failed", () => {
  const running = assessSync([run(NOON_IST, 2, null, { unfinished: true }), run(NOON_IST, 17, true)], NOON_IST, null);
  assert.equal(running.healthy, true);
  assert.equal(running.consecutiveFailures, 0);

  const stuck = assessSync([run(NOON_IST, 12, null, { unfinished: true }), run(NOON_IST, 27, null, { unfinished: true }), run(NOON_IST, 42, null, { unfinished: true }), run(NOON_IST, 57, true)], NOON_IST, null);
  assert.equal(stuck.consecutiveFailures, 3);
  assert.equal(stuck.healthy, false);
  assert.match(stuck.lastError ?? "", /did not finish within 10 minutes/);
});

test("an open alert is not repeated until 6 hours have passed", () => {
  const runs = [run(NOON_IST, 5, false), run(NOON_IST, 20, false), run(NOON_IST, 35, false)];
  const oneHourAgo = new Date(NOON_IST.getTime() - 3_600_000).toISOString();
  const quiet = assessSync(runs, NOON_IST, { alerting: true, last_alert_at: oneHourAgo });
  assert.equal(quiet.healthy, false);
  assert.equal(quiet.action, "none");
  assert.deepEqual(quiet.nextState, { alerting: true, last_alert_at: oneHourAgo });

  const sixHoursAgo = new Date(NOON_IST.getTime() - 6 * 3_600_000).toISOString();
  const reminder = assessSync(runs, NOON_IST, { alerting: true, last_alert_at: sixHoursAgo });
  assert.equal(reminder.action, "alert");
  assert.equal(reminder.nextState.last_alert_at, NOON_IST.toISOString());
});

test("recovery is announced once and clears the state", () => {
  const runs = [run(NOON_IST, 5, true), run(NOON_IST, 20, false), run(NOON_IST, 35, false)];
  const a = assessSync(runs, NOON_IST, { alerting: true, last_alert_at: new Date(NOON_IST.getTime() - 3_600_000).toISOString() });
  assert.equal(a.healthy, true);
  assert.equal(a.action, "recover");
  assert.deepEqual(a.nextState, { alerting: false, last_alert_at: null });
  const again = assessSync(runs, NOON_IST, a.nextState);
  assert.equal(again.action, "none");
});

test("a malformed saved state is treated as 'no alert open'", () => {
  const runs = [run(NOON_IST, 5, false), run(NOON_IST, 20, false), run(NOON_IST, 35, false)];
  const a = assessSync(runs, NOON_IST, {} as never);
  assert.equal(a.action, "alert");
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(135), "2 h 15 min");
});

test("alert mail escapes database text and names the cause", () => {
  const runs = [run(NOON_IST, 5, false, { error: `<script>alert("x")</script> 401 invalid_key` }), run(NOON_IST, 20, false), run(NOON_IST, 35, false)];
  const a = assessSync(runs, NOON_IST, null);
  const m = renderWatchdogMail(a, NOON_IST, "https://admin.example");
  assert.match(m.subject, /failing/);
  assert.ok(!m.html.includes("<script>"), "raw HTML from the error column must not reach the mail");
  assert.ok(m.html.includes("&lt;script&gt;"));
  assert.ok(m.text.includes("Last error:"));
  assert.ok(m.text.includes("https://admin.example"));
  assert.ok(!/\r/.test(m.subject) && !/\n/.test(m.subject));
});

test("recovery mail has no error or checklist", () => {
  const a = assessSync([run(NOON_IST, 5, true)], NOON_IST, { alerting: true, last_alert_at: NOON_IST.toISOString() });
  const m = renderWatchdogMail(a, NOON_IST, "https://admin.example");
  assert.match(m.subject, /working again/);
  assert.ok(!m.text.includes("What to check"));
  assert.ok(!m.text.includes("Last error"));
});
