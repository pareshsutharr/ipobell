import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, LinkButton, PageHeader, statusTone } from "@/components/ui";
import { crore, dateRange, dateShort } from "@/lib/format";
import { ADMIN_DATA_COLUMNS, missingFields, type IpoAdminData } from "@/lib/ipo-admin-data";
import { supabaseServer } from "@/lib/supabase/server";
import { IPO_LIST_COLUMNS, type InsightStatus, type IpoRow } from "@/lib/types";

import { IpoFilters } from "./IpoFilters";

export const metadata = { title: "IPOs & insights" };

const STATUS_ORDER = ["open", "upcoming", "closed", "listed"];

export default async function IposPage({ searchParams }: PageProps<"/ipos">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const board = typeof sp.board === "string" ? sp.board : "";
  const insight = typeof sp.insight === "string" ? sp.insight : "";
  const data = typeof sp.data === "string" ? sp.data : "";

  const supabase = await supabaseServer();
  const listQuery = (columns: string) => {
    let query = supabase.from("ipos").select(columns).order("open_date", { ascending: false, nullsFirst: false }).limit(300);
    if (q) query = query.ilike("name", `%${q}%`);
    if (status) query = query.eq("status", status);
    if (board) query = query.eq("board", board);
    return query;
  };
  // The team-entered data comes back with each IPO in the same request (one row per IPO, so it cannot be cut off
  // by the 1000-row API limit). If that table is not in the database yet, load the list without it.
  const [withData, { data: insights }] = await Promise.all([listQuery(`${IPO_LIST_COLUMNS}, ipo_admin_data(${ADMIN_DATA_COLUMNS})`), supabase.from("ipo_insights").select("ipo_id, status")]);
  const { data: ipos, error } = withData.error ? await listQuery(IPO_LIST_COLUMNS) : withData;
  const adminBy = new Map<string, IpoAdminData>();
  for (const r of (ipos ?? []) as unknown as (IpoRow & { ipo_admin_data?: IpoAdminData | IpoAdminData[] | null })[]) {
    const d = Array.isArray(r.ipo_admin_data) ? r.ipo_admin_data[0] : r.ipo_admin_data;
    if (d) adminBy.set(r.id, d);
  }

  const insightBy = new Map<string, InsightStatus>((insights ?? []).map((r) => [r.ipo_id as string, r.status as InsightStatus]));
  let rows = ((ipos ?? []) as unknown as IpoRow[]).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  if (insight === "none") rows = rows.filter((r) => !insightBy.has(r.id));
  if (insight === "draft" || insight === "published") rows = rows.filter((r) => insightBy.get(r.id) === insight);
  if (data === "incomplete") rows = rows.filter((r) => missingFields(adminBy.get(r.id)).length > 0);
  if (data === "complete") rows = rows.filter((r) => missingFields(adminBy.get(r.id)).length === 0);
  const incompleteCount = ((ipos ?? []) as unknown as IpoRow[]).filter((r) => missingFields(adminBy.get(r.id)).length > 0).length;

  return (
    <>
      <PageHeader
        title="IPOs & insights"
        subtitle="Every issue in the database. Open one to enter its state and sector or to write its Business Insight."
        actions={<LinkButton href="/ipos/import">Import state &amp; sector (CSV)</LinkButton>}
      />
      <IpoFilters q={q} status={status} board={board} insight={insight} data={data} />
      {incompleteCount > 0 ? (
        <p className="text-[13px] text-ink-3 mt-3">
          {incompleteCount} of the {(ipos ?? []).length} IPOs shown {incompleteCount === 1 ? "has" : "have"} no state, sector or listing platform yet. The app shows those as “Not specified”.
        </p>
      ) : null}
      <ErrorBanner message={error?.message ?? null} />
      <Card padded={false} className="mt-4 overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="No IPOs match" message={q ? `Nothing named like “${q}”. Try a shorter search.` : "The sync has not loaded any issues for this filter yet."} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Company</th>
                <th>Board</th>
                <th>Status</th>
                <th>Open – close</th>
                <th>Listing</th>
                <th className="text-right">Issue size</th>
                <th>Data</th>
                <th>Insight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ins = insightBy.get(r.id);
                const missing = missingFields(adminBy.get(r.id));
                return (
                  <tr key={r.id} className="clickable">
                    <td>
                      <Link href={`/ipos/${r.id}` as never} className="flex items-center gap-3">
                        <Logo url={r.logo_url} name={r.name} />
                        <span className="font-medium">{r.display_name ?? r.name}</span>
                      </Link>
                    </td>
                    <td className="text-ink-2">{r.board === "sme" ? (r.sub_type && /nse/i.test(r.sub_type) ? "NSE SME" : r.sub_type && /bse/i.test(r.sub_type) ? "BSE SME" : "SME") : "Mainboard"}</td>
                    <td>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="num text-ink-2 whitespace-nowrap">{r.dates_tba ? "TBA" : dateRange(r.open_date, r.close_date)}</td>
                    <td className="num text-ink-2 whitespace-nowrap">{dateShort(r.listing_date)}</td>
                    <td className="num text-right whitespace-nowrap">{crore(r.issue_size_cr)}</td>
                    <td>
                      {missing.length === 0 ? (
                        <Badge tone="green">Complete</Badge>
                      ) : (
                        <span title={`Missing: ${missing.join(", ")}`}>
                          <Badge tone="amber">Incomplete</Badge>
                        </span>
                      )}
                    </td>
                    <td>{ins ? <Badge tone={statusTone(ins)}>{ins}</Badge> : <span className="text-ink-3 text-[12px]">none</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

function Logo({ url, name }: { url: string | null; name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="w-8 h-8 rounded-[8px] border border-line bg-white flex items-center justify-center overflow-hidden shrink-0 text-[11px] font-medium text-ink-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="w-6 h-6 object-contain" /> : initials}
    </span>
  );
}
