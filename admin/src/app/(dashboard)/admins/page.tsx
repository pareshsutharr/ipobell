import { AdminsManager } from "@/components/admins/AdminsManager";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { AdminUserRow } from "@/lib/types";

export const metadata = { title: "Team access" };

export default async function AdminsPage() {
  const { user } = await requireSuperAdmin();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("admin_users").select("*").order("created_at", { ascending: true });
  const serviceRoleReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <PageHeader title="Team access" subtitle="Editors can write insights and work leads. Super admins can also manage this list." />
      <ErrorBanner message={error?.message ?? null} />
      {!serviceRoleReady ? <div className="mb-4"><ErrorBanner message="Adding or removing admins needs SUPABASE_SERVICE_ROLE_KEY on the server. Add it in Vercel → Settings → Environment Variables and redeploy. Viewing still works." /></div> : null}
      <AdminsManager admins={(data ?? []) as AdminUserRow[]} currentUserId={user.id} canWrite={serviceRoleReady} />
    </>
  );
}
