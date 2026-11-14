// test-push — lets a signed-in user send a test notification to their own registered devices.
// POST (user JWT) → { ok, devices, success, failure, fcmConfigured }
// Used by Settings → Notifications → "Send test notification" to verify FCM end to end.

import { adminClient, AuthError, requireUser } from "../_shared/auth.ts";
import { fcmConfigured, sendToTokens } from "../_shared/fcm.ts";
import { error, handleOptions, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);

  let user: { id: string };
  try {
    user = await requireUser(req);
  } catch (e) {
    return error(e instanceof AuthError ? e.message : "Unauthorized", 401);
  }

  const admin = adminClient();
  const { data: tokens, error: tErr } = await admin.from("device_tokens").select("fcm_token").eq("user_id", user.id);
  if (tErr) return error(tErr.message, 500);
  const list = (tokens ?? []).map((t) => t.fcm_token as string);

  if (!fcmConfigured()) {
    return json({ ok: false, fcmConfigured: false, devices: list.length, reason: "FCM_SERVICE_ACCOUNT_JSON secret is not set" });
  }
  if (!list.length) {
    return json({ ok: false, fcmConfigured: true, devices: 0, reason: "No device registered for this user yet" });
  }

  try {
    const outcomes = await sendToTokens(list, {
      title: "Be IPO Ready — test alert",
      body: "Push notifications are working. You'll get IPO open/close, allotment, listing and GMP alerts here.",
      channelId: "default",
      data: { type: "generic", url: "beipoready://" },
    });
    const success = outcomes.filter((o) => o.ok).length;
    const failure = outcomes.length - success;
    const invalid = outcomes.filter((o) => !o.ok && o.invalidToken).map((o) => o.token);
    if (invalid.length) await admin.from("device_tokens").delete().in("fcm_token", invalid);
    return json({ ok: success > 0, fcmConfigured: true, devices: list.length, success, failure, errors: outcomes.filter((o) => !o.ok).map((o) => (o.ok ? "" : o.error)).slice(0, 3) });
  } catch (e) {
    return error(e instanceof Error ? e.message : String(e), 500);
  }
});
