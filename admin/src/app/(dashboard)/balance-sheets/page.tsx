import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { croreText, daysLeft, FIGURE_COLUMNS, readFigures } from "@/lib/balance-sheets";
import { dateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Balance sheets" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  file_kind: string;
  figures: unknown;
  figures_source: "file" | "typed";
  created_at: string;
  expires_at: string;
}

interface LeadRow {
  id: string;
  user_id: string | null;
  name: string;
  company_name: string | null;
  phone: string | null;
  created_at: string;
}

export default async function BalanceSheetsPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("balance_sheet_reports").select("id, user_id, file_name, file_size, file_kind, figures, figures_source, created_at, expires_at").order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Row[];
  const userIds = [...new Set(rows.map((r) => r.user_id))].slice(0, 200);
  const { data: leadData } = userIds.length ? await supabase.from("business_leads").select("id, user_id, name, company_name, phone, created_at").in("user_id", userIds).order("created_at", { ascending: false }).limit(500) : { data: [] };
  // the newest lead of each person, so a report can be tied to a name and a company
  const leadByUser = new Map<string, LeadRow>();
  for (const l of (leadData ?? []) as LeadRow[]) if (l.user_id && !leadByUser.has(l.user_id)) leadByUser.set(l.user_id, l);
  const missing = error && /balance_sheet_reports|schema cache/i.test(error.message);

  return (
    <>
      <PageHeader title="Balance sheets" subtitle="Statements that business owners chose to save from the app's balance sheet check. The owner agreed that the advisory team may open them. Each is deleted after 90 days, or sooner if the owner deletes it." />
      <ErrorBanner message={missing ? "Balance sheets are not set up in the database yet. Apply the migration 20261116000100_balance_sheets.sql and deploy the purge-balance-sheets function." : (error?.message ?? null)} />
      <p className="text-ink-3 text-[13px] mb-4">Open a file only to prepare for a call with that business owner. Do not forward the files or keep copies after the engagement ends: the owner was told they are deleted after 90 days.</p>
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="No saved balance sheets" message="Reports appear here when a business owner saves one in the app (Get Listed → Balance Sheet Check)." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const lead = leadByUser.get(r.user_id);
              const years = readFigures(r.figures);
              return (
                <li key={r.id} className="px-5 py-4">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{r.file_name}</p>
                          <p className="text-ink-3 text-[12.5px] mt-1">
                            {dateTime(r.created_at)} ·{" "}
                            {lead ? (
                              <Link href="/leads" className="hover:underline" title="Open Leads">
                                {lead.name}
                                {lead.company_name ? `, ${lead.company_name}` : ""}
                              </Link>
                            ) : (
                              "no lead from this person yet"
                            )}{" "}
                            · {Math.max(1, Math.round(r.file_size / 1024))} KB · deleted in {daysLeft(r.expires_at)} days
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge tone={r.figures_source === "file" ? "green" : "amber"}>{r.figures_source === "file" ? "Figures read from file" : "Figures typed"}</Badge>
                          <a href={`/api/balance-sheets/${r.id}/download`} className="h-8 px-3 inline-flex items-center rounded-[10px] text-[13px] border bg-white text-ink-2 border-line-strong hover:border-ink-3">
                            Download {r.file_kind.toUpperCase()}
                          </a>
                        </div>
                      </div>
                    </summary>
                    {years.length === 0 ? (
                      <p className="mt-3 text-[13.5px] text-ink-3">No figures were saved with this file.</p>
                    ) : (
                      <div className="mt-3 overflow-x-auto">
                        <table className="text-[13px] w-full">
                          <thead>
                            <tr className="text-left text-ink-3">
                              <th className="py-1.5 pr-4 font-medium">As checked by the owner (₹ crore)</th>
                              {years.map((y) => (
                                <th key={y.label} className="py-1.5 pr-4 font-medium text-right">
                                  {y.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {FIGURE_COLUMNS.map(([key, label]) => (
                              <tr key={key} className="border-t border-line">
                                <td className="py-1.5 pr-4">{label}</td>
                                {years.map((y) => (
                                  <td key={y.label} className={`py-1.5 pr-4 text-right tabular-nums ${y.values[key] === null ? "text-ink-3" : ""}`}>
                                    {croreText(y.values[key])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
