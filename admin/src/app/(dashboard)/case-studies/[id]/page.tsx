import Link from "next/link";
import { notFound } from "next/navigation";

import { CaseStudyEditor } from "@/components/case-studies/CaseStudyEditor";
import { ErrorBanner } from "@/components/ui";
import { emptyCaseStudy, type CaseStudyDraft, type CaseStudyRow } from "@/lib/case-studies";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Case study" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CaseStudyPage({ params }: PageProps<"/case-studies/[id]">) {
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !UUID.test(id)) notFound();

  let initial: CaseStudyDraft = emptyCaseStudy();
  let error: string | null = null;
  if (!isNew) {
    const supabase = await supabaseServer();
    const { data, error: err } = await supabase.from("case_studies").select("*").eq("id", id).maybeSingle();
    if (err) error = err.message;
    else if (!data) notFound();
    else {
      const r = data as CaseStudyRow;
      initial = { slug: r.slug, status: r.status, title: r.title, exchange: r.exchange, listing_year: r.listing_year, city: r.city, summary: r.summary, body: r.body, highlights: Array.isArray(r.highlights) ? r.highlights : [], hero_image_url: r.hero_image_url, ipo_id: r.ipo_id, sort_order: r.sort_order };
    }
  }

  return (
    <>
      <Link href="/case-studies" className="text-[13px] text-ink-3 hover:text-ink">
        ← Case studies
      </Link>
      <h1 className="text-[26px] leading-tight mt-2 mb-6">{isNew ? "New case study" : initial.title || "Case study"}</h1>
      <ErrorBanner message={error} />
      {!error ? <CaseStudyEditor id={isNew ? null : id} initial={initial} /> : null}
    </>
  );
}
