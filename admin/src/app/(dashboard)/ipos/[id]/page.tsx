import Link from "next/link";
import { notFound } from "next/navigation";

import { InsightEditor } from "@/components/insight/InsightEditor";
import { IpoAdminDataForm } from "@/components/ipo/IpoAdminDataForm";
import { IpoDocuments, type IpoDocumentRow } from "@/components/ipo/IpoDocuments";
import { SummaryEditor, type SummaryInitial } from "@/components/ipo/SummaryEditor";
import { Badge, ErrorBanner, statusTone } from "@/components/ui";
import { crore, dateRange, dateShort, inr, pct } from "@/lib/format";
import { ADMIN_DATA_COLUMNS, normalizeSector, normalizeState, suggestPlatform, type IpoAdminData } from "@/lib/ipo-admin-data";
import { requireAdmin } from "@/lib/auth";
import { emptySummary, type FundUse, type RiskItem } from "@/lib/drhp-summary";
import { canPublish } from "@/lib/review";
import { supabaseServer } from "@/lib/supabase/server";
import { IPO_LIST_COLUMNS, type InsightRow, type IpoRow } from "@/lib/types";

export const metadata = { title: "Insight editor" };

export default async function IpoInsightPage({ params }: PageProps<"/ipos/[id]">) {
  const { id } = await params;
  const { admin } = await requireAdmin();
  const mayPublish = canPublish(admin.role);
  const supabase = await supabaseServer();
  const [{ data: ipo, error }, { data: insight, error: insErr }, { data: adminData }, { data: documents, error: docsErr }, { data: summary, error: sumErr }] = await Promise.all([
    supabase.from("ipos").select(IPO_LIST_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("ipo_insights").select("*").eq("ipo_id", id).maybeSingle(),
    // A missing table (migration not applied yet) just means "nothing entered"; the form explains it on save.
    supabase.from("ipo_admin_data").select(ADMIN_DATA_COLUMNS).eq("ipo_id", id).maybeSingle(),
    supabase.from("ipo_documents_admin").select("id, doc_type, version, is_current, file_path, file_name, file_size, page_count, pages_with_text, text_status, text_error, created_at").eq("ipo_id", id).order("doc_type").order("version", { ascending: false }),
    supabase.from("ipo_drhp_summaries").select("status, short_md, long_md, use_of_funds, risks, source_document_id, ai_drafted, published_at").eq("ipo_id", id).maybeSingle(),
  ]);
  const summaryInitial: SummaryInitial = summary
    ? {
        exists: true,
        status: summary.status as "draft" | "published",
        publishedAt: (summary.published_at as string | null) ?? null,
        draft: {
          short_md: (summary.short_md as string | null) ?? "",
          long_md: (summary.long_md as string | null) ?? "",
          use_of_funds: Array.isArray(summary.use_of_funds) ? (summary.use_of_funds as FundUse[]) : [],
          risks: Array.isArray(summary.risks) ? (summary.risks as RiskItem[]) : [],
          source_document_id: (summary.source_document_id as string | null) ?? null,
          ai_drafted: Boolean(summary.ai_drafted),
        },
      }
    : { exists: false, status: "draft", publishedAt: null, draft: emptySummary() };
  const hasReadableDocument = ((documents ?? []) as IpoDocumentRow[]).some((d) => d.is_current && d.text_status === "done");
  if (!ipo && !error) notFound();

  const row = ipo as IpoRow | null;
  const facts: [string, string][] = row
    ? [
        ["Price band", row.price_band ? `₹${row.price_band}` : "TBA"],
        ["Issue size", crore(row.issue_size_cr)],
        ["Lot", row.lot_size ? `${row.lot_size} sh · ${inr(row.min_investment)}` : "—"],
        ["Dates", row.dates_tba ? "TBA" : dateRange(row.open_date, row.close_date)],
        ["Listing", dateShort(row.listing_date)],
        row.status === "listed" ? ["Listing gain", pct(row.listing_gain_percent)] : ["GMP", row.gmp === null ? "—" : `${inr(row.gmp)} (${pct(row.gmp_percent)})`],
      ]
    : [];

  return (
    <>
      <div className="mb-6">
        <Link href="/ipos" className="text-[13px] text-ink-3 hover:text-ink">
          ← IPOs & insights
        </Link>
        {row ? (
          <div className="flex items-start justify-between gap-6 mt-2">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[26px] leading-tight">{row.display_name ?? row.name}</h1>
                <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                <Badge>{row.board === "sme" ? row.sub_type ?? "SME" : "Mainboard"}</Badge>
              </div>
              <p className="text-ink-3 mt-1">Facts below come from the IPO data feed. The insight you write sits on top of them in the app.</p>
            </div>
          </div>
        ) : null}
      </div>
      <ErrorBanner message={error?.message ?? insErr?.message ?? null} />
      {row ? (
        <>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-line border border-line rounded-[14px] overflow-hidden mb-6">
            {facts.map(([k, v]) => (
              <div key={k} className="bg-white px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{k}</p>
                <p className="num font-medium mt-1 text-[13.5px]">{v}</p>
              </div>
            ))}
          </div>
          <IpoAdminDataForm
            ipoId={row.id}
            initial={(adminData as unknown as IpoAdminData | null) ?? null}
            suggestions={{
              // Offered as one-click suggestions only; nothing is saved until the editor presses Save.
              state: normalizeState((insight as InsightRow | null)?.location_state ?? ""),
              stateFrom: "the insight",
              sector: normalizeSector((insight as InsightRow | null)?.sector ?? ""),
              sectorFrom: "the insight",
              listing_platform: suggestPlatform(row.board, row.sub_type),
              platformFrom: "the data feed",
            }}
          />
          <IpoDocuments ipoId={row.id} initial={(documents ?? []) as IpoDocumentRow[]} notSetUp={Boolean(docsErr && /ipo_documents_admin|schema cache/i.test(docsErr.message))} />
          <SummaryEditor ipoId={row.id} initial={summaryInitial} canPublish={mayPublish} hasDocument={hasReadableDocument} notSetUp={Boolean(sumErr && /ipo_drhp_summaries|schema cache/i.test(sumErr.message))} />
          <InsightEditor ipo={row} initial={(insight as InsightRow | null) ?? null} canPublish={mayPublish} />
        </>
      ) : null}
    </>
  );
}
