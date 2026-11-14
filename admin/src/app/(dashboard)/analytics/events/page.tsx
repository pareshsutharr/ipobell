import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { AudienceFilter } from "@/components/analytics/AudienceFilter";
import { EventsExplorer } from "@/components/analytics/EventsExplorer";
import { RangePicker } from "@/components/analytics/RangePicker";
import { Badge, ErrorBanner, PageHeader } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, parseAudience, parseRange } from "@/lib/analytics-format";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { AnalyticsEventRow } from "@/lib/types";

export const metadata = { title: "Events · Analytics" };
const PAGE_SIZE = 500;

export default async function EventsPage({ searchParams }: PageProps<"/analytics/events">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const event = typeof sp.event === "string" ? sp.event : "";
  const audience = parseAudience(sp);
  const supabase = await supabaseServer();

  let query = supabase.from("analytics_events").select("*").gte("created_at", range.from).lt("created_at", range.to).order("created_at", { ascending: false }).range(0, PAGE_SIZE - 1);
  if (event) query = query.eq("event", event);
  const { data, error } = await query;
  const rows = (data ?? []) as AnalyticsEventRow[];

  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter((x): x is string => Boolean(x))));
  const people: Record<string, { display_name: string | null; email: string | null; is_anonymous: boolean; role: string | null }> = {};
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name, email, is_anonymous, role").in("id", ids);
    (profiles ?? []).forEach((p: { id: string; display_name: string | null; email: string | null; is_anonymous: boolean; role: string | null }) => {
      people[p.id] = { display_name: p.display_name, email: p.email, is_anonymous: p.is_anonymous, role: p.role };
    });
  }

  return (
    <>
      <PageHeader title="Events" subtitle="The raw stream, newest first. Use it to check that tracking works or to chase one odd session." actions={audience ? <Badge tone={audienceTone(audience)}>Showing: {AUDIENCE_LABEL[audience]}</Badge> : null} />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-3">
        <RangePicker range={range} />
        <AudienceFilter value={audience} />
      </div>
      <div className="mt-4">
        <ErrorBanner message={error?.message ?? null} />
      </div>
      <EventsExplorer initial={rows} people={people} range={{ from: range.from, to: range.to }} eventFilter={event} audience={audience} pageSize={PAGE_SIZE} />
    </>
  );
}
