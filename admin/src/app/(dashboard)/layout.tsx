import { requireAdmin } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, admin } = await requireAdmin();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? admin.email ?? "—"} role={admin.role} />
      <main className="flex-1 min-w-0">
        <div className="max-w-[1240px] mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
