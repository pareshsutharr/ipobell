// Sync watchdog — decides whether the IPO data sync is healthy and whether staff should be e-mailed.
// Pure functions only (no Deno / network), so they are unit-tested with `node --test`.
//
// Unhealthy when either:
//   - the last FAILURE_STREAK finished runs all failed (a run still unfinished after STUCK_MINUTES counts as failed), or
//   - there has been no successful run for 2 hours in market time (08:30–18:30 IST) or 4 hours otherwise.
// One e-mail when it turns unhealthy, a reminder every REMIND_HOURS while it stays that way, one when it recovers.

export interface SyncRun {
  started_at: string;
  finished_at: string | null;
  ok: boolean | null;
  error: string | null;
}

export interface WatchdogState {
  alerting: boolean;
  last_alert_at: string | null;
}

export type WatchdogAction = "alert" | "recover" | "none";

export interface Assessment {
  healthy: boolean;
  action: WatchdogAction;
  reasons: string[];
  marketTime: boolean;
  lastSuccessAt: string | null;
  minutesSinceSuccess: number | null;
  consecutiveFailures: number;
  lastError: string | null;
  nextState: WatchdogState;
}

export const FAILURE_STREAK = 3;
export const STUCK_MINUTES = 10;
export const STALE_MINUTES_MARKET = 120;
export const STALE_MINUTES_OFF = 240;
export const REMIND_HOURS = 6;

const IST_OFFSET_MIN = 330;

/** 08:30–18:30 IST, when the sync runs every 15 minutes. */
export function isMarketTime(now: Date): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 8 * 60 + 30 && minutes < 18 * 60 + 30;
}

function failed(run: SyncRun, now: Date): boolean | null {
  if (run.finished_at) return run.ok !== true;
  const age = (now.getTime() - new Date(run.started_at).getTime()) / 60_000;
  return age >= STUCK_MINUTES ? true : null; // null = still running, ignore
}

export function assessSync(runs: SyncRun[], now: Date, state: WatchdogState | null | undefined): Assessment {
  const prev: WatchdogState = { alerting: Boolean(state?.alerting), last_alert_at: state?.last_alert_at ?? null };
  const sorted = [...runs].sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  let consecutiveFailures = 0;
  let lastError: string | null = null;
  for (const run of sorted) {
    const f = failed(run, now);
    if (f === null) continue;
    if (!f) break;
    consecutiveFailures++;
    if (lastError === null) lastError = run.error?.trim() || (run.finished_at ? "The run finished with errors." : `The run did not finish within ${STUCK_MINUTES} minutes.`);
  }

  const lastSuccess = sorted.find((r) => r.finished_at && r.ok === true) ?? null;
  const lastSuccessAt = lastSuccess?.finished_at ?? null;
  const minutesSinceSuccess = lastSuccessAt ? Math.max(0, Math.round((now.getTime() - new Date(lastSuccessAt).getTime()) / 60_000)) : null;

  const marketTime = isMarketTime(now);
  const staleAfter = marketTime ? STALE_MINUTES_MARKET : STALE_MINUTES_OFF;
  const reasons: string[] = [];
  if (consecutiveFailures >= FAILURE_STREAK) reasons.push(`The last ${consecutiveFailures} sync runs failed.`);
  if (minutesSinceSuccess === null) reasons.push("No successful sync was found in the recent run history.");
  else if (minutesSinceSuccess >= staleAfter) reasons.push(`No successful sync for ${formatMinutes(minutesSinceSuccess)} (limit ${formatMinutes(staleAfter)} ${marketTime ? "in market time" : "outside market time"}).`);

  const healthy = reasons.length === 0;
  let action: WatchdogAction = "none";
  let nextState = prev;
  if (!healthy) {
    const sinceAlertH = prev.last_alert_at ? (now.getTime() - new Date(prev.last_alert_at).getTime()) / 3_600_000 : Infinity;
    if (!prev.alerting || sinceAlertH >= REMIND_HOURS) {
      action = "alert";
      nextState = { alerting: true, last_alert_at: now.toISOString() };
    }
  } else if (prev.alerting) {
    action = "recover";
    nextState = { alerting: false, last_alert_at: null };
  }

  return { healthy, action, reasons, marketTime, lastSuccessAt, minutesSinceSuccess, consecutiveFailures, lastError, nextState };
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

/** E-mail for an alert or a recovery. Every value from the database is escaped. */
export function renderWatchdogMail(a: Assessment, now: Date, panelUrl: string): { subject: string; html: string; text: string } {
  const recovered = a.action === "recover";
  const subject = recovered ? "IPO data sync is working again" : "IPO data sync is failing: the app may show old data";
  const lines: [string, string][] = [
    ["Checked at", istTime(now.toISOString())],
    ["Last successful sync", a.lastSuccessAt ? `${istTime(a.lastSuccessAt)} (${formatMinutes(a.minutesSinceSuccess ?? 0)} ago)` : "none found"],
    ["Failed runs in a row", String(a.consecutiveFailures)],
  ];
  if (!recovered && a.lastError) lines.push(["Last error", a.lastError.slice(0, 600)]);
  const intro = recovered
    ? "The IPO data sync has completed successfully again. No action is needed."
    : "The app's IPO list, GMP and subscription numbers are not being refreshed. Users keep seeing the last data that was synced.";
  const what = recovered ? [] : a.reasons;
  const next = recovered
    ? []
    : [
        "If the error mentions IPO_API_KEY or 401/403: the data mirror key was changed or revoked. Set the new key in Supabase → Edge Functions → Secrets.",
        "If the error mentions 503, not_synced or a timeout: the beipoready.com data mirror is down or slow. Check the website.",
        "Otherwise: open Supabase → Edge Functions → sync-ipos → Logs.",
      ];

  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:7px 10px;border-bottom:1px solid #ECE9E2;color:#6B7280;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 10px;border-bottom:1px solid #ECE9E2;color:#1A1F2B;font-size:13px">${esc(v)}</td></tr>`;
  const list = (items: string[]) => (items.length ? `<ul style="margin:6px 0 0;padding-left:20px;font-size:13px;color:#1A1F2B">${items.map((i) => `<li style="margin:4px 0">${esc(i)}</li>`).join("")}</ul>` : "");
  const html = `<!doctype html><html><body style="margin:0;background:#FBFAF7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
  <div style="background:${recovered ? "#1F6F4A" : "#8A1F1F"};border-radius:14px 14px 0 0;padding:18px 22px">
    <div style="color:#fff;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;opacity:.8">Be IPO Ready · data sync</div>
    <div style="color:#fff;font-size:20px;font-weight:600;margin-top:6px">${esc(subject)}</div>
  </div>
  <div style="background:#fff;border:1px solid #ECE9E2;border-top:0;border-radius:0 0 14px 14px;padding:14px 12px 16px">
    <div style="padding:0 10px 8px;font-size:14px;color:#1A1F2B">${esc(intro)}</div>
    ${what.length ? `<div style="padding:6px 10px">${list(what)}</div>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:8px">${lines.map(row).join("")}</table>
    ${next.length ? `<div style="padding:14px 10px 0;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700">What to check</div><div style="padding:0 10px">${list(next)}</div>` : ""}
    <div style="padding:16px 10px 4px"><a href="${esc(panelUrl)}" style="display:inline-block;background:#0F2D52;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:8px">Open the admin panel</a></div>
  </div>
  <div style="color:#9AA1AE;font-size:11px;padding:12px 6px">Sent automatically by the sync watchdog. A reminder follows every ${REMIND_HOURS} hours while the problem lasts.</div>
</div></body></html>`;

  const text = [subject, "", intro, ...what.map((w) => `- ${w}`), "", ...lines.map(([k, v]) => `${k}: ${v}`), ...(next.length ? ["", "What to check:", ...next.map((n) => `- ${n}`)] : []), "", panelUrl].join("\n");
  return { subject, html, text };
}
