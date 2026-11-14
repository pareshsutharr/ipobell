import { createClient } from "@supabase/supabase-js";

export class ServiceRoleMissingError extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables and redeploy.");
  }
}

/** Service-role client. Server only. Bypasses RLS — use after verifying the caller's role. */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!key) throw new ServiceRoleMissingError();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
