import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { AudienceFilter } from "@/components/analytics/AudienceFilter";
import { JourneysTable } from "@/components/analytics/JourneysTable";
import { RangePicker } from "@/components/analytics/RangePicker";
import { Badge, ErrorBanner, PageHeader } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, parseAudience, parseRange } from "@/lib/analytics-format";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { ANALYTICS_TOOLS, type ToolJourneyRow } from "@/lib/types";

export const metadata = { title: "Tool journeys · Analytics" };

const STAGES = new Set(["started", "completed", "submitted", "not_submitted"]);

export default async function JourneysPage({ searchParams }: PageProps<"/analytics/journeys">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const audience = parseAudience(sp);
  const tool = typeof sp.tool === "string" && (ANALYTICS_TOOLS as readonly string[]).includes(sp.tool) ? sp.tool : "";
  const stage = typeof sp.stage === "string" && STAGES.has(sp.stage) ? sp.stage : "";
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("analytics_tool_journeys", {
    p_from: range.from,
    p_to: range.to,
    p_tool: tool || null,
    p_stage: stage || null,
    p_audience: audience || null,
    p_limit: 500,
  });

  return (
    <>
      <PageHeader title="Tool journeys" subtitle="Who started a tool, who finished it, and who never left their details. The drop-offs are the people to call." actions={audience ? <Badge tone={audienceTone(audience)}>Showing: {AUDIENCE_LABEL[audience]}</Badge> : null} />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-3">
        <RangePicker range={range} />
        <AudienceFilter value={audience} />
      </div>
      <div className="mt-4">
        <ErrorBanner message={error?.message ?? null} />
      </div>
      <JourneysTable rows={((data ?? []) as ToolJourneyRow[]).map((r) => ({ ...r, result: r.result ?? null }))} filters={{ tool, stage }} rangeLabel={range.label} />
    </>
  );
}
