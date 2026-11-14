// OAuth return for the admin panel (Google). Exchanges the PKCE code for a session cookie and continues.
import { NextResponse, type NextRequest } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (!code) {
    const err = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Missing code";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err)}`, url.origin));
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  // The dashboard layout re-checks admin_users and bounces non-admins to /login?error=noaccess.
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
