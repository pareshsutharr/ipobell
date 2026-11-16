import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Change log" };

interface LogRow {
  id: number;
  table_name: string;
  row_key: string;
  ipo_id: string | null;
  action: "insert" | "update" | "delete";
  changed: string[];
  old_status: string | null;
  new_status: string | null;
  actor_email: string | null;
  created_at: string;
}

const TABLE_LABEL: Record<string, string> = {
  ipo_admin_data: "IPO data (state, sector, promotion)",
  feature_switches: "Feature switch",
  ipo_insights: "Business insight",
  ipo_drhp_summaries: "DRHP summary",
  ipo_documents_admin: "Offer document",
  case_studies: "Case study",
  business_rules: "Business rules",
};
const ACTION_LABEL = { insert: "Created", update: "Changed", delete: "Deleted" } as const;

function describe(r: LogRow): string {
  if (r.action === "update" && r.old_status !== r.new_status && r.new_status) {
    if (r.new_status === "published") return "Published";
    if (r.old_status === "published") return "Unpublished";
  }
  if (r.action === "update" && r.changed.length) return `Changed ${r.changed.map((c) => c.replace(/_/g, " ")).join(", ")}`;
  return ACTION_LABEL[r.action];
}

export default async function ChangeLogPage({ searchParams }: PageProps<"/change-log">) {
  const sp = await searchParams;
  const table = typeof sp.table === "string" && sp.table in TABLE_LABEL ? sp.table : "";
  const supabase = await supabaseServer();
  let query = supabase.from("admin_change_log").select("id, table_name, row_key, ipo_id, action, changed, old_status, new_status, actor_email, created_at").order("created_at", { ascending: false }).limit(300);
  if (table) query = query.eq("table_name", table);
  const { data, error } = await query;
  const rows = (data ?? []) as LogRow[];

  const ipoIds = [...new Set(rows.map((r) => r.ipo_id).filter((v): v is string => Boolean(v)))].slice(0, 200);
  const { data: ipos } = ipoIds.length ? await supabase.from("ipos").select("id, name, display_name").in("id", ipoIds) : { data: [] };
  const ipoName = new Map((ipos ?? []).map((i) => [i.id as string, ((i.display_name as string | null) ?? (i.name as string)) as string]));
  const missing = error && /admin_change_log|schema cache/i.test(error.message);

  return (
    <>
      <PageHeader title="Change log" subtitle="Who created, changed, published or deleted content. The latest 300 entries; kept for two years." />
      <div className="flex flex-wrap gap-1 mb-4">
        {[["", "Everything"], ...Object.entries(TABLE_LABEL)].map(([value, label]) => (
          <a key={value} href={value ? `/change-log?table=${value}` : "/change-log"} className={`h-8 px-3 inline-flex items-center rounded-[10px] text-[13px] border ${value === table ? "bg-navy text-white border-navy" : "bg-white text-ink-2 border-line-strong hover:border-ink-3"}`}>
            {label}
          </a>
        ))}
      </div>
      <ErrorBanner message={missing ? "The change log is not set up in the database yet. Apply the migration 20261114001600_review_flow_change_log.sql." : (error?.message ?? null)} />
      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="Nothing logged yet" message="Changes appear here as the team edits IPO data, insights, summaries, documents, case studies and business rules." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Content</th>
                <th>IPO</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="num text-ink-2 whitespace-nowrap">{dateTime(r.created_at)}</td>
                  <td>{r.actor_email ?? <span className="text-ink-3">server job</span>}</td>
                  <td>
                    {describe(r) === "Published" ? <Badge tone="green">Published</Badge> : describe(r) === "Unpublished" ? <Badge tone="amber">Unpublished</Badge> : describe(r) === "Deleted" ? <Badge tone="red">Deleted</Badge> : describe(r)}
                  </td>
                  <td className="text-ink-2">{TABLE_LABEL[r.table_name] ?? r.table_name}</td>
                  <td>
                    {r.ipo_id ? (
                      ipoName.has(r.ipo_id) ? (
                        <Link href={`/ipos/${r.ipo_id}` as never} className="text-navy hover:underline">
                          {ipoName.get(r.ipo_id)}
                        </Link>
                      ) : (
                        <span className="text-ink-3">removed IPO</span>
                      )
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
