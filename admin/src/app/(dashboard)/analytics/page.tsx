import Link from "next/link";

import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { AudienceFilter } from "@/components/analytics/AudienceFilter";
import { DailyChart, FunnelRow, HourChart, StackedBar } from "@/components/analytics/Charts";
import { RangePicker } from "@/components/analytics/RangePicker";
import { RankTable } from "@/components/analytics/RankTable";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, fmtInt, fmtPct, humaniseScreen, parseAudience, parseRange, rangeParams, toolLabel } from "@/lib/analytics-format";
import { requireAdmin } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import type { AnalyticsDailyRow, AnalyticsOverview } from "@/lib/types";

export const metadata = { title: "Analytics" };

const EMPTY: AnalyticsOverview = {
  totals: { users: 0, new_users: 0, sessions: 0, events: 0, screen_views: 0, ipo_views: 0, insight_views: 0, tool_starts: 0, tool_completions: 0, leads: 0, external_links: 0, watchlist_adds: 0, searches: 0 },
  by_audience: [], by_perspective: [], top_screens: [], top_ipos: [], top_insights: [], top_events: [], tools: [], readiness_bands: [], eligibility_outcomes: [], external_links: [], searches: [], sign_in_methods: [], platforms: [], app_versions: [], hours: [],
};

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-medium">{label}</p>
      <p className="display text-[26px] leading-none mt-2 num">{value}</p>
      <p className="text-ink-3 text-[12px] mt-1.5">{hint}</p>
    </Card>
  );
}

export default async function AnalyticsPage({ searchParams }: PageProps<"/analytics">) {
  await requireAdmin();
  const sp = await searchParams;
  const range = parseRange(sp);
  const audience = parseAudience(sp);
  const supabase = await supabaseServer();

  const [ov, daily] = await Promise.all([
    supabase.rpc("analytics_overview", { p_from: range.from, p_to: range.to, p_audience: audience || null }),
    supabase.rpc("analytics_daily", { p_from: range.from, p_to: range.to, p_audience: audience || null }),
  ]);
  const journeyQs = (tool: string) => `${rangeParams(range)}${audience ? `&audience=${audience}` : ""}&tool=${tool}&stage=not_submitted`;
  const error = ov.error?.message ?? daily.error?.message ?? null;
  const o: AnalyticsOverview = { ...EMPTY, ...((ov.data as Partial<AnalyticsOverview> | null) ?? {}) };
  const t = { ...EMPTY.totals, ...(o.totals ?? {}) };
  const days = ((daily.data ?? []) as AnalyticsDailyRow[]).map((d) => ({ ...d, day: String(d.day).slice(0, 10) }));

  // Map IPO slugs → ids so top IPOs can link to their insight editor.
  const slugs = (o.top_ipos ?? []).map((r) => r.slug).filter(Boolean);
  const ipoIds = new Map<string, string>();
  if (slugs.length) {
    const { data } = await supabase.from("ipos").select("id, slug").in("slug", slugs);
    (data ?? []).forEach((r: { id: string; slug: string }) => ipoIds.set(r.slug, r.id));
  }

  const aud = (a: string) => o.by_audience.find((x) => x.audience === a);
  const audienceRows = ["business", "investor", "unknown"].map((a) => ({ ...(aud(a) ?? { users: 0, sessions: 0, events: 0, ipo_views: 0, tool_completions: 0, leads: 0 }), audience: a }));
  const nothing = t.events === 0 && !error;

  return (
    <>
      <PageHeader title="Analytics" subtitle="What people do in the app: who they are, what they look at, which tools they finish, and where they go next." actions={audience ? <Badge tone={audienceTone(audience)}>Showing: {AUDIENCE_LABEL[audience]}</Badge> : null} />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-3">
        <RangePicker range={range} />
        <AudienceFilter value={audience} />
      </div>
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>

      {nothing ? (
        <Card className="mt-4">
          <EmptyState title="No activity in this range" message="Events arrive from the app build that includes tracking. Once people use that build, this page fills in within a minute." />
        </Card>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Active users" value={fmtInt(t.users)} hint={`${fmtInt(t.new_users)} new in this range`} />
            <Kpi label="Sessions" value={fmtInt(t.sessions)} hint={`${t.users ? (t.sessions / t.users).toFixed(1) : "0"} per user`} />
            <Kpi label="Screen views" value={fmtInt(t.screen_views)} hint={`${t.sessions ? (t.screen_views / t.sessions).toFixed(1) : "0"} per session`} />
            <Kpi label="IPO views" value={fmtInt(t.ipo_views)} hint={`${fmtInt(t.insight_views)} insight reads · ${fmtInt(t.watchlist_adds)} watchlist adds`} />
            <Kpi label="Tool completions" value={fmtInt(t.tool_completions)} hint={`${fmtInt(t.tool_starts)} started · ${fmtPct(t.tool_completions, t.tool_starts)} finished`} />
            <Kpi label="Leads" value={fmtInt(t.leads)} hint="Forms submitted with contact details" />
            <Kpi label="Lead conversion" value={fmtPct(t.leads, t.users)} hint="Leads ÷ active users" />
            <Kpi label="External links" value={fmtInt(t.external_links)} hint={`${fmtInt(t.searches)} searches`} />
          </div>

          <div className="grid lg:grid-cols-[2fr_1fr] gap-5">
            <Card>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px]">Daily activity</h3>
                <span className="text-[12px] text-ink-3">{range.label}</span>
              </div>
              <DailyChart rows={days} fromDay={range.fromDay} toDay={range.toDay} />
            </Card>
            <Card>
              <h3 className="text-[15px] mb-1">By hour of day</h3>
              <p className="text-[12px] text-ink-3 mb-3">All events, IST. Darker bars are working hours.</p>
              <HourChart hours={o.hours ?? []} />
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card>
              <h3 className="text-[15px] mb-1">Audience</h3>
              <p className="text-[12px] text-ink-3 mb-4">What people told us at sign-up. "Not chosen" are older installs or guests who skipped.</p>
              <StackedBar parts={[{ label: "Business owners", value: Number(aud("business")?.users ?? 0), color: "#c9962b" }, { label: "Investors", value: Number(aud("investor")?.users ?? 0), color: "#0f2d52" }, { label: "Not chosen", value: Number(aud("unknown")?.users ?? 0), color: "#cfcdc6" }]} />
              <table className="data mt-4">
                <thead>
                  <tr>
                    <th className="!pl-0">Audience</th>
                    <th className="text-right">Users</th>
                    <th className="text-right">Sessions</th>
                    <th className="text-right">IPO views</th>
                    <th className="text-right">Tools done</th>
                    <th className="text-right">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {audienceRows.map((r) => (
                    <tr key={r.audience}>
                      <td className="!pl-0">
                        <Badge tone={audienceTone(r.audience)}>{AUDIENCE_LABEL[r.audience] ?? r.audience}</Badge>
                      </td>
                      <td className="text-right num">{fmtInt(r.users)}</td>
                      <td className="text-right num">{fmtInt(r.sessions)}</td>
                      <td className="text-right num">{fmtInt(r.ipo_views)}</td>
                      <td className="text-right num">{fmtInt(r.tool_completions)}</td>
                      <td className="text-right num">{fmtInt(r.leads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 pt-4 border-t border-line">
                <p className="text-[12px] text-ink-3 mb-2">Header switch · screen views in each view</p>
                <StackedBar parts={[{ label: "Business view", value: Number(o.by_perspective.find((p) => p.perspective === "business")?.screen_views ?? 0), color: "#c9962b" }, { label: "Investor view", value: Number(o.by_perspective.find((p) => p.perspective === "investor")?.screen_views ?? 0), color: "#0f2d52" }]} />
              </div>
            </Card>

            <Card>
              <h3 className="text-[15px] mb-1">Tool funnel</h3>
              <p className="text-[12px] text-ink-3 mb-2">Sessions that started a tool → finished it → left contact details. Click a tool to see who dropped off.</p>
              {(o.tools ?? []).map((tl) => (
                <FunnelRow
                  key={tl.tool}
                  label={
                    <div>
                      <Link href={`/analytics/journeys?${journeyQs(tl.tool)}` as never} className="hover:underline">
                        {toolLabel(tl.tool)}
                      </Link>
                      <div className="text-[11px] text-ink-3 font-normal num">
                        {fmtPct(tl.completed, tl.started)} finish · {fmtPct(tl.leads, tl.completed)} to lead
                      </div>
                    </div>
                  }
                  steps={[
                    { label: "Started", value: Number(tl.started), color: "#9aa5b8" },
                    { label: "Completed", value: Number(tl.completed), color: "#0f2d52" },
                    { label: "Leads", value: Number(tl.leads), color: "#c9962b" },
                  ]}
                />
              ))}
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <RankTable
              title="Top screens"
              subtitle="Most viewed pages"
              rows={o.top_screens ?? []}
              rowKey={(r) => r.screen}
              columns={[
                {
                  key: "screen",
                  label: "Screen",
                  render: (r) => {
                    const h = humaniseScreen(r.screen);
                    return (
                      <span>
                        {h.label}
                        {h.detail ? <span className="text-ink-3"> · {h.detail}</span> : null}
                      </span>
                    );
                  },
                },
                { key: "views", label: "Views", align: "right", render: (r) => fmtInt(r.views) },
                { key: "users", label: "Users", align: "right", render: (r) => fmtInt(r.users) },
              ]}
            />
            <RankTable
              title="Top IPOs"
              subtitle="IPO pages opened"
              rows={o.top_ipos ?? []}
              rowKey={(r) => r.slug}
              columns={[
                {
                  key: "name",
                  label: "IPO",
                  render: (r) => {
                    const id = ipoIds.get(r.slug);
                    const label = r.name ?? r.slug;
                    return (
                      <span className="inline-flex items-center gap-2">
                        {id ? (
                          <Link href={`/ipos/${id}` as never} className="hover:underline">
                            {label}
                          </Link>
                        ) : (
                          label
                        )}
                        {r.board ? <Badge tone={r.board === "sme" ? "gold" : "navy"}>{r.board === "sme" ? "SME" : "Mainboard"}</Badge> : null}
                      </span>
                    );
                  },
                },
                { key: "views", label: "Views", align: "right", render: (r) => fmtInt(r.views) },
                { key: "biz", label: "Business view", align: "right", render: (r) => fmtInt(r.business_views) },
                { key: "wl", label: "Watchlisted", align: "right", render: (r) => fmtInt(r.watchlist_adds) },
              ]}
            />
            <RankTable title="Top insights" subtitle="Business insights read" rows={o.top_insights ?? []} rowKey={(r, i) => r.slug ?? String(i)} columns={[{ key: "slug", label: "IPO", render: (r) => r.slug ?? "—" }, { key: "views", label: "Reads", align: "right", render: (r) => fmtInt(r.views) }, { key: "users", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} empty="No insight has been read yet. Publish one from IPOs & insights." />
            <RankTable title="External links clicked" subtitle="Where the app sends people (website, WhatsApp, calls, documents)" rows={o.external_links ?? []} rowKey={(r, i) => `${r.label}-${i}`} columns={[{ key: "label", label: "Link", render: (r) => (
              <span>
                {r.label ?? "—"}
                {r.url ? <span className="block text-[11.5px] text-ink-3 truncate max-w-[280px]">{r.url}</span> : null}
              </span>
            ) }, { key: "clicks", label: "Clicks", align: "right", render: (r) => fmtInt(r.clicks) }, { key: "users", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} />
            <RankTable title="Readiness score bands" subtitle="How ready the businesses that finished the check are" rows={o.readiness_bands ?? []} rowKey={(r, i) => r.band ?? String(i)} columns={[{ key: "band", label: "Band", render: (r) => r.band ?? "—" }, { key: "count", label: "Checks", align: "right", render: (r) => fmtInt(r.count) }, { key: "avg", label: "Avg score", align: "right", render: (r) => (r.avg_percent !== null && r.avg_percent !== undefined ? `${Number(r.avg_percent).toFixed(1)}%` : "—") }]} />
            <RankTable title="Eligibility outcomes" subtitle="Platform the tool recommended" rows={o.eligibility_outcomes ?? []} rowKey={(r) => r.recommended} columns={[{ key: "rec", label: "Recommended", render: (r) => (r.recommended === "none" ? "Not eligible yet" : r.recommended.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) }, { key: "count", label: "Checks", align: "right", render: (r) => fmtInt(r.count) }]} />
            <RankTable title="Searches" subtitle="What people typed in search" rows={o.searches ?? []} rowKey={(r) => r.query} columns={[{ key: "q", label: "Query", render: (r) => r.query }, { key: "count", label: "Times", align: "right", render: (r) => fmtInt(r.count) }]} />
            <RankTable title="Top events" subtitle="Everything the app records" rows={o.top_events ?? []} rowKey={(r) => r.event} columns={[{ key: "event", label: "Event", render: (r) => <code className="text-[12px]">{r.event}</code> }, { key: "count", label: "Count", align: "right", render: (r) => fmtInt(r.count) }, { key: "users", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} />
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <RankTable title="Sign-in methods" rows={o.sign_in_methods ?? []} rowKey={(r, i) => r.method ?? String(i)} columns={[{ key: "m", label: "Method", render: (r) => r.method ?? "—" }, { key: "u", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} />
            <RankTable title="Platforms" rows={o.platforms ?? []} rowKey={(r) => r.platform} columns={[{ key: "p", label: "Platform", render: (r) => r.platform }, { key: "u", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} />
            <RankTable title="App versions" rows={o.app_versions ?? []} rowKey={(r) => r.version} columns={[{ key: "v", label: "Version", render: (r) => r.version }, { key: "u", label: "Users", align: "right", render: (r) => fmtInt(r.users) }]} />
          </div>
        </div>
      )}
    </>
  );
}
