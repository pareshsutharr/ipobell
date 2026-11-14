"use client";

// Create or edit one case study (public.case_studies). Save keeps it a draft; Publish makes it visible in the app.
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { checkCaseStudy, EXCHANGES, slugify, toRow, type CaseStudyDraft, type Exchange } from "@/lib/case-studies";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function CaseStudyEditor({ id, initial }: { id: string | null; initial: CaseStudyDraft }) {
  const router = useRouter();
  const [d, setD] = useState<CaseStudyDraft>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(id));
  const [busy, setBusy] = useState<"save" | "publish" | "unpublish" | "delete" | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof CaseStudyDraft>(key: K, value: CaseStudyDraft[K]) => setD((x) => ({ ...x, [key]: value }));
  const setTitle = (title: string) => setD((x) => ({ ...x, title, slug: slugTouched ? x.slug : slugify(title) }));

  const friendly = (message: string) =>
    /case_studies_slug_key|duplicate key/i.test(message) ? "Another case study already uses this link name. Change it." : /case_studies|schema cache/i.test(message) && /find|exist/i.test(message) ? "Case studies are not set up in the database yet. Apply the migration 20261114001300_case_studies.sql." : message;

  const write = async (status: "draft" | "published", action: "save" | "publish" | "unpublish") => {
    setError(null);
    setNotice(null);
    const problem = checkCaseStudy({ ...d, status }, status === "published");
    if (problem) return setError(problem);
    setBusy(action);
    const row = { ...toRow(d), status };
    const supabase = supabaseBrowser();
    const res = id ? await supabase.from("case_studies").update(row).eq("id", id).select("id").single() : await supabase.from("case_studies").insert(row).select("id").single();
    setBusy(null);
    if (res.error) return setError(friendly(res.error.message));
    setD((x) => ({ ...x, status }));
    setNotice(action === "publish" ? "Published. It is now visible in the app." : action === "unpublish" ? "Unpublished. The app no longer shows it." : "Saved.");
    if (!id) router.replace(`/case-studies/${(res.data as { id: string }).id}` as never);
    else router.refresh();
  };

  const remove = async () => {
    if (!id || !window.confirm(`Delete “${d.title}”? This cannot be undone.`)) return;
    setBusy("delete");
    const { error: err } = await supabaseBrowser().from("case_studies").delete().eq("id", id);
    setBusy(null);
    if (err) return setError(friendly(err.message));
    router.replace("/case-studies" as never);
  };

  const onImage = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError("Use a JPG, PNG, WebP or AVIF image.");
    if (file.size > MAX_IMAGE_BYTES) return setError("The image is larger than 8 MB.");
    setBusy("upload");
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `case-studies/${crypto.randomUUID()}.${ext}`;
    const supabase = supabaseBrowser();
    const { error: err } = await supabase.storage.from("insights").upload(path, file, { contentType: file.type, upsert: false });
    setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
    if (err) return setError(err.message);
    set("hero_image_url", supabase.storage.from("insights").getPublicUrl(path).data.publicUrl);
  };

  const published = d.status === "published";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block md:col-span-2">
            <span className="text-[12px] text-ink-3">Company or title</span>
            <input className="field h-10 mt-1" value={d.title} maxLength={140} placeholder="e.g. Aaron Industries" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-3">Exchange</span>
            <select className="field h-10 mt-1" value={d.exchange ?? ""} onChange={(e) => set("exchange", (e.target.value || null) as Exchange | null)}>
              <option value="">Not specified</option>
              {EXCHANGES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-3">Listing year</span>
            <input className="field h-10 mt-1 num" type="number" value={d.listing_year ?? ""} placeholder="e.g. 2018" onChange={(e) => set("listing_year", e.target.value === "" ? null : Number(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-3">City</span>
            <input className="field h-10 mt-1" value={d.city ?? ""} maxLength={80} placeholder="e.g. Surat" onChange={(e) => set("city", e.target.value || null)} />
          </label>
          <label className="block">
            <span className="text-[12px] text-ink-3">Order in the app (lower shows first)</span>
            <input className="field h-10 mt-1 num" type="number" step={1} value={Number.isFinite(d.sort_order) ? d.sort_order : ""} onChange={(e) => set("sort_order", e.target.value === "" ? Number.NaN : Number(e.target.value))} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[12px] text-ink-3">Summary (shown on the card, up to 400 characters) · {d.summary.length}/400</span>
            <textarea className="field mt-1" rows={3} value={d.summary} maxLength={400} placeholder="Two or three sentences: who they are, when and where they listed, what changed since." onChange={(e) => set("summary", e.target.value)} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-[12px] text-ink-3">Full story (optional). Leave a blank line between paragraphs.</span>
            <textarea className="field mt-1" rows={12} value={d.body ?? ""} maxLength={12000} placeholder="The longer account a promoter would want to read: the business before listing, why they listed, the issue, what the money did." onChange={(e) => set("body", e.target.value || null)} />
          </label>
        </div>

        <p className="text-[12px] uppercase tracking-[0.06em] text-ink-3 mt-6 mb-2">Highlights (optional, up to 8)</p>
        <div className="space-y-2">
          {d.highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="field h-9 w-[220px]" value={h.label} maxLength={40} placeholder="Label, e.g. Issue size" onChange={(e) => set("highlights", d.highlights.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              <input className="field h-9 flex-1" value={h.value} maxLength={60} placeholder="Value, e.g. ₹4.9 Cr" onChange={(e) => set("highlights", d.highlights.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
              <button type="button" aria-label="Remove highlight" className="text-ink-3 hover:text-red" onClick={() => set("highlights", d.highlights.filter((_, k) => k !== i))}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {d.highlights.length < 8 ? (
            <Button variant="secondary" size="sm" onClick={() => set("highlights", [...d.highlights, { label: "", value: "" }])}>
              <Plus size={14} /> Add highlight
            </Button>
          ) : null}
        </div>

        {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-5">{error}</div> : null}
        {notice ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px] mt-5">{notice}</div> : null}

        <div className="flex flex-wrap items-center gap-2 mt-6">
          <Button variant="secondary" onClick={() => void write(published ? "published" : "draft", "save")} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : published ? "Save changes" : "Save draft"}
          </Button>
          {published ? (
            <Button variant="ghost" onClick={() => void write("draft", "unpublish")} disabled={busy !== null}>
              {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
            </Button>
          ) : (
            <Button onClick={() => void write("published", "publish")} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          )}
          {id ? (
            <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy !== null}>
              {busy === "delete" ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-[15px]">Status</h2>
            <Badge tone={published ? "green" : "navy"}>{published ? "Published" : "Draft"}</Badge>
          </div>
          <label className="block mt-4">
            <span className="text-[12px] text-ink-3">Link name</span>
            <input
              className="field h-10 mt-1"
              value={d.slug}
              maxLength={80}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
            />
            <span className="text-[11.5px] text-ink-3 mt-1 block">Lowercase letters, digits and hyphens. Filled in from the title until you change it.</span>
          </label>
        </Card>

        <Card>
          <h2 className="text-[15px]">Image (optional)</h2>
          {d.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.hero_image_url} alt="" className="w-full h-[150px] object-cover rounded-[10px] border border-line mt-3" />
          ) : (
            <p className="text-ink-3 text-[13px] mt-2">A photo of the company, its plant or its listing ceremony. JPG, PNG, WebP or AVIF, up to 8 MB.</p>
          )}
          <div className="flex items-center gap-2 mt-3">
            <label className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-line-strong bg-white text-[13px] font-medium cursor-pointer hover:border-ink-3">
              <ImagePlus size={14} /> {busy === "upload" ? "Uploading…" : d.hero_image_url ? "Replace" : "Upload"}
              <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => void onImage(e.target.files?.[0])} />
            </label>
            {d.hero_image_url ? (
              <Button variant="ghost" size="sm" onClick={() => set("hero_image_url", null)}>
                Remove
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
