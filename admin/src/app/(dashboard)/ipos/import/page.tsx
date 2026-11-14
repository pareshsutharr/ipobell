import Link from "next/link";

import { AdminDataImport } from "@/components/ipo/AdminDataImport";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { ADMIN_DATA_COLUMNS, type IpoAdminData, type IpoRef } from "@/lib/ipo-admin-data";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Import IPO data" };

const PAGE = 1000; // the API returns at most 1000 rows per request

export default async function ImportIpoDataPage() {
  const supabase = await supabaseServer();
  const ipos: IpoRef[] = [];
  const existing: IpoAdminData[] = [];
  let error: string | null = null;

  for (let from = 0; ; from += PAGE) {
    const { data, error: err } = await supabase.from("ipos").select("id, slug, name, display_name").order("open_date", { ascending: false, nullsFirst: false }).order("slug").range(from, from + PAGE - 1);
    if (err) {
      error = err.message;
      break;
    }
    ipos.push(...((data ?? []) as IpoRef[]));
    if (!data || data.length < PAGE) break;
  }
  for (let from = 0; !error; from += PAGE) {
    const { data, error: err } = await supabase.from("ipo_admin_data").select(ADMIN_DATA_COLUMNS).order("ipo_id").range(from, from + PAGE - 1);
    if (err) {
      error = /ipo_admin_data|schema cache/i.test(err.message) ? "The ipo_admin_data table is not in the database yet. Apply the migration 20261114000600_ipo_admin_data.sql." : err.message;
      break;
    }
    existing.push(...((data ?? []) as unknown as IpoAdminData[]));
    if (!data || data.length < PAGE) break;
  }

  return (
    <>
      <Link href="/ipos" className="text-[13px] text-ink-3 hover:text-ink">
        ← IPOs & insights
      </Link>
      <div className="mt-2">
        <PageHeader title="Import IPO data" subtitle="Fill in state, sector, industry and listing platform for many IPOs at once." />
      </div>
      <ErrorBanner message={error} />
      {!error ? <AdminDataImport ipos={ipos} existing={existing} /> : null}
    </>
  );
}
