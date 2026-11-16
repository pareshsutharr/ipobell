import { HeldFeatures } from "@/components/settings/HeldFeatures";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { readSwitches } from "@/lib/held-features";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_LEAD_NOTIFICATIONS, type AppSettingRow, type LeadNotificationSettings } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { admin } = await requireAdmin();
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("app_settings").select("*").eq("key", "lead_notifications").maybeSingle();
  const row = data as AppSettingRow<Partial<LeadNotificationSettings>> | null;
  const value: LeadNotificationSettings = {
    enabled: row?.value?.enabled !== false,
    emails: Array.isArray(row?.value?.emails) && row.value.emails.length ? row.value.emails : DEFAULT_LEAD_NOTIFICATIONS.emails,
  };
  const canWrite = admin.role === "super_admin";
  const { data: switchRows, error: switchErr } = await supabase.from("feature_switches").select("key, enabled");
  const switchSetup = switchErr ? "These switches are not in the database yet. Apply the migration 20261116000200_data_score_and_promoted.sql. Until then both features are off." : null;
  const canTest = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <>
      <PageHeader title="Settings" subtitle="Who hears about new leads from the app, and the features held for legal review." />
      <ErrorBanner message={error?.message ?? null} />
      <NotificationSettings initial={value} updatedAt={row?.updated_at ?? null} canWrite={canWrite} canTest={canTest} />
      <HeldFeatures initial={readSwitches(switchRows)} canWrite={canWrite} setupError={switchSetup} />
    </>
  );
}
