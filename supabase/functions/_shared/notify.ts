// Notification dispatch: eligibility (preferences + watchlist), grouping per user, FCM send, dedupe log.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { fcmConfigured, sendToTokens, type PushMessage } from "./fcm.ts";

export type NotificationType =
  | "new_ipo"
  | "opens_today"
  | "closes_today"
  | "closing_soon"
  | "allotment"
  | "allotment_tomorrow"
  | "refund"
  | "demat_credit"
  | "listing_today"
  | "listing_tomorrow"
  | "listed"
  | "subscription_milestone"
  | "gmp_change"
  | "allotment_result"
  | "generic";

/** Android notification channels (must match app/src/lib/notifications/channels.ts). */
export const CHANNEL_FOR_TYPE: Record<NotificationType, string> = {
  new_ipo: "new_ipo",
  opens_today: "reminders",
  closes_today: "reminders",
  closing_soon: "reminders",
  allotment: "allotment",
  allotment_tomorrow: "allotment",
  refund: "allotment",
  demat_credit: "allotment",
  allotment_result: "allotment",
  listing_today: "listing",
  listing_tomorrow: "listing",
  listed: "listing",
  subscription_milestone: "subscription",
  gmp_change: "gmp",
  generic: "default",
};

export interface NotificationItem {
  type: NotificationType;
  ipoId: string | null;
  slug: string | null;
  name?: string;
  dedupeKey: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface DispatchResult {
  sent: number;
  skippedDuplicate: number;
  recipients: number;
  success: number;
  failure: number;
  invalidTokensRemoved: number;
  details: { dedupeKey: string; status: "sent" | "skipped" | "failed"; recipients: number; error?: string }[];
}

interface Recipient {
  user_id: string;
  fcm_token: string;
  platform: string;
}

/**
 * Dispatch a batch of items of the same type. If a user is eligible for several items
 * (e.g. 3 IPOs open today) they receive ONE grouped notification.
 */
export async function dispatch(admin: SupabaseClient, items: NotificationItem[], opts: { group?: boolean; groupTitle?: (n: number) => string } = {}): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, skippedDuplicate: 0, recipients: 0, success: 0, failure: 0, invalidTokensRemoved: 0, details: [] };
  if (items.length === 0) return result;

  // 1. Claim dedupe keys. Rows that already exist are skipped (ignoreDuplicates → not returned).
  const { data: claimed, error: claimErr } = await admin
    .from("notification_log")
    .upsert(
      items.map((it) => ({
        ipo_id: it.ipoId,
        type: it.type,
        dedupe_key: it.dedupeKey,
        title: it.title,
        body: it.body,
        data: it.data ?? {},
        status: "pending",
      })),
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("dedupe_key");
  if (claimErr) throw new Error(`notification_log claim failed: ${claimErr.message}`);

  const claimedKeys = new Set((claimed ?? []).map((r) => r.dedupe_key as string));
  const fresh = items.filter((it) => claimedKeys.has(it.dedupeKey));
  result.skippedDuplicate = items.length - fresh.length;
  for (const it of items) {
    if (!claimedKeys.has(it.dedupeKey)) result.details.push({ dedupeKey: it.dedupeKey, status: "skipped", recipients: 0 });
  }
  if (fresh.length === 0) return result;

  if (!fcmConfigured()) {
    await markLogs(admin, fresh.map((f) => f.dedupeKey), { status: "failed", error: "FCM not configured" });
    for (const f of fresh) result.details.push({ dedupeKey: f.dedupeKey, status: "failed", recipients: 0, error: "FCM not configured" });
    return result;
  }

  // 2. Recipients per item
  const perToken = new Map<string, { recipient: Recipient; items: NotificationItem[] }>();
  const perItemCount = new Map<string, number>();
  for (const it of fresh) {
    const { data, error } = await admin.rpc("notification_recipients", { p_type: it.type, p_ipo_id: it.ipoId });
    if (error) throw new Error(`notification_recipients failed: ${error.message}`);
    const recipients = (data ?? []) as Recipient[];
    perItemCount.set(it.dedupeKey, recipients.length);
    for (const r of recipients) {
      const entry = perToken.get(r.fcm_token) ?? { recipient: r, items: [] };
      entry.items.push(it);
      perToken.set(r.fcm_token, entry);
    }
  }

  // 3. Build per-token messages, batched by identical payload
  const batches = new Map<string, { msg: PushMessage; tokens: string[] }>();
  for (const [token, { items: its }] of perToken) {
    const msg = buildMessage(its, opts);
    const key = JSON.stringify(msg);
    const b = batches.get(key) ?? { msg, tokens: [] };
    b.tokens.push(token);
    batches.set(key, b);
  }

  // 4. Send
  const invalid: string[] = [];
  for (const { msg, tokens } of batches.values()) {
    const outcomes = await sendToTokens(tokens, msg);
    for (const o of outcomes) {
      if (o.ok) result.success++;
      else {
        result.failure++;
        if (o.invalidToken) invalid.push(o.token);
      }
    }
  }
  result.recipients = perToken.size;

  // 5. Remove dead tokens
  if (invalid.length) {
    const { error } = await admin.from("device_tokens").delete().in("fcm_token", invalid);
    if (!error) result.invalidTokensRemoved = invalid.length;
  }

  // 6. Finalize logs
  for (const it of fresh) {
    const n = perItemCount.get(it.dedupeKey) ?? 0;
    await admin
      .from("notification_log")
      .update({ status: "sent", recipients_count: n, success_count: n ? result.success : 0, failure_count: n ? result.failure : 0, sent_at: new Date().toISOString() })
      .eq("dedupe_key", it.dedupeKey);
    result.sent++;
    result.details.push({ dedupeKey: it.dedupeKey, status: "sent", recipients: n });
  }
  return result;
}

function buildMessage(items: NotificationItem[], opts: { group?: boolean; groupTitle?: (n: number) => string }): PushMessage {
  const first = items[0];
  const channelId = CHANNEL_FOR_TYPE[first.type] ?? "default";
  if (items.length === 1 || opts.group === false) {
    return {
      title: first.title,
      body: first.body,
      channelId,
      imageUrl: first.imageUrl,
      data: {
        type: first.type,
        slug: first.slug ?? "",
        url: first.slug ? `beipoready://ipo/${first.slug}` : "beipoready://",
        ...(first.data ?? {}),
      },
    };
  }
  const names = items.map((i) => i.name ?? i.title).filter(Boolean);
  const title = opts.groupTitle ? opts.groupTitle(items.length) : `${items.length} IPO updates`;
  return {
    title,
    body: names.join(" · "),
    channelId,
    data: {
      type: first.type,
      slugs: items.map((i) => i.slug ?? "").filter(Boolean).join(","),
      url: groupUrl(first.type),
    },
  };
}

function groupUrl(type: NotificationType): string {
  switch (type) {
    case "opens_today":
    case "closes_today":
    case "closing_soon":
    case "subscription_milestone":
      return "beipoready://home/open";
    case "new_ipo":
      return "beipoready://home/upcoming";
    case "allotment":
    case "allotment_tomorrow":
    case "allotment_result":
    case "refund":
    case "demat_credit":
      return "beipoready://allotment";
    case "listing_today":
    case "listing_tomorrow":
    case "listed":
      return "beipoready://home/listed";
    default:
      return "beipoready://";
  }
}

async function markLogs(admin: SupabaseClient, keys: string[], patch: Record<string, unknown>) {
  await admin.from("notification_log").update(patch).in("dedupe_key", keys);
}


/**
 * Targeted push to ONE user (their own allotment result etc.). Respects the matching preference
 * column, dedupes via notification_log, removes dead tokens.
 */
export async function dispatchToUser(admin: SupabaseClient, userId: string, item: NotificationItem, prefColumn: keyof Omit<PrefRow, "user_id"> = "allotment"): Promise<{ sent: boolean; reason?: string }> {
  const { data: claimed, error: claimErr } = await admin
    .from("notification_log")
    .upsert({ ipo_id: item.ipoId, type: item.type, dedupe_key: item.dedupeKey, title: item.title, body: item.body, data: { ...(item.data ?? {}), user_id: userId }, status: "pending" }, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("dedupe_key");
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed?.length) return { sent: false, reason: "duplicate" };

  const { data: pref } = await admin.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
  if (pref && pref[prefColumn] === false) {
    await markLogs(admin, [item.dedupeKey], { status: "skipped", error: `preference ${String(prefColumn)} off` });
    return { sent: false, reason: "preference off" };
  }
  if (!fcmConfigured()) {
    await markLogs(admin, [item.dedupeKey], { status: "failed", error: "FCM not configured" });
    return { sent: false, reason: "FCM not configured" };
  }
  const { data: tokens } = await admin.from("device_tokens").select("fcm_token").eq("user_id", userId);
  const list = (tokens ?? []).map((t) => t.fcm_token as string);
  if (!list.length) {
    await markLogs(admin, [item.dedupeKey], { status: "skipped", error: "no device" });
    return { sent: false, reason: "no device" };
  }
  const outcomes = await sendToTokens(list, {
    title: item.title,
    body: item.body,
    channelId: CHANNEL_FOR_TYPE[item.type] ?? "default",
    imageUrl: item.imageUrl,
    data: { type: item.type, slug: item.slug ?? "", url: item.slug ? `beipoready://ipo/${item.slug}` : "beipoready://allotment", ...(item.data ?? {}) },
  });
  const ok = outcomes.filter((o) => o.ok).length;
  const invalid = outcomes.filter((o) => !o.ok && o.invalidToken).map((o) => o.token);
  if (invalid.length) await admin.from("device_tokens").delete().in("fcm_token", invalid);
  await admin.from("notification_log").update({ status: "sent", recipients_count: 1, success_count: ok, failure_count: outcomes.length - ok, sent_at: new Date().toISOString() }).eq("dedupe_key", item.dedupeKey);
  return { sent: ok > 0, reason: ok > 0 ? undefined : "delivery failed" };
}

interface PrefRow {
  user_id: string;
  new_ipo: boolean; opens_today: boolean; closes_today: boolean; closing_soon: boolean; allotment: boolean;
  refund_demat: boolean; listing: boolean; subscription_milestone: boolean; gmp_change: boolean; only_watchlist: boolean;
}
