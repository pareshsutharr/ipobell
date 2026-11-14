import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { config } from "./env.ts";

/** Service-role client. Bypasses RLS — only ever used inside Edge Functions. */
export function adminClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Accepts a request only when it carries the cron secret (pg_cron / admin calls)
 * or the service-role key as a bearer token.
 */
export function isTrustedCaller(req: Request): boolean {
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader && timingSafeEqual(cronHeader, config.cronSecret)) return true;

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (bearer && timingSafeEqual(bearer, config.serviceRoleKey)) return true;

  return false;
}

/** Resolve the calling user from the Authorization header (user JWT). */
export async function requireUser(req: Request): Promise<{ id: string; isAnonymous: boolean; email?: string }> {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+/i.test(auth)) throw new AuthError("Missing bearer token");

  const client = createClient(config.supabaseUrl, config.anonKey, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new AuthError("Invalid session");
  return {
    id: data.user.id,
    isAnonymous: Boolean(data.user.is_anonymous),
    email: data.user.email ?? undefined,
  };
}

export class AuthError extends Error {}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
