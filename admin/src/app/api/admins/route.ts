// Team access management. Every call: cookie session → caller must be a super_admin (checked with the
// service-role client so RLS cannot be bypassed by a stale client) → act with the service role.
import { NextResponse, type NextRequest } from "next/server";

import { ServiceRoleMissingError, supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

const ROLES = new Set(["super_admin", "editor"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireSuper() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const admin = supabaseAdmin();
  const { data: row } = await admin.from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  if (row?.role !== "super_admin") return { error: NextResponse.json({ error: "Only a super admin can manage team access." }, { status: 403 }) };
  return { user: data.user, admin };
}

function failure(e: unknown) {
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireSuper();
    if ("error" in ctx) return ctx.error;
    const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string; role?: string; full_name?: string };
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const role = body.role ?? "editor";
    if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (!ROLES.has(role)) return NextResponse.json({ error: "Unknown role." }, { status: 400 });

    const { admin, user } = ctx;
    let userId: string;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: body.full_name ? { full_name: body.full_name } : undefined });
    if (created.error) {
      // Already registered (e.g. an app user): find them and grant access without touching their password.
      const msg = created.error.message.toLowerCase();
      if (!/already|exists|registered/.test(msg)) return NextResponse.json({ error: created.error.message }, { status: 400 });
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) return NextResponse.json({ error: "That email is registered but could not be found." }, { status: 409 });
      userId = existing.id;
    } else {
      userId = created.data.user.id;
    }

    const { error: upErr } = await admin.from("admin_users").upsert({ user_id: userId, role, email, display_name: body.full_name ?? null, created_by: user.id }, { onConflict: "user_id" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, user_id: userId, existing: Boolean(created.error) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await requireSuper();
    if ("error" in ctx) return ctx.error;
    const { admin, user } = ctx;
    const body = (await request.json().catch(() => ({}))) as { user_id?: string };
    if (!body.user_id) return NextResponse.json({ error: "user_id is required." }, { status: 400 });
    if (body.user_id === user.id) return NextResponse.json({ error: "You cannot remove your own access." }, { status: 400 });

    const { data: target } = await admin.from("admin_users").select("role").eq("user_id", body.user_id).maybeSingle();
    if (!target) return NextResponse.json({ error: "That person is not an admin." }, { status: 404 });
    if (target.role === "super_admin") {
      const { count } = await admin.from("admin_users").select("user_id", { count: "exact", head: true }).eq("role", "super_admin");
      if ((count ?? 0) <= 1) return NextResponse.json({ error: "The last super admin cannot be removed." }, { status: 400 });
    }
    const { error } = await admin.from("admin_users").delete().eq("user_id", body.user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
