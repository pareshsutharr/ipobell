import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, LinkButton, Stat, statusTone } from "@/components/ui";
import { daysAgo, dateRange, dateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";
import { LEAD_SOURCE_LABEL, type IpoRow, type LeadRow } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const supabase = await supabaseServer();

  const [leads7, leadsAll, published, drafts, liveIpos, insightIds, recent] = await Promise.all([
    supabase.from("business_leads").select("id", { count: "exact", head: true }).gte("created_at", daysAgo(7)),
    supabase.from("business_leads").select("id", { count: "exact", head: true }),
    supabase.from("ipo_insights").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("ipo_insights").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("ipos").select("id, slug, name, display_name, board, status, open_date, close_date").in("status", ["upcoming", "open"]).order("open_date", { ascending: true, nullsFirst: false }).limit(60),
    supabase.from("ipo_insights").select("ipo_id"),
    supabase.from("business_leads").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  const error = [leads7, leadsAll, published, drafts, liveIpos, insightIds, recent].find((r) => r.error)?.error?.message ?? null;
  const covered = new Set((insightIds.data ?? []).map((r) => r.ipo_id as string));
  const missing = ((liveIpos.data ?? []) as Pick<IpoRow, "id" | "slug" | "name" | "display_name" | "board" | "status" | "open_date" | "close_date">[]).filter((i) => !covered.has(i.id));
  const leads = (recent.data ?? []) as LeadRow[];

  return (
    <>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-[26px] leading-tight">Overview</h1>
          <p className="text-ink-3 mt-1">What the app brought in, and what still needs writing.</p>
        </div>
      </div>
      {sp.error === "forbidden" ? <div className="mb-4"><ErrorBanner message="Only the super admin can manage team access." /></div> : null}
      <ErrorBanner message={error ? `Could not load everything: ${error}. Has the latest migration been applied?` : null} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
        <Stat label="New leads · 7 days" value={leads7.count ?? 0} hint="From the readiness, eligibility, size and call forms" />
        <Stat label="Leads · all time" value={leadsAll.count ?? 0} />
        <Stat label="Insights published" value={published.count ?? 0} hint={`${drafts.count ?? 0} in draft`} />
        <Stat label="Live IPOs without an insight" value={missing.length} hint="Upcoming and open issues" />
      </div>

      <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6 mt-6">
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="text-[17px]">Recent leads</h2>
            <LinkButton href="/leads" size="sm">
              All leads
            </LinkButton>
          </div>
          {leads.length === 0 ? (
            <EmptyState title="No leads yet" message="Leads appear here the moment someone submits a form in the app." />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Source</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className="num text-ink-3 whitespace-nowrap">{dateTime(l.created_at)}</td>
                    <td>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-ink-3 text-[12px]">{l.company_name ?? l.phone ?? l.email ?? "—"}</p>
                    </td>
                    <td className="text-ink-2">{LEAD_SOURCE_LABEL[l.source] ?? l.source}</td>
                    <td>
                      <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-line">
            <h2 className="text-[17px]">Needs an insight</h2>
            <LinkButton href="/ipos" size="sm">
              All IPOs
            </LinkButton>
          </div>
          {missing.length === 0 ? (
            <EmptyState title="Every live IPO has an insight" message="Nice. New issues appear here as the sync picks them up." />
          ) : (
            <ul>
              {missing.slice(0, 10).map((i) => (
                <li key={i.id} className="border-b border-line last:border-0">
                  <Link href={`/ipos/${i.id}` as never} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#f4f2ec] transition">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{i.display_name ?? i.name}</p>
                      <p className="text-ink-3 text-[12px]">
                        {i.board === "sme" ? "SME" : "Mainboard"} · {dateRange(i.open_date, i.close_date)}
                      </p>
                    </div>
                    <Badge tone={statusTone(i.status)}>{i.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
