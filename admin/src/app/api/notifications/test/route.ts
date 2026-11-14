// Sends a test lead e-mail by invoking the notify-lead Edge Function with the service-role key.
// Any signed-in admin may trigger it; the recipients default to the saved notification list.
import { NextResponse, type NextRequest } from "next/server";

import { ServiceRoleMissingError, supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { data: adminRow } = await supabase.from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: "No admin access." }, { status: 403 });

    supabaseAdmin(); // throws a clear error when the service-role key is missing
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const body = (await request.json().catch(() => ({}))) as { to?: unknown };
    const to = Array.isArray(body.to) ? body.to.filter((e): e is string => typeof e === "string" && EMAIL.test(e)) : [];

    const res = await fetch(`${url}/functions/v1/notify-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ test: true, to }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; to?: string[] };
    if (!res.ok) return NextResponse.json({ error: json.error ?? `notify-lead returned ${res.status}. Is the function deployed with the SMTP secrets?` }, { status: 502 });
    return NextResponse.json({ ok: true, to: json.to ?? to });
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
