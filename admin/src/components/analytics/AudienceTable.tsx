"use client";

import { ChevronDown, ChevronRight, Download, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, Card, EmptyState, ErrorBanner } from "@/components/ui";
import { AUDIENCE_LABEL, audienceTone, describeEvent, eventTone, fmtInt, screenLabel, toolLabel, userLabel } from "@/lib/analytics-format";
import { dateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AnalyticsUserEventRow, AnalyticsUserRow } from "@/lib/types";

type Filters = { audience: string; q: string };

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AudienceTable({ users, filters, rangeLabel }: { users: AnalyticsUserRow[]; filters: Filters; rangeLabel: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [text, setText] = useState(filters.q);
  const [open, setOpen] = useState<AnalyticsUserRow | null>(null);

  const apply = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(sp.toString());
    const merged = { ...filters, q: text, ...patch };
    merged.audience ? next.set("audience", merged.audience) : next.delete("audience");
    merged.q ? next.set("q", merged.q) : next.delete("q");
    router.replace(`${path}${next.size ? `?${next.toString()}` : ""}` as never);
  };

  const exportCsv = () => {
    const header = ["user_id", "name", "email", "phone", "company", "city", "audience", "guest", "platform", "app_version", "first_seen", "last_seen", "sessions", "events", "screen_views", "ipo_views", "insight_views", "tools_used", "tool_completions", "leads", "external_links", "watchlist_adds", "last_screen", "last_perspective"];
    const lines = users.map((u) => [u.user_id, u.display_name, u.email, u.phone, u.company_name, u.city, u.audience, u.is_anonymous ? "yes" : "no", u.platform, u.app_version, u.first_seen, u.last_seen, u.sessions, u.events, u.screen_views, u.ipo_views, u.insight_views, u.tools_used ?? [], u.tool_completions, u.leads, u.external_links, u.watchlist_adds, u.last_screen, u.last_perspective].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audience-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: text });
        }}
        className="flex flex-wrap items-center gap-2 mt-4"
      >
        <div className="inline-flex rounded-[10px] border border-line-strong bg-white p-0.5">
          {[
            ["", "All"],
            ["investor", "Investors"],
            ["business", "Business owners"],
            ["unknown", "Not chosen"],
          ].map(([v, l]) => (
            <button key={v} type="button" onClick={() => apply({ audience: v })} className={`h-8 px-3 rounded-[8px] text-[13px] transition ${filters.audience === v ? "bg-navy text-white" : "text-ink-2 hover:bg-navy-soft"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field h-9 !w-[260px] !pl-9" placeholder="Name, email, company or phone" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <span className="text-ink-3 text-[13px] ml-auto num">
          {users.length} {users.length === 1 ? "person" : "people"} · {rangeLabel}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={exportCsv} disabled={!users.length}>
          <Download size={14} /> Export CSV
        </Button>
      </form>

      <Card padded={false} className="mt-4 overflow-x-auto">
        {users.length === 0 ? (
          <EmptyState title="Nobody in this range" message={filters.q || filters.audience ? "Nothing matches these filters." : "People appear here as soon as the tracked app build is used."} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Audience</th>
                <th>Company</th>
                <th>Last seen</th>
                <th>First seen</th>
                <th className="text-right">Sessions</th>
                <th className="text-right">Screens</th>
                <th className="text-right">IPOs</th>
                <th>Tools used</th>
                <th className="text-right">Done</th>
                <th className="text-right">Leads</th>
                <th>Last screen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id ?? u.device_id ?? Math.random()} className="clickable" onClick={() => setOpen(u)}>
                  <td>
                    <div className="font-medium">{userLabel(u)}</div>
                    <div className="text-[12px] text-ink-3">{[u.email && u.display_name ? u.email : null, u.phone, u.platform].filter(Boolean).join(" · ") || "—"}</div>
                  </td>
                  <td>
                    <Badge tone={audienceTone(u.audience)}>{AUDIENCE_LABEL[u.audience] ?? u.audience}</Badge>
                  </td>
                  <td className="text-ink-2">{u.company_name ?? "—"}</td>
                  <td className="num whitespace-nowrap">{dateTime(u.last_seen)}</td>
                  <td className="num whitespace-nowrap text-ink-3">{dateTime(u.first_seen)}</td>
                  <td className="text-right num">{fmtInt(u.sessions)}</td>
                  <td className="text-right num">{fmtInt(u.screen_views)}</td>
                  <td className="text-right num">{fmtInt(u.ipo_views)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1 max-w-[220px]">
                      {(u.tools_used ?? []).length ? (u.tools_used ?? []).map((t) => <Badge key={t} tone="neutral">{toolLabel(t)}</Badge>) : <span className="text-ink-3">—</span>}
                    </div>
                  </td>
                  <td className="text-right num">{fmtInt(u.tool_completions)}</td>
                  <td className="text-right num">{u.leads > 0 ? <Badge tone="gold">{fmtInt(u.leads)}</Badge> : "0"}</td>
                  <td className="text-ink-2 whitespace-nowrap">{screenLabel(u.last_screen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {open ? <UserDrawer user={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

export function UserDrawer({ user, onClose }: { user: AnalyticsUserRow; onClose: () => void }) {
  const [events, setEvents] = useState<AnalyticsUserEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user.user_id) {
      setEvents([]);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error: err } = await supabaseBrowser().rpc("analytics_user_events", { p_user_id: user.user_id, p_limit: 400 });
      if (!alive) return;
      if (err) setError(err.message);
      setEvents((data ?? []) as AnalyticsUserEventRow[]);
    })();
    return () => {
      alive = false;
    };
  }, [user.user_id]);

  const sessions = useMemo(() => {
    const groups: { id: string; start: string; end: string; events: AnalyticsUserEventRow[] }[] = [];
    (events ?? []).forEach((e) => {
      const id = e.session_id ?? "unknown";
      const g = groups.find((x) => x.id === id);
      if (g) {
        g.events.push(e);
        g.start = e.created_at;
      } else groups.push({ id, start: e.created_at, end: e.created_at, events: [e] });
    });
    return groups;
  }, [events]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-navy-deep/30" onClick={onClose} />
      <aside className="relative w-full max-w-[640px] h-full bg-paper border-l border-line overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-paper/95 backdrop-blur border-b border-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[20px] leading-tight">{userLabel(user)}</h2>
            <p className="text-[12.5px] text-ink-3 mt-0.5">
              {[AUDIENCE_LABEL[user.audience] ?? user.audience, user.is_anonymous ? "guest account" : "signed in", user.platform, user.app_version ? `v${user.app_version}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
            <p><span className="text-ink-3">Email · </span>{user.email ?? "—"}</p>
            <p><span className="text-ink-3">Phone · </span>{user.phone ?? "—"}</p>
            <p><span className="text-ink-3">Company · </span>{user.company_name ?? "—"}</p>
            <p><span className="text-ink-3">City · </span>{user.city ?? "—"}</p>
            <p><span className="text-ink-3">First seen · </span>{dateTime(user.first_seen)}</p>
            <p><span className="text-ink-3">Last seen · </span>{dateTime(user.last_seen)}</p>
            <p><span className="text-ink-3">Last view · </span>{user.last_perspective ? (user.last_perspective === "business" ? "Business" : "Investor") : "—"}</p>
            <p><span className="text-ink-3">User ID · </span><code className="text-[11.5px]">{user.user_id ?? "—"}</code></p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Sessions", user.sessions],
              ["Screen views", user.screen_views],
              ["IPO views", user.ipo_views],
              ["Insights read", user.insight_views],
              ["Tools done", user.tool_completions],
              ["Leads", user.leads],
              ["Links opened", user.external_links],
              ["Watchlisted", user.watchlist_adds],
            ].map(([l, v]) => (
              <Card key={String(l)} className="!p-3">
                <p className="text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{l}</p>
                <p className="display text-[20px] num mt-1">{fmtInt(Number(v))}</p>
              </Card>
            ))}
          </div>

          <div>
            <p className="label">Timeline · newest session first</p>
            <ErrorBanner message={error} />
            {events === null ? (
              <p className="text-[13px] text-ink-3">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="text-[13px] text-ink-3">No events recorded for this person.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s, i) => {
                  const hidden = collapsed[s.id] ?? i > 2;
                  return (
                    <div key={s.id} className="bg-white border border-line rounded-[10px]">
                      <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [s.id]: !hidden }))} className="w-full flex items-center gap-2 px-4 h-10 text-[13px] text-left">
                        {hidden ? <ChevronRight size={14} className="text-ink-3" /> : <ChevronDown size={14} className="text-ink-3" />}
                        <span className="font-medium">Session {sessions.length - i}</span>
                        <span className="text-ink-3 num">{dateTime(s.start)}</span>
                        <span className="text-ink-3 ml-auto num">{s.events.length} events</span>
                      </button>
                      {!hidden ? (
                        <ol className="border-t border-line divide-y divide-line">
                          {[...s.events].reverse().map((e) => (
                            <li key={e.id} className="px-4 py-2 grid grid-cols-[64px_1fr] gap-3 text-[13px]">
                              <span className="num text-ink-3 text-[12px] pt-0.5">{new Date(e.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                              <span>
                                <Badge tone={eventTone(e.event)} className="mr-2 !h-[18px] !text-[10.5px]">{e.event.replace(/_/g, " ")}</Badge>
                                {describeEvent(e)}
                                {e.screen && e.event !== "screen_view" ? <span className="text-ink-3"> · on {screenLabel(e.screen)}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
