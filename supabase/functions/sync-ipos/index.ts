// sync-ipos — pulls IPO data from the Be IPO Ready mirror (beipoready.com/api/ipo-data) into
// Postgres and raises notification events. The mirror serves IPO Guru v2 payloads from the
// website's own sync, so this function never calls IPO Guru and has no request quota.
//
// POST body (all optional):
//   { "full": true }            → list with months=0 (daily backfill, keeps CMP of old listings fresh)
//   { "slugs": ["x-ipo"] }      → force detail/subscription refresh for specific slugs
//   { "budget": 100 }           → max mirror requests for this invocation (default 60, cap 200)
//   { "dryRun": true }          → detect events but don't send notifications
//
// Trusted callers only: pg_cron (x-cron-secret) or the service-role key.

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { config } from "../_shared/env.ts";
import { chunk, error, handleOptions, json, readJson } from "../_shared/http.ts";
import { IpoApiError, IpoDataClient } from "../_shared/ipo-data.ts";
import {
  type ApiAnchors,
  type ApiDetail,
  type ApiGmpHistory,
  type ApiListRow,
  type ApiLiveEntry,
  type ApiSubscription,
  addDays,
  detectEvents,
  gmpReadingToHistoryRow,
  type IpoEvent,
  istDate,
  mapAnchors,
  mapDetail,
  mapDocuments,
  mapFinancials,
  mapGmpHistoryRows,
  mapListRow,
  mapSubscriptionRows,
  mapSubscriptionSummary,
  type PrevIpoState,
} from "../_shared/mappers.ts";
import { dispatch, type NotificationItem } from "../_shared/notify.ts";

interface Body {
  full?: boolean;
  slugs?: string[];
  budget?: number;
  dryRun?: boolean;
  trigger?: string;
}

interface ExistingRow extends PrevIpoState {
  id: string;
  slug: string;
  close_date: string | null;
  detail_synced_at: string | null;
  subscription_synced_at: string | null;
  gmp_history_synced_at: string | null;
  anchors_synced_at: string | null;
  gmp_updated_at: string | null;
}

const HOURS = 60 * 60 * 1000;
const DEFAULT_BUDGET = 60;
const MAX_BUDGET = 200;

/** What a per-slug loop should do after a mirror error. */
type Outcome = "continue" | "skip" | "stop";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<Body>(req);
  const admin = adminClient();
  const startedAt = new Date();

  // Overlap guard: skip if another run started < 3 minutes ago and hasn't finished.
  const { data: running } = await admin
    .from("sync_runs")
    .select("id, started_at")
    .is("finished_at", null)
    .gte("started_at", new Date(startedAt.getTime() - 3 * 60 * 1000).toISOString())
    .limit(1);
  if (running && running.length && !body.slugs) {
    return json({ ok: true, skipped: "another sync is running", runId: running[0].id });
  }
  const { data: run } = await admin.from("sync_runs").insert({ started_at: startedAt.toISOString() }).select("id").single();
  const runId = run?.id as string | undefined;

  const api = new IpoDataClient({ budget: Math.min(body.budget ?? DEFAULT_BUDGET, MAX_BUDGET) });
  const events: IpoEvent[] = [];
  const stats = {
    ipos: 0,
    details: 0,
    subscriptions: 0,
    gmpHistory: 0,
    anchors: 0,
    notifications: 0,
    notFound: 0,
    liveUsed: false,
    stopped: null as string | null,
    errors: [] as string[],
  };
  const now = new Date();
  const nowIso = now.toISOString();
  const today = istDate(now);

  /**
   * Classify a mirror error inside a per-slug loop.
   * fatal (bad key) → rethrow and abort the run; transient (503 not_synced, 5xx, network, budget) → stop the
   * remaining per-slug work and let the next cron run retry; not_found → the mirror has no data yet, skip.
   */
  const onApiError = (e: unknown, label: string): Outcome => {
    if (e instanceof IpoApiError) {
      if (e.fatal) throw e;
      if (e.notFound) {
        stats.notFound++;
        return "skip";
      }
      if (e.transient || e.kind === "budget") {
        if (!stats.stopped) {
          stats.stopped = `${label}: ${e.message}`;
          stats.errors.push(`stopped early — ${label}: ${e.message}`);
        }
        return "stop";
      }
    }
    stats.errors.push(`${label}: ${String(e)}`);
    return "continue";
  };

  try {
    // ------------------------------------------------------------------
    // 1. List
    // ------------------------------------------------------------------
    const list = await api.get<ApiListRow[]>("ipos", { months: body.full ? 0 : 4 });
    const { data: existingRows, error: exErr } = await admin
      .from("ipos")
      .select("id, slug, status, open_date, close_date, gmp, gmp_percent, gmp_updated_at, listing_price, sub_total, sub_retail, sub_nii, sub_qib, detail_synced_at, subscription_synced_at, gmp_history_synced_at, anchors_synced_at");
    if (exErr) throw new Error(exErr.message);
    const existing = new Map<string, ExistingRow>((existingRows ?? []).map((r) => [r.slug as string, r as ExistingRow]));
    const firstRun = existing.size === 0;

    const mapped = list.map((row) => mapListRow(row, nowIso));
    for (const batch of chunk(mapped, 100)) {
      const { error: upErr } = await admin.from("ipos").upsert(batch, { onConflict: "slug" });
      if (upErr) throw new Error(`ipos upsert: ${upErr.message}`);
    }
    stats.ipos = mapped.length;

    // id map after upsert
    const { data: idRows } = await admin.from("ipos").select("id, slug").in("slug", mapped.map((m) => m.slug));
    const idBySlug = new Map<string, string>((idRows ?? []).map((r) => [r.slug as string, r.id as string]));

    // GMP history from live readings (one row per IST day, latest wins)
    const gmpRows = mapped
      .map((m) => {
        const id = idBySlug.get(m.slug);
        const prev = existing.get(m.slug);
        if (!id || !m.gmp_updated_at) return null;
        if (prev?.gmp_updated_at && new Date(prev.gmp_updated_at).getTime() >= new Date(m.gmp_updated_at).getTime()) return null;
        return gmpReadingToHistoryRow(id, m);
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    for (const batch of chunk(gmpRows, 200)) {
      const { error: gErr } = await admin.from("ipo_gmp_history").upsert(batch, { onConflict: "ipo_id,recorded_on" });
      if (gErr) stats.errors.push(`gmp history: ${gErr.message}`);
    }

    // Events from list diff (new IPO, listed, GMP change, total-subscription milestones)
    if (!firstRun) {
      for (const m of mapped) {
        const prev = existing.get(m.slug) ?? null;
        events.push(...detectEvents(prev, m, { gmpThresholdPct: config.gmpAlertThresholdPct, today }));
      }
    }

    // ------------------------------------------------------------------
    // 2. Decide which per-slug endpoints to hit (budget aware)
    // ------------------------------------------------------------------
    const forced = new Set(body.slugs ?? []);
    const active = mapped.filter((m) => m.status === "upcoming" || m.status === "open" || (m.status === "closed" && !m.is_listed));
    const open = mapped.filter((m) => m.status === "open" || (m.status === "closed" && m.close_date && m.close_date >= addDays(today, -1)));
    const recentlyListed = mapped.filter((m) => m.status === "listed" && m.listing_date && m.listing_date >= addDays(today, -14));

    const needsDetail = (m: typeof mapped[number]) => {
      if (forced.has(m.slug)) return true;
      const prev = existing.get(m.slug);
      if (!prev?.detail_synced_at) return true;
      const age = now.getTime() - new Date(prev.detail_synced_at).getTime();
      if (m.status === "listed") return age > 7 * 24 * HOURS;
      if (m.status === "upcoming") return age > 24 * HOURS;
      return age > 12 * HOURS; // open / closed: refund & demat dates, documents, BOA
    };
    const detailQueue = [...active, ...recentlyListed, ...mapped.filter((m) => m.status === "listed" && !existing.get(m.slug)?.detail_synced_at)]
      .filter((m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i)
      .filter(needsDetail)
      // open first, then upcoming by open date, then listed
      .sort((a, b) => rank(a.status) - rank(b.status) || (a.open_date ?? "").localeCompare(b.open_date ?? ""));

    const subscriptionQueue = open;
    const gmpHistoryQueue = active.filter((m) => {
      const prev = existing.get(m.slug);
      if (forced.has(m.slug) || !prev?.gmp_history_synced_at) return true;
      return now.getTime() - new Date(prev.gmp_history_synced_at).getTime() > 24 * HOURS;
    });
    const anchorsQueue = [...open, ...recentlyListed, ...mapped.filter((m) => m.status === "closed")].filter((m, i, arr) => arr.findIndex((x) => x.slug === m.slug) === i).filter((m) => {
      const prev = existing.get(m.slug);
      if (m.board === "sme" && !forced.has(m.slug)) return !prev?.anchors_synced_at && m.status !== "closed"; // SME anchors rarely published; try once
      if (!prev?.anchors_synced_at) return true;
      return forced.has(m.slug) || (m.status === "open" && now.getTime() - new Date(prev.anchors_synced_at).getTime() > 24 * HOURS);
    });

    // Reserve budget: subscriptions first (live data), then details, then history, then anchors.
    const budgetFor = (n: number) => Math.max(0, Math.min(n, api.budgetLeft));

    // ------------------------------------------------------------------
    // 3. Subscription (open IPOs) — category tree + milestone events
    //    One GET /live returns every open / just-closed IPO with its subscription payload;
    //    the per-slug endpoint is the fallback when /live is unavailable.
    // ------------------------------------------------------------------
    const liveSubs = new Map<string, ApiSubscription>();
    let liveOk = false;
    if (subscriptionQueue.length && !stats.stopped) {
      try {
        const live = await api.get<ApiLiveEntry[]>("live");
        for (const entry of live ?? []) {
          const slug = entry?.ipo?.slug;
          if (slug && entry.subscription) liveSubs.set(slug, entry.subscription);
        }
        liveOk = true;
        stats.liveUsed = true;
      } catch (e) {
        const outcome = onApiError(e, "live");
        // not_found / client error → fall back to per-slug calls below; transient → the loop below stops at once
        if (outcome === "skip") stats.errors.push("live: unavailable, falling back to per-slug subscription calls");
      }
    }

    const processSubscription = async (m: typeof mapped[number], id: string, sub: ApiSubscription) => {
      const rows = mapSubscriptionRows(id, sub, nowIso);
      if (rows.length) {
        const { error: sErr } = await admin.from("ipo_subscriptions").upsert(rows, { onConflict: "ipo_id,parent_key,category_key,snapshot_time", ignoreDuplicates: true });
        if (sErr) stats.errors.push(`subscriptions ${m.slug}: ${sErr.message}`);
      }
      const summary = mapSubscriptionSummary(sub.summary, nowIso);
      await admin.from("ipos").update(summary).eq("id", id);
      stats.subscriptions++;

      if (!firstRun && m.status === "open") {
        const prev = existing.get(m.slug) ?? null;
        const catEvents = detectEvents(prev, { ...m, sub_total: summary.sub_total, sub_retail: summary.sub_retail, sub_nii: summary.sub_nii, sub_qib: summary.sub_qib }, { gmpThresholdPct: 10_000, today })
          .filter((e) => e.type === "subscription_milestone");
        for (const e of catEvents) if (!events.some((x) => x.dedupeKey === e.dedupeKey)) events.push(e);
      }
    };

    for (const m of subscriptionQueue) {
      if (stats.stopped) break;
      const id = idBySlug.get(m.slug);
      if (!id) continue;
      let sub = liveSubs.get(m.slug) ?? null;
      if (!sub) {
        // /live succeeded but has nothing for this IPO → the mirror has no subscription data yet; the
        // per-slug call would 404 too. Only fall back to per-slug when /live itself was unavailable.
        if (liveOk && !forced.has(m.slug)) continue;
        if (api.budgetLeft <= 0) break;
        try {
          sub = await api.get<ApiSubscription>(`ipos/${m.slug}/subscription`);
        } catch (e) {
          const outcome = onApiError(e, `subscription ${m.slug}`);
          if (outcome === "stop") break;
          continue;
        }
      }
      try {
        await processSubscription(m, id, sub);
      } catch (e) {
        stats.errors.push(`subscription ${m.slug}: ${String(e)}`);
      }
    }

    // ------------------------------------------------------------------
    // 4. Detail documents
    // ------------------------------------------------------------------
    for (const m of detailQueue.slice(0, budgetFor(Math.min(detailQueue.length, body.full ? 60 : 30)))) {
      if (stats.stopped || api.budgetLeft <= 0) break;
      const id = idBySlug.get(m.slug);
      if (!id) continue;
      try {
        const d = await api.get<ApiDetail>(`ipos/${m.slug}`);
        const detail = mapDetail(d, nowIso);
        const { slug: _slug, ...cols } = detail;
        const { error: dErr } = await admin.from("ipos").update({ ...cols, raw_data: { list: m.raw_data.list, detail: d } }).eq("id", id);
        if (dErr) throw new Error(dErr.message);

        const fin = mapFinancials(id, d.company?.financials ?? null);
        if (fin.length) {
          const { error: fErr } = await admin.from("ipo_financials").upsert(fin, { onConflict: "ipo_id,period" });
          if (fErr) stats.errors.push(`financials ${m.slug}: ${fErr.message}`);
        }
        const docs = mapDocuments(id, d.documents);
        if (docs.length) {
          const { error: docErr } = await admin.from("ipo_documents").upsert(docs, { onConflict: "ipo_id,kind" });
          if (docErr) stats.errors.push(`documents ${m.slug}: ${docErr.message}`);
        }
        stats.details++;
      } catch (e) {
        // not_found: the mirror has not synced this detail yet; leave detail_synced_at null so the next run retries.
        if (onApiError(e, `detail ${m.slug}`) === "stop") break;
      }
    }

    // ------------------------------------------------------------------
    // 5. GMP history backfill (day-wise)
    // ------------------------------------------------------------------
    for (const m of gmpHistoryQueue.slice(0, budgetFor(Math.min(gmpHistoryQueue.length, 20)))) {
      if (stats.stopped || api.budgetLeft <= 0) break;
      const id = idBySlug.get(m.slug);
      if (!id) continue;
      try {
        const h = await api.get<ApiGmpHistory>(`ipos/${m.slug}/gmp/history`);
        const rows = mapGmpHistoryRows(id, h);
        if (rows.length) {
          const { error: hErr } = await admin.from("ipo_gmp_history").upsert(rows, { onConflict: "ipo_id,recorded_on" });
          if (hErr) stats.errors.push(`gmp history ${m.slug}: ${hErr.message}`);
        }
        await admin.from("ipos").update({ gmp_history_synced_at: nowIso }).eq("id", id);
        stats.gmpHistory++;
      } catch (e) {
        const outcome = onApiError(e, `gmp history ${m.slug}`);
        if (outcome === "stop") break;
        // no history yet → check again tomorrow instead of every run
        if (outcome === "skip") await admin.from("ipos").update({ gmp_history_synced_at: nowIso }).eq("id", id);
      }
    }

    // ------------------------------------------------------------------
    // 6. Anchor book
    // ------------------------------------------------------------------
    for (const m of anchorsQueue.slice(0, budgetFor(Math.min(anchorsQueue.length, 12)))) {
      if (stats.stopped || api.budgetLeft <= 0) break;
      const id = idBySlug.get(m.slug);
      if (!id) continue;
      try {
        const a = await api.get<ApiAnchors>(`ipos/${m.slug}/anchors`);
        const { rows, summary, document } = mapAnchors(id, a);
        if (rows.length) {
          await admin.from("ipo_anchors").delete().eq("ipo_id", id);
          const { error: aErr } = await admin.from("ipo_anchors").insert(rows);
          if (aErr) stats.errors.push(`anchors ${m.slug}: ${aErr.message}`);
          if (document) {
            await admin.from("ipo_documents").upsert({ ipo_id: id, kind: "anchor", title: "Anchor Investor Allocation", url: document }, { onConflict: "ipo_id,kind" });
          }
        }
        await admin.from("ipos").update({ ...summary, anchors_synced_at: nowIso }).eq("id", id);
        stats.anchors++;
      } catch (e) {
        const outcome = onApiError(e, `anchors ${m.slug}`);
        if (outcome === "stop") break;
        // no anchor book published (common for SME) → same cadence as a successful empty response
        if (outcome === "skip") await admin.from("ipos").update({ anchors_synced_at: nowIso }).eq("id", id);
      }
    }

    // ------------------------------------------------------------------
    // 7. Notifications
    // ------------------------------------------------------------------
    if (events.length && !body.dryRun) {
      const byType = new Map<string, NotificationItem[]>();
      for (const e of events) {
        const item: NotificationItem = {
          type: e.type,
          ipoId: idBySlug.get(e.slug) ?? null,
          slug: e.slug,
          name: mapped.find((m) => m.slug === e.slug)?.name,
          dedupeKey: e.dedupeKey,
          title: e.title,
          body: e.body,
          data: e.data,
          imageUrl: mapped.find((m) => m.slug === e.slug)?.logo_url ?? undefined,
        };
        byType.set(e.type, [...(byType.get(e.type) ?? []), item]);
      }
      for (const [type, items] of byType) {
        try {
          const r = await dispatch(admin, items, {
            group: type === "new_ipo",
            groupTitle: (n) => `${n} new IPOs announced`,
          });
          stats.notifications += r.sent;
        } catch (e) {
          stats.errors.push(`notify ${type}: ${String(e)}`);
        }
      }
    }

    const summary = {
      ok: true,
      runId,
      trigger: body.trigger ?? "manual",
      source: config.ipoApiBaseUrl,
      apiCalls: api.calls,
      ...stats,
      events: events.map((e) => ({ type: e.type, slug: e.slug, key: e.dedupeKey })),
      durationMs: Date.now() - startedAt.getTime(),
    };
    if (runId) {
      await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: stats.errors.length === 0, api_calls: api.calls, ipos_upserted: stats.ipos, events: summary.events, error: stats.errors.length ? stats.errors.join("\n").slice(0, 4000) : null }).eq("id", runId);
    }
    return json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("sync-ipos failed", message);
    if (runId) {
      await admin.from("sync_runs").update({ finished_at: new Date().toISOString(), ok: false, api_calls: api.calls, error: [message, ...stats.errors].join("\n").slice(0, 4000) }).eq("id", runId);
    }
    return error(message, 500, { apiCalls: api.calls, ...stats });
  }
});

function rank(status: string): number {
  switch (status) {
    case "open":
      return 0;
    case "closed":
      return 1;
    case "upcoming":
      return 2;
    default:
      return 3;
  }
}
