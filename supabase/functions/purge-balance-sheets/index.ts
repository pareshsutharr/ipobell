// purge-balance-sheets — removes balance sheet files and reports after 90 days, and files no report points at.
//
// POST {}                → called by pg_cron every night (x-cron-secret)
// POST { "dry": true }   → returns what would be removed, removes nothing
//
// A report row is deleted only after its file is gone, so a failed file removal is retried the next night.
// Trusted callers only (x-cron-secret or service-role bearer).

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { BALANCE_SHEET_BUCKET, chunk, planPurge, reportsToDelete } from "../_shared/balance-sheets.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<{ dry?: boolean }>(req);
  const admin = adminClient();

  const { data, error: listErr } = await admin.rpc("balance_sheet_purge_list");
  if (listErr) return error(listErr.message, 500);
  const plan = planPurge(data);
  if (body.dry) return json({ ok: true, dry: true, files: plan.paths.length, reports: plan.reports.length, skipped: plan.skipped });

  const failed = new Set<string>();
  let filesRemoved = 0;
  for (const paths of chunk(plan.paths, 100)) {
    const { error: rmErr } = await admin.storage.from(BALANCE_SHEET_BUCKET).remove(paths);
    if (rmErr) paths.forEach((p) => failed.add(p));
    else filesRemoved += paths.length;
  }

  let reportsRemoved = 0;
  for (const ids of chunk(reportsToDelete(plan, failed), 100)) {
    const { error: delErr, count } = await admin.from("balance_sheet_reports").delete({ count: "exact" }).in("id", ids);
    if (!delErr) reportsRemoved += count ?? ids.length;
  }

  return json({ ok: failed.size === 0, files_removed: filesRemoved, files_failed: failed.size, reports_removed: reportsRemoved, skipped: plan.skipped });
});
