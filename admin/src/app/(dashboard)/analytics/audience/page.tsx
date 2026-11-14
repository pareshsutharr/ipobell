import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { AudienceTable } from "@/components/analytics/AudienceTable";
import { RangePicker } from "@/components/analytics/RangePicker";
import { Badge, ErrorBanner, PageHeader } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, parseAudience, parseRange } from "@/lib/analytics-format";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { AnalyticsUserRow } from "@/lib/types";

export const metadata = { title: "Audience · Analytics" };

export default async function AudiencePage({ searchParams }: PageProps<"/analytics/audience">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const audience = parseAudience(sp);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("analytics_users", { p_from: range.from, p_to: range.to, p_audience: audience || null, p_search: q || null, p_limit: 500 });

  return (
    <>
      <PageHeader title="Audience" subtitle="Every person who used the app in this range, what kind of user they are, and what they did." actions={audience ? <Badge tone={audienceTone(audience)}>Showing: {AUDIENCE_LABEL[audience]}</Badge> : null} />
      <AnalyticsTabs />
      <RangePicker range={range} />
      <div className="mt-4">
        <ErrorBanner message={error?.message ?? null} />
      </div>
      <AudienceTable users={((data ?? []) as AnalyticsUserRow[]).map((u) => ({ ...u, tools_used: u.tools_used ?? [] }))} filters={{ audience, q }} rangeLabel={range.label} />
    </>
  );
}
