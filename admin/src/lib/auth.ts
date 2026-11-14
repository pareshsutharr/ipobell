import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { supabaseServer } from "./supabase/server";
import type { AdminUserRow } from "./types";

export interface CurrentAdmin {
  user: User;
  admin: AdminUserRow;
}

/**
 * Resolve the signed-in user and their admin row. RLS only returns the row to admins, so a
 * missing row means "no admin access". Redirects to /login when either is absent.
 */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: admin } = await supabase.from("admin_users").select("*").eq("user_id", auth.user.id).maybeSingle();
  if (!admin) redirect("/login?error=noaccess");
  return { user: auth.user, admin: admin as AdminUserRow };
}

export async function requireSuperAdmin(): Promise<CurrentAdmin> {
  const current = await requireAdmin();
  if (current.admin.role !== "super_admin") redirect("/?error=forbidden");
  return current;
}
