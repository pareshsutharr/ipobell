"use client";

// DRHP summary for one IPO (public.ipo_drhp_summaries): the one-page summary, the long one, where the money goes
// and the main risks. Editors save drafts; only a super admin publishes (the database enforces it).
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { GenerateSummaryResponse } from "@/app/api/summaries/generate/route";
import { Badge, Button, Card } from "@/components/ui";
import { checkSummary, LONG_MAX, SHORT_MAX, summaryRow, type SummaryDraft } from "@/lib/drhp-summary";
import { dateTime } from "@/lib/format";
import { EDITOR_PUBLISH_NOTE, reviewError } from "@/lib/review";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface SummaryInitial {
  draft: SummaryDraft;
  exists: boolean;
  status: "draft" | "published";
  publishedAt: string | null;
}

const pageInput = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function SummaryEditor({ ipoId, initial, canPublish, hasDocument, notSetUp }: { ipoId: string; initial: SummaryInitial; canPublish: boolean; hasDocument: boolean; notSetUp: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<SummaryDraft>(initial.draft);
  const [status, setStatus] = useState(initial.status);
  const [exists, setExists] = useState(initial.exists);
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | "delete" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const published = status === "published";
  const locked = published && !canPublish; // an editor looking at a published summary
  const set = <K extends keyof SummaryDraft>(key: K, value: SummaryDraft[K]) => setD((x) => ({ ...x, [key]: value }));

  const write = async (next: "draft" | "published", action: "save" | "publish" | "unpublish") => {
    setError(null);
    setNotice(null);
    const problem = checkSummary(d, next === "published");
    if (problem) return setError(problem);
    setBusy(action);
    const { error: err } = await supabaseBrowser().from("ipo_drhp_summaries").upsert({ ipo_id: ipoId, status: next, ...summaryRow(d) }, { onConflict: "ipo_id" });
    setBusy(null);
    if (err) return setError(reviewError(err.message, "a summary"));
    setStatus(next);
    setExists(true);
    setNotice(action === "publish" ? "Published. The app shows it now." : action === "unpublish" ? "Unpublished. The app no longer shows it; editors can change it again." : "Draft saved. Only admins can see it.");
    router.refresh();
  };

  const remove = async () => {
    if (!window.confirm("Delete this summary? This cannot be undone.")) return;
    setBusy("delete");
    setError(null);
    const { error: err } = await supabaseBrowser().from("ipo_drhp_summaries").delete().eq("ipo_id", ipoId);
    setBusy(null);
    if (err) return setError(reviewError(err.message, "a summary"));
    setD({ short_md: "", long_md: "", use_of_funds: [], risks: [], source_document_id: null, ai_drafted: false });
    setExists(false);
    setStatus("draft");
    setNotice("Summary deleted.");
    router.refresh();
  };

  const generate = async () => {
    if ((d.short_md.trim() || d.long_md.trim()) && !window.confirm("Replace what is written here with a new AI draft?")) return;
    setBusy("ai");
    setError(null);
    setNotice(null);
    setAiNote(null);
    try {
      const res = await fetch("/api/summaries/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipo_id: ipoId }) });
      const json = (await res.json().catch(() => ({}))) as Partial<GenerateSummaryResponse> & { error?: string };
      if (!res.ok || !json.draft || !json.document) throw new Error(json.error ?? `The draft failed (HTTP ${res.status}).`);
      setD(json.draft);
      setAiNote(
        `AI draft from ${json.document.label} v${json.document.version}: ${json.pagesSent} of ${json.document.pages} pages were read. Nothing is saved yet. Check every figure against the page it cites before saving.` +
          (json.uncheckedPages?.length ? ` These page references could not be checked because those pages were not read: ${json.uncheckedPages.join(", ")}.` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The draft failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px]">DRHP summary</h2>
          <p className="text-ink-3 text-[13px] mt-1 max-w-[760px]">The one-page summary and the longer one that the app shows on this IPO&apos;s page. Describe what the document says, with page numbers; do not say whether to apply.</p>
        </div>
        <div className="text-right shrink-0">
          <Badge tone={!exists ? "neutral" : published ? "green" : "navy"}>{!exists ? "Not written yet" : published ? "Published" : "Draft"}</Badge>
          {published && initial.publishedAt ? <p className="text-[12px] text-ink-3 mt-1">since {dateTime(initial.publishedAt)}</p> : null}
        </div>
      </div>

      {notSetUp ? (
        <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mt-4">Summaries are not set up in the database yet. Apply the migration 20261114001500_drhp_summaries.sql.</div>
      ) : (
        <>
          {locked ? <div className="rounded-[10px] border border-line bg-[#f6f4ee] px-4 py-3 text-[13px] text-ink-2 mt-4">This summary is published, so only a super admin can change it. Ask them to unpublish it if it needs editing.</div> : null}

          <div className="flex flex-wrap items-center gap-3 mt-4">
            <Button variant="secondary" size="sm" onClick={() => void generate()} disabled={busy !== null || locked || !hasDocument} title={hasDocument ? undefined : "Upload the DRHP or RHP above first"}>
              <Sparkles size={14} /> {busy === "ai" ? "Reading the document… (up to 2 minutes)" : "Draft with AI from the uploaded document"}
            </Button>
            {!hasDocument ? <span className="text-[12.5px] text-ink-3">Upload the DRHP or RHP above to use this.</span> : null}
            {d.ai_drafted ? <Badge tone="gold">First draft by AI</Badge> : null}
          </div>
          {aiNote ? <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mt-3">{aiNote}</div> : null}

          <label className="block mt-5">
            <span className="text-[12px] text-ink-3">
              One-page summary · {d.short_md.length}/{SHORT_MAX}
            </span>
            <textarea className="field mt-1" rows={9} disabled={locked} value={d.short_md} maxLength={SHORT_MAX} placeholder="What the company does, the issue, key numbers and where the money goes. Put the page after each fact, like (p. 87). Leave a blank line between paragraphs." onChange={(e) => set("short_md", e.target.value)} />
          </label>
          <label className="block mt-4">
            <span className="text-[12px] text-ink-3">
              Long summary · {d.long_md.length}/{LONG_MAX}
            </span>
            <textarea className="field mt-1" rows={14} disabled={locked} value={d.long_md} maxLength={LONG_MAX} placeholder="The business; The issue; Financial track record; Promoters and management; What to watch." onChange={(e) => set("long_md", e.target.value)} />
          </label>

          <p className="text-[12px] uppercase tracking-[0.06em] text-ink-3 mt-6 mb-2">How the money will be used</p>
          <div className="space-y-2">
            {d.use_of_funds.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="field h-9 flex-1 min-w-[220px]" disabled={locked} value={f.purpose} maxLength={200} placeholder="Purpose, as the document states it" onChange={(e) => set("use_of_funds", d.use_of_funds.map((x, k) => (k === i ? { ...x, purpose: e.target.value } : x)))} />
                <input className="field h-9 w-[150px]" disabled={locked} value={f.amount} maxLength={60} placeholder="Amount" onChange={(e) => set("use_of_funds", d.use_of_funds.map((x, k) => (k === i ? { ...x, amount: e.target.value } : x)))} />
                <input className="field h-9 w-[84px] num" disabled={locked} type="number" min={1} value={f.page ?? ""} placeholder="Page" onChange={(e) => set("use_of_funds", d.use_of_funds.map((x, k) => (k === i ? { ...x, page: pageInput(e.target.value) } : x)))} />
                {!locked ? (
                  <button type="button" aria-label="Remove line" className="text-ink-3 hover:text-red" onClick={() => set("use_of_funds", d.use_of_funds.filter((_, k) => k !== i))}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}
            {!locked && d.use_of_funds.length < 15 ? (
              <Button variant="secondary" size="sm" onClick={() => set("use_of_funds", [...d.use_of_funds, { purpose: "", amount: "", page: null }])}>
                <Plus size={14} /> Add line
              </Button>
            ) : null}
          </div>

          <p className="text-[12px] uppercase tracking-[0.06em] text-ink-3 mt-6 mb-2">Main risks stated in the document</p>
          <div className="space-y-2">
            {d.risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="field h-9 flex-1" disabled={locked} value={r.text} maxLength={400} placeholder="One sentence, in plain words" onChange={(e) => set("risks", d.risks.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} />
                <input className="field h-9 w-[84px] num" disabled={locked} type="number" min={1} value={r.page ?? ""} placeholder="Page" onChange={(e) => set("risks", d.risks.map((x, k) => (k === i ? { ...x, page: pageInput(e.target.value) } : x)))} />
                {!locked ? (
                  <button type="button" aria-label="Remove risk" className="text-ink-3 hover:text-red" onClick={() => set("risks", d.risks.filter((_, k) => k !== i))}>
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}
            {!locked && d.risks.length < 15 ? (
              <Button variant="secondary" size="sm" onClick={() => set("risks", [...d.risks, { text: "", page: null }])}>
                <Plus size={14} /> Add risk
              </Button>
            ) : null}
          </div>

          {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-5">{error}</div> : null}
          {notice ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px] mt-5">{notice}</div> : null}

          {!locked ? (
            <div className="flex flex-wrap items-center gap-2 mt-6">
              <Button variant="secondary" onClick={() => void write(published ? "published" : "draft", "save")} disabled={busy !== null}>
                {busy === "save" ? "Saving…" : published ? "Save changes" : "Save draft"}
              </Button>
              {canPublish ? (
                published ? (
                  <Button variant="ghost" onClick={() => void write("draft", "unpublish")} disabled={busy !== null}>
                    {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
                  </Button>
                ) : (
                  <Button onClick={() => void write("published", "publish")} disabled={busy !== null}>
                    {busy === "publish" ? "Publishing…" : "Publish"}
                  </Button>
                )
              ) : (
                <span className="text-[12.5px] text-ink-3">{EDITOR_PUBLISH_NOTE}</span>
              )}
              {exists ? (
                <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy !== null}>
                  {busy === "delete" ? "Deleting…" : "Delete"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
