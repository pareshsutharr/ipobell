"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge, Button, Card, EmptyState, ErrorBanner } from "@/components/ui";
import { compactProps, describeEvent, eventTone, screenLabel, shortId, userLabel } from "@/lib/analytics-format";
import { dateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { ANALYTICS_EVENTS, type AnalyticsEventRow } from "@/lib/types";

type Person = { display_name: string | null; email: string | null; is_anonymous: boolean; role?: string | null };

export function EventsExplorer({ initial, people: initialPeople, range, eventFilter, audience = "", pageSize }: { initial: AnalyticsEventRow[]; people: Record<string, Person>; range: { from: string; to: string }; eventFilter: string; audience?: string; pageSize: number }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [rows, setRows] = useState(initial);
  const [people, setPeople] = useState(initialPeople);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(initial.length < pageSize);

  const names = useMemo(() => Array.from(new Set<string>([...ANALYTICS_EVENTS, ...rows.map((r) => r.event)])).sort(), [rows]);

  const setEvent = (v: string) => {
    const next = new URLSearchParams(sp.toString());
    v ? next.set("event", v) : next.delete("event");
    router.replace(`${path}${next.size ? `?${next.toString()}` : ""}` as never);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const byAudience = audience ? rows.filter((r) => (r.role ?? people[r.user_id ?? ""]?.role ?? "unknown") === audience) : rows;
    if (!needle) return byAudience;
    return byAudience.filter((r) => {
      const hay = `${r.event} ${r.screen ?? ""} ${JSON.stringify(r.props)} ${r.perspective ?? ""} ${r.platform ?? ""} ${r.user_id ?? ""} ${people[r.user_id ?? ""]?.email ?? ""} ${people[r.user_id ?? ""]?.display_name ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, people, audience]);

  async function loadMore() {
    setLoading(true);
    setError(null);
    const sb = supabaseBrowser();
    let query = sb.from("analytics_events").select("*").gte("created_at", range.from).lt("created_at", range.to).order("created_at", { ascending: false }).range(rows.length, rows.length + pageSize - 1);
    if (eventFilter) query = query.eq("event", eventFilter);
    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const more = (data ?? []) as AnalyticsEventRow[];
    const unknown = Array.from(new Set(more.map((r) => r.user_id).filter((x): x is string => Boolean(x) && !people[x as string])));
    if (unknown.length) {
      const { data: profiles } = await sb.from("profiles").select("id, display_name, email, is_anonymous, role").in("id", unknown);
      const add: Record<string, Person> = {};
      (profiles ?? []).forEach((p: { id: string; display_name: string | null; email: string | null; is_anonymous: boolean; role: string | null }) => {
        add[p.id] = { display_name: p.display_name, email: p.email, is_anonymous: p.is_anonymous, role: p.role };
      });
      setPeople((prev) => ({ ...prev, ...add }));
    }
    setRows((r) => [...r, ...more]);
    setDone(more.length < pageSize);
    setLoading(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select className="field h-9 !w-auto pr-8" value={eventFilter} onChange={(e) => setEvent(e.target.value)}>
          <option value="">All events</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field h-9 !w-[300px] !pl-9" placeholder="Filter loaded rows: slug, tool, email, screen…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-ink-3 text-[13px] ml-auto num">
          {filtered.length} of {rows.length} loaded{audience ? " · audience filter applies to loaded rows" : ""}
        </span>
      </div>
      <div className="mt-3">
        <ErrorBanner message={error} />
      </div>

      <Card padded={false} className="mt-3 overflow-x-auto">
        {filtered.length === 0 ? (
          <EmptyState title="No events" message={rows.length ? "Nothing matches the text filter." : "Nothing recorded in this range yet."} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Time</th>
                <th>Person</th>
                <th>Event</th>
                <th>What happened</th>
                <th>Screen</th>
                <th>Props</th>
                <th>View</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const p = r.user_id ? people[r.user_id] : undefined;
                return (
                  <tr key={r.id}>
                    <td className="num whitespace-nowrap text-ink-3">{dateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap" title={r.user_id ?? undefined}>
                      {p ? userLabel({ ...p, user_id: r.user_id }) : `Guest · ${shortId(r.user_id)}`}
                    </td>
                    <td>
                      <Badge tone={eventTone(r.event)}>{r.event.replace(/_/g, " ")}</Badge>
                    </td>
                    <td className="max-w-[320px]">{describeEvent(r)}</td>
                    <td className="text-ink-2 whitespace-nowrap">{screenLabel(r.screen)}</td>
                    <td className="text-[12px] text-ink-3 max-w-[300px] truncate" title={JSON.stringify(r.props)}>
                      {compactProps(r.props) || "—"}
                    </td>
                    <td className="text-ink-2">{r.perspective ?? "—"}</td>
                    <td className="text-ink-2">
                      {r.platform ?? "—"}
                      {r.app_version ? <span className="text-ink-3"> · {r.app_version}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {!done ? (
        <div className="flex justify-center mt-4">
          <Button variant="secondary" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : `Load ${pageSize} more`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
