// check-allotments — queries registrars for saved applications and pushes results.
//
// Cron / admin (x-cron-secret):  POST {}                       → process all due applications (batch)
//                                POST { probe: {driver, ipo_name, pan} } → dry-run a driver (no DB writes)
// App (user JWT):                POST { application_id }       → check one of the caller's applications now
//
// Results: allotted / not_allotted → stored + pushed to the applicant (type allotment_result).
//          not_found → retried every 40 min; error → every 30 min; manual → user is pointed to the registrar page.

import { adminClient, AuthError, isTrustedCaller, requireUser } from "../_shared/auth.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { istDate } from "../_shared/mappers.ts";
import { dispatchToUser, type NotificationItem } from "../_shared/notify.ts";
import { type AllotmentResult, AUTO_DRIVERS, checkAllotment, manualUrlFor, type RegistrarInfo } from "../_shared/registrars.ts";

interface DueRow {
  application_id: string;
  user_id: string;
  ipo_id: string;
  slug: string;
  ipo_name: string;
  registrar: RegistrarInfo | null;
  allotment_date: string | null;
  listing_date: string | null;
  pan: string;
  application_no: string | null;
  status: string;
  check_count: number;
  registrar_driver: string | null;
}

const RETRY_NOT_FOUND_MIN = 40;
const RETRY_ERROR_MIN = 30;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);
  const body = await readJson<{ application_id?: string; probe?: { driver: string; ipo_name: string; pan: string }; limit?: number }>(req);
  const admin = adminClient();

  // ------------------------------------------------------------------ trusted: probe / batch
  if (isTrustedCaller(req)) {
    if (body.probe) {
      const r = await checkAllotment(body.probe.driver, body.probe.ipo_name, body.probe.pan, null);
      return json({ ok: true, probe: r });
    }
    const { data, error: dErr } = await admin.rpc("due_applications", { p_limit: body.limit ?? 50 });
    if (dErr) return error(dErr.message, 500);
    const rows = (data ?? []) as DueRow[];
    const summary = { processed: 0, allotted: 0, not_allotted: 0, not_found: 0, manual: 0, errors: 0, pushed: 0 };
    for (const row of rows) {
      const r = await processRow(admin, row);
      summary.processed++;
      if (r.status === "allotted") summary.allotted++;
      else if (r.status === "not_allotted") summary.not_allotted++;
      else if (r.status === "not_found") summary.not_found++;
      else if (r.status === "manual") summary.manual++;
      else summary.errors++;
      if (r.pushed) summary.pushed++;
    }
    return json({ ok: true, ...summary });
  }

  // ------------------------------------------------------------------ user: check one now
  let user: { id: string };
  try {
    user = await requireUser(req);
  } catch (e) {
    return error(e instanceof AuthError ? e.message : "Unauthorized", 401);
  }
  if (!body.application_id) return error("application_id is required", 400);

  const { data: app, error: aErr } = await admin
    .from("ipo_applications")
    .select("id, user_id, ipo_id, pan_id, application_no, status, check_count, ipos!inner(slug, name, registrar, allotment_date, listing_date), user_pans!inner(pan_encrypted)")
    .eq("id", body.application_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (aErr) return error(aErr.message, 500);
  if (!app) return error("Application not found", 404);

  const { data: pan, error: pErr } = await admin.rpc("decrypt_pan_admin", { p_application_id: app.id });
  if (pErr || !pan) return error(pErr?.message ?? "Could not read PAN", 500);

  // deno-lint-ignore no-explicit-any
  const ipo = (app as any).ipos as { slug: string; name: string; registrar: RegistrarInfo | null; allotment_date: string | null; listing_date: string | null };
  const row: DueRow = {
    application_id: app.id as string,
    user_id: user.id,
    ipo_id: app.ipo_id as string,
    slug: ipo.slug,
    ipo_name: ipo.name,
    registrar: ipo.registrar,
    allotment_date: ipo.allotment_date,
    listing_date: ipo.listing_date,
    pan: pan as string,
    application_no: app.application_no as string | null,
    status: app.status as string,
    check_count: app.check_count as number,
    registrar_driver: ipo.registrar?.driver ?? null,
  };
  const r = await processRow(admin, row, { manualCheck: true });
  return json({
    ok: r.status === "allotted" || r.status === "not_allotted" || r.status === "not_found",
    status: r.status,
    shares_allotted: r.sharesAllotted,
    shares_applied: r.sharesApplied,
    message: r.message,
    manual_url: r.manualUrl ?? manualUrlFor(row.registrar),
    registrar: row.registrar?.name ?? null,
    auto_supported: AUTO_DRIVERS.has((row.registrar_driver ?? "").toLowerCase()),
  });
});

async function processRow(admin: ReturnType<typeof adminClient>, row: DueRow, opts: { manualCheck?: boolean } = {}): Promise<AllotmentResult & { pushed?: boolean }> {
  const today = istDate();
  const now = new Date();
  const beforeAllotment = row.allotment_date ? today < row.allotment_date : false;

  let result: AllotmentResult;
  if (beforeAllotment && !opts.manualCheck) {
    // cron ran early (clock drift) — just push the check forward
    await admin.from("ipo_applications").update({ next_check_at: `${row.allotment_date}T04:30:00Z` }).eq("id", row.application_id);
    return { status: "not_found", sharesAllotted: null, sharesApplied: null, amountRefunded: null, category: null, applicationNo: null, message: "Allotment date not reached" };
  }
  result = await checkAllotment(row.registrar_driver, row.ipo_name, row.pan, row.registrar);

  const patch: Record<string, unknown> = {
    status: result.status,
    check_count: row.check_count + 1,
    last_checked_at: now.toISOString(),
    last_error: result.status === "error" ? result.message : null,
    registrar: row.registrar_driver,
    result_raw: result.raw ? { ...(typeof result.raw === "object" ? { data: result.raw } : { data: String(result.raw) }), message: result.message } : null,
  };
  if (result.status === "allotted" || result.status === "not_allotted") {
    Object.assign(patch, {
      shares_allotted: result.sharesAllotted,
      shares_applied: result.sharesApplied,
      amount_refunded: result.amountRefunded,
      category: result.category,
      application_no: result.applicationNo ?? row.application_no,
      next_check_at: null,
    });
  } else if (result.status === "not_found") {
    patch.next_check_at = new Date(now.getTime() + RETRY_NOT_FOUND_MIN * 60_000).toISOString();
  } else if (result.status === "error") {
    patch.next_check_at = new Date(now.getTime() + RETRY_ERROR_MIN * 60_000).toISOString();
  } else if (result.status === "manual") {
    patch.next_check_at = null;
  }
  await admin.from("ipo_applications").update(patch).eq("id", row.application_id);

  let pushed = false;
  if (result.status === "allotted" || result.status === "not_allotted") {
    const label = await panLabel(admin, row.application_id);
    const item: NotificationItem = {
      type: "allotment_result",
      ipoId: row.ipo_id,
      slug: row.slug,
      name: row.ipo_name,
      dedupeKey: `allotment_result:${row.application_id}`,
      title: result.status === "allotted" ? `🎉 Allotted: ${row.ipo_name}` : `Not allotted: ${row.ipo_name}`,
      body:
        result.status === "allotted"
          ? `${label ? label + " — " : ""}${result.sharesAllotted} shares allotted${result.sharesApplied ? ` of ${result.sharesApplied} applied` : ""}. Shares credit to demat before listing.`
          : `${label ? label + " — " : ""}no allotment this time. Refund/unblock is usually within 1–2 working days.`,
      data: { application_id: row.application_id, result: result.status },
    };
    const r = await dispatchToUser(admin, row.user_id, item, "allotment");
    pushed = r.sent;
    if (pushed) await admin.from("ipo_applications").update({ notified_at: now.toISOString() }).eq("id", row.application_id);
  } else if (result.status === "manual" && !opts.manualCheck) {
    // one-time nudge on allotment day for registrars we can't query
    const label = await panLabel(admin, row.application_id);
    await dispatchToUser(admin, row.user_id, {
      type: "allotment_result",
      ipoId: row.ipo_id,
      slug: row.slug,
      name: row.ipo_name,
      dedupeKey: `allotment_manual:${row.application_id}`,
      title: `Check your ${row.ipo_name} allotment`,
      body: `${label ? label + ": " : ""}${row.registrar?.name ?? "the registrar"} needs a manual check. Tap to open it with your PAN copied.`,
      data: { application_id: row.application_id, manual_url: result.manualUrl ?? "" },
    }, "allotment");
  }
  return { ...result, pushed };
}

async function panLabel(admin: ReturnType<typeof adminClient>, applicationId: string): Promise<string | null> {
  const { data } = await admin.from("ipo_applications").select("user_pans(label, pan_last4)").eq("id", applicationId).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const p = (data as any)?.user_pans as { label: string; pan_last4: string } | null;
  return p ? `${p.label} (••${p.pan_last4})` : null;
}
