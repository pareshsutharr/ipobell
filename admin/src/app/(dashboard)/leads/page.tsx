import { LeadsTable } from "@/components/leads/LeadsTable";
import { ErrorBanner, PageHeader } from "@/components/ui";
import { supabaseServer } from "@/lib/supabase/server";
import type { LeadRow } from "@/lib/types";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const source = typeof sp.source === "string" ? sp.source : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await supabaseServer();
  let query = supabase.from("business_leads").select("*").order("created_at", { ascending: false }).limit(500);
  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);
  if (q) query = query.or(`name.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await query;

  return (
    <>
      <PageHeader title="Leads" subtitle="Everyone who asked for a call or shared their details through the app's tools." />
      <ErrorBanner message={error?.message ?? null} />
      <LeadsTable leads={(data ?? []) as LeadRow[]} filters={{ status, source, q }} />
    </>
  );
}
