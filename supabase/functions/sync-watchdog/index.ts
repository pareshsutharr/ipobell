// sync-watchdog — e-mails staff when the IPO data sync keeps failing or has gone quiet, and again when it recovers.
//
// POST {}                 → called by pg_cron every 30 minutes (x-cron-secret)
// POST { "dry": true }    → returns the assessment, sends nothing, changes nothing
// POST { "test": true }   → sends a sample alert to the recipients
//
// Recipients: public.app_settings['sync_alerts'] = { enabled, emails[] }, else LEAD_NOTIFY_DEFAULT_EMAIL.
// State (so the same outage is not mailed every 30 minutes): public.app_settings['sync_watchdog_state'].
// Trusted callers only (x-cron-secret or service-role bearer).

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { envOptional } from "../_shared/env.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { sendMail } from "../_shared/mail.ts";
import { assessSync, renderWatchdogMail, type SyncRun, type WatchdogState } from "../_shared/watchdog.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HISTORY_HOURS = 12;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<{ dry?: boolean; test?: boolean }>(req);
  const admin = adminClient();
  const now = new Date();
  const panelUrl = (envOptional("ADMIN_PANEL_URL") ?? "https://beipoready-admin.vercel.app").replace(/\/+$/, "");

  const { data: settings } = await admin.from("app_settings").select("key, value").in("key", ["sync_alerts", "sync_watchdog_state"]);
  const byKey = new Map((settings ?? []).map((s) => [s.key as string, s.value as Record<string, unknown>]));
  const alerts = (byKey.get("sync_alerts") ?? {}) as { enabled?: boolean; emails?: unknown };
  const saved = Array.isArray(alerts.emails) ? alerts.emails.filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e)) : [];
  const fallback = envOptional("LEAD_NOTIFY_DEFAULT_EMAIL");
  const emails = saved.length ? saved : fallback ? [fallback] : [];
  const enabled = alerts.enabled !== false;

  if (body.test) {
    if (!emails.length) return error("No recipients: set app_settings.sync_alerts.emails or LEAD_NOTIFY_DEFAULT_EMAIL", 400);
    const sample = assessSync([{ started_at: new Date(now.getTime() - 5 * 60_000).toISOString(), finished_at: now.toISOString(), ok: false, error: "Sample error: this is a test of the sync alert e-mail." }], now, null);
    const m = renderWatchdogMail({ ...sample, action: "alert" }, now, panelUrl);
    try {
      await sendMail(emails, `[Test] ${m.subject}`, m.html, m.text);
      return json({ ok: true, to: emails });
    } catch (e) {
      return error(`SMTP failed: ${e instanceof Error ? e.message : String(e)}`, 502);
    }
  }

  const since = new Date(now.getTime() - HISTORY_HOURS * 3_600_000).toISOString();
  const { data: runs, error: runsErr } = await admin.from("sync_runs").select("started_at, finished_at, ok, error").gte("started_at", since).order("started_at", { ascending: false }).limit(200);
  if (runsErr) return error(runsErr.message, 500);

  const state = (byKey.get("sync_watchdog_state") ?? null) as WatchdogState | null;
  const a = assessSync((runs ?? []) as SyncRun[], now, state);
  const summary = { healthy: a.healthy, action: a.action, reasons: a.reasons, lastSuccessAt: a.lastSuccessAt, consecutiveFailures: a.consecutiveFailures, marketTime: a.marketTime };
  if (body.dry || a.action === "none") return json({ ok: true, ...summary, sent: false });

  let sent = false;
  let mailError: string | null = null;
  if (enabled && emails.length) {
    const m = renderWatchdogMail(a, now, panelUrl);
    try {
      await sendMail(emails, m.subject, m.html, m.text);
      sent = true;
    } catch (e) {
      mailError = e instanceof Error ? e.message : String(e);
    }
  }
  // Only remember the alert once a mail really went out (or alerts are switched off), so a broken SMTP is retried next run.
  if (sent || !enabled || !emails.length) {
    await admin.from("app_settings").upsert({ key: "sync_watchdog_state", value: a.nextState, description: "Internal: whether a sync alert is currently open. Written by the sync-watchdog function." }, { onConflict: "key" });
  }
  if (mailError) return error(`SMTP failed: ${mailError}`, 502, summary);
  return json({ ok: true, ...summary, sent, to: sent ? emails : [] });
});
