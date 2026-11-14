// delete-account — permanently deletes the calling user (auth.users row; everything else cascades).
// Called by the app with the user's JWT. Required for Play Store account-deletion policy.

import { adminClient, AuthError, requireUser } from "../_shared/auth.ts";
import { error, handleOptions, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);

  try {
    const user = await requireUser(req);
    const admin = adminClient();
    // Explicitly drop tokens first so no push can race the deletion.
    await admin.from("device_tokens").delete().eq("user_id", user.id);
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) return error(delErr.message, 500);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return error(e.message, 401);
    return error(e instanceof Error ? e.message : String(e), 500);
  }
});
