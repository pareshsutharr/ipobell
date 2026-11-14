import Link from "next/link";

import { Badge, Card, EmptyState, ErrorBanner, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Questions" };

interface Row {
  id: string;
  ipo_id: string;
  question: string;
  answer: string | null;
  pages: number[];
  outcome: "answered" | "not_found" | "refused" | "error";
  intent: string | null;
  cached: boolean;
  created_at: string;
}

const OUTCOMES: [string, string][] = [
  ["", "All"],
  ["answered", "Answered"],
  ["not_found", "Not in the document"],
  ["refused", "Advice refused"],
  ["error", "Failed"],
];
const TONE = { answered: "green", not_found: "amber", refused: "navy", error: "red" } as const;
const LABEL = { answered: "Answered", not_found: "Not found", refused: "Refused", error: "Failed" } as const;

export default async function QuestionsPage({ searchParams }: PageProps<"/questions">) {
  const sp = await searchParams;
  const outcome = typeof sp.outcome === "string" && OUTCOMES.some(([v]) => v === sp.outcome) ? sp.outcome : "";
  const supabase = await supabaseServer();
  let query = supabase.from("drhp_chat_log").select("id, ipo_id, question, answer, pages, outcome, intent, cached, created_at").order("created_at", { ascending: false }).limit(300);
  if (outcome) query = query.eq("outcome", outcome);
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];
  const ipoIds = [...new Set(rows.map((r) => r.ipo_id))].slice(0, 200);
  const { data: ipos } = ipoIds.length ? await supabase.from("ipos").select("id, name, display_name").in("id", ipoIds) : { data: [] };
  const ipoName = new Map((ipos ?? []).map((i) => [i.id as string, ((i.display_name as string | null) ?? (i.name as string)) as string]));
  const missing = error && /drhp_chat_log|schema cache/i.test(error.message);
  const notFound = rows.filter((r) => r.outcome === "not_found").length;

  return (
    <>
      <PageHeader title="Questions" subtitle="What people ask the offer documents in the app. The latest 300; kept for one year." />
      <div className="flex flex-wrap gap-1 mb-4">
        {OUTCOMES.map(([value, label]) => (
          <a key={value} href={value ? `/questions?outcome=${value}` : "/questions"} className={`h-8 px-3 inline-flex items-center rounded-[10px] text-[13px] border ${value === outcome ? "bg-navy text-white border-navy" : "bg-white text-ink-2 border-line-strong hover:border-ink-3"}`}>
            {label}
          </a>
        ))}
      </div>
      <ErrorBanner message={missing ? "Questions are not set up in the database yet. Apply the migration 20261114001700_drhp_search_and_chat.sql and deploy the ask-drhp function." : (error?.message ?? null)} />
      {!error && !outcome && rows.length > 0 ? (
        <p className="text-ink-3 text-[13px] mb-4">
          {notFound} of these {rows.length} were not found in the document. Those are worth reading: they show what the summaries and uploads are missing, or how people word things.
        </p>
      ) : null}
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="No questions yet" message="Questions appear here once people use “Ask the document a question” on an IPO page." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="px-5 py-4">
                <details>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium break-words">{r.question}</p>
                        <p className="text-ink-3 text-[12.5px] mt-1">
                          {dateTime(r.created_at)} ·{" "}
                          {ipoName.has(r.ipo_id) ? (
                            <Link href={`/ipos/${r.ipo_id}` as never} className="hover:underline">
                              {ipoName.get(r.ipo_id)}
                            </Link>
                          ) : (
                            "removed IPO"
                          )}
                          {r.pages.length ? ` · pages ${r.pages.join(", ")}` : ""}
                          {r.cached ? " · repeated question" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.intent ? <Badge tone="gold">Business owner: {r.intent}</Badge> : null}
                        <Badge tone={TONE[r.outcome]}>{LABEL[r.outcome]}</Badge>
                      </div>
                    </div>
                  </summary>
                  <p className="mt-3 text-[13.5px] leading-relaxed bg-[#f6f4ee] border border-line rounded-[10px] p-3 whitespace-pre-wrap break-words">{r.answer || "No answer was stored."}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
