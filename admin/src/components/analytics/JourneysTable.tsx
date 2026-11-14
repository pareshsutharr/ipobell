"use client";

import { Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { UserDrawer } from "@/components/analytics/AudienceTable";
import { Badge, Button, Card, EmptyState } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, describeToolResult, fmtInt, fmtPct, screenLabel, stageLabel, stageTone, toolLabel, userLabel } from "@/lib/analytics-format";
import { dateTime } from "@/lib/format";
import { ANALYTICS_TOOLS, JOURNEY_STAGE_FILTERS, type AnalyticsUserRow, type ToolJourneyRow } from "@/lib/types";

type Filters = { tool: string; stage: string };

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="!p-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-medium">{label}</p>
      <p className="display text-[26px] leading-none mt-2 num">{value}</p>
      {hint ? <p className="text-ink-3 text-[12px] mt-1.5">{hint}</p> : null}
    </Card>
  );
}

function toUserRow(j: ToolJourneyRow): AnalyticsUserRow {
  return {
    user_id: j.user_id,
    device_id: null,
    display_name: j.display_name,
    email: j.email,
    phone: j.phone,
    company_name: j.company_name,
    city: null,
    audience: j.audience,
    is_anonymous: j.is_anonymous,
    first_seen: j.first_started,
    last_seen: j.last_activity,
    sessions: 0,
    events: 0,
    screen_views: 0,
    ipo_views: 0,
    insight_views: 0,
    tools_used: [j.tool],
    tool_completions: j.completed ? 1 : 0,
    leads: j.lead_submitted ? 1 : 0,
    external_links: 0,
    watchlist_adds: 0,
    last_screen: j.last_screen,
    last_perspective: null,
    platform: j.platform,
    app_version: j.app_version,
  };
}

export function JourneysTable({ rows, filters, rangeLabel }: { rows: ToolJourneyRow[]; filters: Filters; rangeLabel: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState<ToolJourneyRow | null>(null);

  const apply = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...filters, ...patch };
    merged.tool ? next.set("tool", merged.tool) : next.delete("tool");
    merged.stage ? next.set("stage", merged.stage) : next.delete("stage");
    router.replace(`${path}${next.size ? `?${next.toString()}` : ""}` as never);
  };

  const stats = useMemo(() => {
    const people = new Set(rows.map((r) => r.user_id ?? `${r.tool}-${r.first_started}`)).size;
    const started = rows.filter((r) => r.stage === "started").length;
    const completed = rows.filter((r) => r.stage === "completed").length;
    const submitted = rows.filter((r) => r.stage === "submitted").length;
    return { people, started, completed, submitted, notSubmitted: started + completed };
  }, [rows]);

  const exportCsv = () => {
    const header = ["user_id", "name", "email", "phone", "company", "audience", "guest", "tool", "stage", "first_started", "last_activity", "attempts", "completed_at", "result", "lead_submitted", "lead_at", "lead_id", "last_screen", "platform", "app_version"];
    const lines = rows.map((r) => [r.user_id, r.display_name, r.email, r.phone, r.company_name, r.audience, r.is_anonymous ? "yes" : "no", r.tool, r.stage, r.first_started, r.last_activity, r.starts, r.completed_at, describeToolResult(r.tool, r.result), r.lead_submitted ? "yes" : "no", r.lead_at, r.lead_id, r.last_screen, r.platform, r.app_version].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tool-journeys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select className="field h-9 !w-auto pr-8" value={filters.tool} onChange={(e) => apply({ tool: e.target.value })} aria-label="Tool">
          <option value="">All tools</option>
          {ANALYTICS_TOOLS.map((t) => (
            <option key={t} value={t}>
              {toolLabel(t)}
            </option>
          ))}
        </select>
        <div className="inline-flex flex-wrap rounded-[10px] border border-line-strong bg-white p-0.5">
          {JOURNEY_STAGE_FILTERS.map((s) => (
            <button key={s.value} type="button" onClick={() => apply({ stage: s.value })} className={`h-8 px-3 rounded-[8px] text-[13px] transition ${filters.stage === s.value ? "bg-navy text-white" : "text-ink-2 hover:bg-navy-soft"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-ink-3 text-[13px] ml-auto num">
          {rows.length} {rows.length === 1 ? "journey" : "journeys"} · {rangeLabel}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        <Tile label="People" value={fmtInt(stats.people)} hint={filters.tool ? toolLabel(filters.tool) : "All tools"} />
        <Tile label="Started only" value={fmtInt(stats.started)} hint="Began, never finished" />
        <Tile label="Finished, no details" value={fmtInt(stats.completed)} hint="Saw a result, sent nothing" />
        <Tile label="Submitted" value={fmtInt(stats.submitted)} hint="Left contact details" />
        <Tile label="Drop-off" value={fmtPct(stats.notSubmitted, rows.length)} hint="Not submitted ÷ journeys" />
      </div>

      <Card padded={false} className="mt-4 overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="No journeys here" message={filters.tool || filters.stage ? "Nothing matches these filters in this range." : "Journeys appear once someone opens a tool in the tracked app build."} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Audience</th>
                <th>Tool</th>
                <th>Stage</th>
                <th>Started</th>
                <th>Last activity</th>
                <th className="text-right">Attempts</th>
                <th>Result</th>
                <th>Lead</th>
                <th>Last screen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const contact = [r.email, r.phone].filter(Boolean).join(" · ");
                return (
                  <tr key={`${r.user_id ?? "anon"}-${r.tool}-${i}`} className="clickable" onClick={() => setOpen(r)}>
                    <td>
                      <div className="font-medium">{r.display_name || r.email ? userLabel(r) : r.is_anonymous ? "Guest" : userLabel(r)}</div>
                      <div className="text-[12px] text-ink-3">{contact || (r.company_name ? r.company_name : "Guest · no contact yet")}</div>
                      {contact && r.company_name ? <div className="text-[12px] text-ink-3">{r.company_name}</div> : null}
                    </td>
                    <td>
                      <Badge tone={audienceTone(r.audience)}>{AUDIENCE_LABEL[r.audience] ?? r.audience}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{toolLabel(r.tool)}</td>
                    <td>
                      <Badge tone={stageTone(r.stage)}>{stageLabel(r.stage)}</Badge>
                    </td>
                    <td className="num whitespace-nowrap text-ink-2">{dateTime(r.first_started)}</td>
                    <td className="num whitespace-nowrap">{dateTime(r.last_activity)}</td>
                    <td className="text-right num">{fmtInt(r.starts)}</td>
                    <td className="max-w-[300px] text-ink-2">{r.completed ? describeToolResult(r.tool, r.result) : <span className="text-ink-3">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.lead_id ? (
                        <Link href={`/leads?q=${encodeURIComponent(r.phone ?? r.email ?? "")}` as never} className="inline-flex items-center gap-1 text-navy hover:underline text-[13px]" title={`Lead ${r.lead_id}`}>
                          <ExternalLink size={13} /> {r.lead_at ? dateTime(r.lead_at) : "Open"}
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="text-ink-2 whitespace-nowrap">{screenLabel(r.last_screen)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {open ? <UserDrawer user={toUserRow(open)} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
