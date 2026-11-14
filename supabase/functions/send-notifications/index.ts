// send-notifications — HTTP entry point to the shared dispatcher.
//
// POST { type, ipo_id?, slug?, title, body, data?, dedupe_key? }
// or   POST { items: [{ type, slug, title, body, data, dedupe_key }] }
//
// Respects notification_preferences + only_watchlist, batches tokens, sends via FCM HTTP v1,
// deletes invalid tokens and records notification_log (dedupe_key unique → never sent twice).
// Trusted callers only (x-cron-secret or service-role bearer).

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { dispatch, type NotificationItem, type NotificationType } from "../_shared/notify.ts";

interface InputItem {
  type: NotificationType;
  ipo_id?: string;
  slug?: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  dedupe_key?: string;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<InputItem & { items?: InputItem[] }>(req);
  const inputs: InputItem[] = body.items ?? (body.title ? [body] : []);
  if (!inputs.length) return error("Provide {type,title,body,...} or {items:[...]}", 400);

  const admin = adminClient();
  const items: NotificationItem[] = [];
  for (const it of inputs) {
    if (!it.type || !it.title || !it.body) return error("type, title and body are required", 400);
    let ipoId = it.ipo_id ?? null;
    let slug = it.slug ?? null;
    let name: string | undefined;
    if (ipoId || slug) {
      const q = admin.from("ipos").select("id, slug, name").limit(1);
      const { data } = ipoId ? await q.eq("id", ipoId).maybeSingle() : await q.eq("slug", slug as string).maybeSingle();
      if (!data) return error(`IPO not found: ${ipoId ?? slug}`, 404);
      ipoId = data.id as string;
      slug = data.slug as string;
      name = data.name as string;
    }
    items.push({
      type: it.type,
      ipoId,
      slug,
      name,
      title: it.title,
      body: it.body,
      data: it.data,
      dedupeKey: it.dedupe_key ?? `${it.type}:${slug ?? "all"}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  try {
    const result = await dispatch(admin, items);
    return json({ ok: true, ...result });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
});
