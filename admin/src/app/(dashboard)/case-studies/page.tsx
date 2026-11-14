import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, LinkButton, PageHeader } from "@/components/ui";
import type { CaseStudyRow } from "@/lib/case-studies";
import { dateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Case studies" };

export default async function CaseStudiesPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("case_studies").select("id, slug, status, title, exchange, listing_year, city, sort_order, published_at, updated_at").order("sort_order").order("updated_at", { ascending: false });
  const rows = (data ?? []) as Pick<CaseStudyRow, "id" | "slug" | "status" | "title" | "exchange" | "listing_year" | "city" | "sort_order" | "published_at" | "updated_at">[];
  const missing = error && /case_studies|schema cache/i.test(error.message);

  return (
    <>
      <PageHeader title="Case studies" subtitle="Stories of companies that listed, shown on the Get Listed tab of the app." actions={<LinkButton href="/case-studies/new" variant="primary">New case study</LinkButton>} />
      <ErrorBanner message={missing ? "Case studies are not set up in the database yet. Apply the migration 20261114001300_case_studies.sql. Until then the app shows its one built-in case study." : (error?.message ?? null)} />
      <Card padded={false} className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title="No case studies yet" message="Write the first one. It appears in the app as soon as you publish it." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Exchange</th>
                <th>Listed</th>
                <th>City</th>
                <th className="text-right">Order</th>
                <th>Status</th>
                <th>Last changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable">
                  <td>
                    <Link href={`/case-studies/${r.id}` as never} className="font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td className="text-ink-2">{r.exchange ?? "—"}</td>
                  <td className="num text-ink-2">{r.listing_year ?? "—"}</td>
                  <td className="text-ink-2">{r.city ?? "—"}</td>
                  <td className="num text-right">{r.sort_order}</td>
                  <td>
                    <Badge tone={r.status === "published" ? "green" : "navy"}>{r.status}</Badge>
                  </td>
                  <td className="num text-ink-2 whitespace-nowrap">{dateTime(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
