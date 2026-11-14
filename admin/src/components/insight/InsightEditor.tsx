"use client";

import { ImagePlus, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Badge, Button, Card, ErrorBanner, statusTone } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { emptyInsight, VERDICT_LABEL, type InsightDraft, type InsightRow, type IpoRow, type Verdict } from "@/lib/types";
import type { GenerateResponse, MediaImage, MediaVideo } from "@/app/api/insights/generate/route";

import { PhonePreview } from "./PhonePreview";

type Props = { ipo: IpoRow; initial: InsightRow | null };

function toDraft(row: InsightRow): InsightDraft {
  return {
    ipo_id: row.ipo_id,
    status: row.status,
    headline: row.headline,
    summary: row.summary,
    company_story: row.company_story,
    founder_story: row.founder_story,
    listing_journey: row.listing_journey,
    lessons: row.lessons,
    location_city: row.location_city,
    location_state: row.location_state,
    founded_year: row.founded_year,
    employees: row.employees,
    sector: row.sector,
    verdict: row.verdict,
    verdict_note: row.verdict_note,
    takeaways: row.takeaways ?? [],
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    hero_image_url: row.hero_image_url,
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    video_url: row.video_url,
    show_to_investors: row.show_to_investors,
  };
}

export function InsightEditor({ ipo, initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<InsightDraft>(initial ? toDraft(initial) : emptyInsight(ipo.id));
  const [exists, setExists] = useState(Boolean(initial));
  const [busy, setBusy] = useState<"draft" | "publish" | "unpublish" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"hero" | "gallery" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [ai, setAi] = useState<Pick<GenerateResponse, "sources" | "model" | "grounded" | "research_error" | "website"> | null>(null);
  const [media, setMedia] = useState<{ images: MediaImage[]; videos: MediaVideo[] } | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [makingLogoHero, setMakingLogoHero] = useState(false);
  const heroInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof InsightDraft>(k: K, v: InsightDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const text = (v: string) => (v.trim() === "" ? null : v);

  const persist = async (status: InsightDraft["status"]) => {
    setBusy(status === "published" ? "publish" : "draft");
    setError(null);
    setSaved(null);
    const payload = {
      ...draft,
      status,
      takeaways: draft.takeaways.map((t) => t.trim()).filter(Boolean),
      highlights: draft.highlights.filter((h) => h.label.trim() && h.value.trim()),
      gallery: draft.gallery.filter((g) => g.url),
    };
    const { error: err } = await supabaseBrowser().from("ipo_insights").upsert(payload, { onConflict: "ipo_id" });
    setBusy(null);
    if (err) {
      setError(err.message.includes("row-level security") ? "You do not have permission to write insights. Check your admin access." : err.message);
      return;
    }
    setDraft((d) => ({ ...d, status }));
    setExists(true);
    setSaved(status === "published" ? "Published. Business owners can read it in the app now." : "Draft saved. Only admins can see it.");
    router.refresh();
  };

  const unpublish = async () => {
    setBusy("unpublish");
    setError(null);
    const { error: err } = await supabaseBrowser().from("ipo_insights").update({ status: "draft" }).eq("ipo_id", ipo.id);
    setBusy(null);
    if (err) return setError(err.message);
    setDraft((d) => ({ ...d, status: "draft" }));
    setSaved("Unpublished. The insight is hidden from the app until you publish again.");
    router.refresh();
  };

  const remove = async () => {
    if (!confirm("Delete this insight? Text and image links are removed; uploaded files stay in storage.")) return;
    setBusy("delete");
    const { error: err } = await supabaseBrowser().from("ipo_insights").delete().eq("ipo_id", ipo.id);
    setBusy(null);
    if (err) return setError(err.message);
    setDraft(emptyInsight(ipo.id));
    setExists(false);
    setSaved("Insight deleted.");
    router.refresh();
  };

  // Text fields the AI can fill. Images, video and the investor toggle are never touched.
  const AI_KEYS = ["headline", "summary", "company_story", "founder_story", "listing_journey", "lessons", "location_city", "location_state", "founded_year", "employees", "sector", "verdict", "verdict_note"] as const;

  const generate = async () => {
    const hasText = AI_KEYS.some((k) => draft[k] !== null && draft[k] !== "") || draft.takeaways.length > 0 || draft.highlights.length > 0;
    let replace = false;
    if (hasText) {
      replace = confirm("Replace the text already in this form with the AI draft?\n\nOK = replace everything. Cancel = only fill the empty fields.");
    }
    setGenerating(true);
    setError(null);
    setSaved(null);
    setAi(null);
    try {
      const res = await fetch("/api/insights/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipo_id: ipo.id }) });
      const json = (await res.json().catch(() => ({}))) as Partial<GenerateResponse> & { error?: string };
      if (!res.ok || !json.draft) throw new Error(json.error ?? `Generation failed (HTTP ${res.status}).`);
      const g = json.draft;
      setDraft((d) => {
        const next = { ...d };
        for (const k of AI_KEYS) {
          const empty = d[k] === null || d[k] === "";
          if ((replace || empty) && g[k] !== null && g[k] !== undefined) (next as Record<string, unknown>)[k] = g[k];
        }
        if (replace || d.takeaways.filter((t) => t.trim()).length === 0) next.takeaways = g.takeaways;
        if (replace || d.highlights.filter((h) => h.label.trim()).length === 0) next.highlights = g.highlights;
        return next;
      });
      setAi({ sources: json.sources ?? [], model: json.model ?? "gemini", grounded: Boolean(json.grounded), research_error: json.research_error ?? null, website: json.website ?? null });
      setMedia(json.media && (json.media.images.length || json.media.videos.length) ? json.media : null);
      setSaved("AI draft filled in. Nothing is saved yet: read it, fix the facts, then save or publish.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  /** Copy a suggested web image into our storage bucket, then use it as the hero or add it to the gallery. */
  const useImage = async (img: MediaImage, as: "hero" | "gallery") => {
    setImporting(img.url);
    setError(null);
    try {
      const res = await fetch("/api/insights/import-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipo_id: ipo.id, url: img.url }) });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? `Could not copy the image (HTTP ${res.status}).`);
      if (as === "hero") set("hero_image_url", json.url);
      else setDraft((d) => (d.gallery.length >= 8 ? d : { ...d, gallery: [...d.gallery, { url: json.url!, caption: "" }] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy the image");
    } finally {
      setImporting(null);
    }
  };

  /** Build a hero from the company logo in the IPO feed. Available for every IPO with a logo, no AI needed. */
  const makeLogoHero = async () => {
    setMakingLogoHero(true);
    setError(null);
    try {
      const res = await fetch("/api/insights/logo-hero", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ipo_id: ipo.id }) });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? `Could not build the hero (HTTP ${res.status}).`);
      set("hero_image_url", json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the hero");
    } finally {
      setMakingLogoHero(false);
    }
  };

  const upload = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${ipo.id}/${crypto.randomUUID()}.${ext}`;
    const supabase = supabaseBrowser();
    const { error: err } = await supabase.storage.from("insights").upload(path, file, { contentType: file.type, upsert: false });
    if (err) throw err;
    return supabase.storage.from("insights").getPublicUrl(path).data.publicUrl;
  };

  const onHero = async (files: FileList | null) => {
    if (!files?.[0]) return;
    setUploading("hero");
    setError(null);
    try {
      set("hero_image_url", await upload(files[0]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
      if (heroInput.current) heroInput.current.value = "";
    }
  };

  const onGallery = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading("gallery");
    setError(null);
    try {
      const urls = await Promise.all(Array.from(files).slice(0, 8).map(upload));
      setDraft((d) => ({ ...d, gallery: [...d.gallery, ...urls.map((url) => ({ url, caption: "" }))] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
      if (galleryInput.current) galleryInput.current.value = "";
    }
  };

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_380px] gap-8 items-start">
      <div className="space-y-6">
        <Card className="flex items-center justify-between gap-4 !py-4">
          <div className="flex items-center gap-3">
            <Badge tone={statusTone(exists ? draft.status : "none")}>{exists ? draft.status : "not written yet"}</Badge>
            <p className="text-ink-3 text-[13px]">
              {exists ? (draft.status === "published" ? "Live in the app. Edits go live when you publish again." : "Draft. Business owners cannot see it yet.") : "Add the first insight for this IPO so business owners can read how the company got listed."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {exists ? (
              <Button variant="danger" size="sm" onClick={remove} disabled={busy !== null}>
                <Trash2 size={14} /> Delete
              </Button>
            ) : null}
            {exists && draft.status === "published" ? (
              <Button variant="secondary" size="sm" onClick={unpublish} disabled={busy !== null}>
                {busy === "unpublish" ? "Working…" : "Unpublish"}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={generate} disabled={busy !== null || generating} title="Research the company with Gemini and fill the text fields. You review before saving.">
              <Sparkles size={14} /> {generating ? "Researching…" : "Draft with AI"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => persist("draft")} disabled={busy !== null || generating}>
              {busy === "draft" ? "Saving…" : "Save draft"}
            </Button>
            <Button variant="gold" size="sm" onClick={() => persist("published")} disabled={busy !== null || !draft.headline?.trim()} title={!draft.headline?.trim() ? "Add a headline before publishing" : undefined}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </Card>
        <ErrorBanner message={error} />
        {saved ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px]">{saved}</div> : null}
        {ai ? (
          <div className="rounded-[10px] border border-amber/30 bg-amber-soft text-amber px-4 py-3 text-[13px]">
            <p className="font-medium">AI draft by {ai.model}. Check every name, date and number before publishing.</p>
            {ai.website ? (
              <p className="mt-1">
                Company website:{" "}
                <a href={ai.website} target="_blank" rel="noreferrer" className="underline">
                  {ai.website.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              </p>
            ) : null}
            {ai.grounded && ai.sources.length ? (
              <ul className="mt-2 space-y-0.5">
                {ai.sources.slice(0, 8).map((s) => (
                  <li key={s.url} className="truncate">
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">
                Written from the IPO feed data only.
                {ai.research_error ? ` Web research failed: ${ai.research_error}` : ai.grounded ? "" : " Web research was not available."}
              </p>
            )}
          </div>
        ) : null}

        {media || ipo.logo_url ? (
          <Section title="Suggested photos and videos" hint={media ? "Photos come from the company's website and the press coverage above. Videos come from a YouTube search for the company (IPO coverage, founder interviews, corporate films) plus any embedded on its site. Everything is checked to load. Use only images you have the right to publish: photos from the company's own site are the safest. Chosen images are copied into our storage." : "The company logo is always available as a hero. Click Draft with AI to also find photos from the company's website and videos on YouTube."}>
            {media?.images.length || ipo.logo_url ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ipo.logo_url ? (
                  <div className="border border-line rounded-[10px] overflow-hidden bg-white">
                    <div className="w-full h-[110px] bg-[#F1EFE9] flex items-center justify-center p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ipo.logo_url} alt="" className="max-h-[70px] max-w-[85%] object-contain bg-white rounded-[8px] px-3 py-2 border border-line" />
                    </div>
                    <div className="px-2 pt-1.5 pb-2">
                      <p className="text-[11px] text-ink-3 truncate">Company logo · from the IPO feed</p>
                      <div className="flex gap-1 mt-1.5">
                        <Button type="button" variant="secondary" size="sm" className="!h-7 !px-2 !text-[12px]" disabled={importing !== null || makingLogoHero} onClick={makeLogoHero}>
                          {makingLogoHero ? "Building…" : draft.hero_image_url?.includes("/hero-logo-") ? "Hero ✓" : "Hero"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {(media?.images ?? []).map((img) => {
                  const isHero = draft.hero_image_url?.includes(img.url);
                  return (
                    <div key={img.url} className="border border-line rounded-[10px] overflow-hidden bg-white">
                      <a href={img.url} target="_blank" rel="noreferrer" title="Open the original">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" loading="lazy" className="w-full h-[110px] object-cover bg-[#f1efe9]" />
                      </a>
                      <div className="px-2 pt-1.5 pb-2">
                        <p className="text-[11px] text-ink-3 truncate" title={img.source}>
                          {img.from === "company site" ? "Company site" : img.from === "press" ? "Press" : "Found by AI"} · {img.source}
                        </p>
                        <div className="flex gap-1 mt-1.5">
                          <Button type="button" variant="secondary" size="sm" className="!h-7 !px-2 !text-[12px]" disabled={importing !== null} onClick={() => useImage(img, "hero")}>
                            {importing === img.url ? "Copying…" : isHero ? "Hero ✓" : "Hero"}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="!h-7 !px-2 !text-[12px]" disabled={importing !== null || draft.gallery.length >= 8} onClick={() => useImage(img, "gallery")}>
                            + Gallery
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">No usable photos were found on the company site or in the press pages. Upload your own below.</p>
            )}
            {media && !media.images.length && ipo.logo_url ? <p className="text-[13px] text-ink-3">No photos were found on the company site or in the press pages. The logo hero above works for every company, or upload your own below.</p> : null}
            {media?.videos.length ? (
              <div className="space-y-2">
                {media.videos.map((v) => {
                  const on = draft.video_url === v.url;
                  return (
                    <div key={v.url} className={`flex items-center gap-3 border rounded-[10px] p-2 ${on ? "border-navy bg-navy-soft" : "border-line bg-white"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {v.thumbnail ? <img src={v.thumbnail} alt="" className="w-[128px] h-[72px] object-cover rounded-[6px] shrink-0 bg-[#0A1120]" /> : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate">{v.title}</p>
                        <p className="text-[11.5px] text-ink-3 truncate">
                          {v.from === "page" ? "On the company site · " : v.from === "ai" ? "Quoted by AI · " : ""}
                          {v.author ? `${v.author} · ` : ""}
                          <a href={v.url} target="_blank" rel="noreferrer" className="underline">
                            watch on YouTube
                          </a>
                        </p>
                      </div>
                      <Button type="button" variant={on ? "primary" : "secondary"} size="sm" onClick={() => set("video_url", on ? null : v.url)}>
                        <Play size={13} /> {on ? "Using" : "Use"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Section>
        ) : null}

        <Section title="The hook" hint="What a promoter sees first on the card and at the top of the page.">
          <Field label="Headline" hint="One line, under 90 characters. Say what is remarkable.">
            <input className="field" maxLength={120} value={draft.headline ?? ""} onChange={(e) => set("headline", text(e.target.value))} placeholder="From a 12-person workshop in Adajan to NSE Emerge in seven years" />
          </Field>
          <Field label="Summary" hint="Two or three sentences. Shown on the card and under the headline.">
            <textarea className="field" value={draft.summary ?? ""} onChange={(e) => set("summary", text(e.target.value))} placeholder="Who they are, what they make, and why this listing is worth reading about." />
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Hero image" hint="Landscape, at least 1200 px wide. JPG, PNG or WebP up to 8 MB. No photo? “Use company logo” builds one from the feed logo.">
              <div className="flex items-center gap-3">
                {draft.hero_image_url ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={draft.hero_image_url} alt="" className="w-[160px] h-[96px] object-cover rounded-[10px] border border-line" />
                    <button type="button" onClick={() => set("hero_image_url", null)} className="absolute -top-2 -right-2 bg-white border border-line rounded-full w-6 h-6 flex items-center justify-center text-ink-2 hover:text-red" aria-label="Remove image">
                      <X size={12} />
                    </button>
                  </div>
                ) : null}
                <Button type="button" variant="secondary" size="sm" onClick={() => heroInput.current?.click()} disabled={uploading !== null || makingLogoHero}>
                  <ImagePlus size={14} /> {uploading === "hero" ? "Uploading…" : draft.hero_image_url ? "Replace" : "Upload"}
                </Button>
                {ipo.logo_url ? (
                  <Button type="button" variant="ghost" size="sm" onClick={makeLogoHero} disabled={uploading !== null || makingLogoHero} title="Make a 1200×675 hero from the company logo on a clean card">
                    {makingLogoHero ? "Building…" : "Use company logo"}
                  </Button>
                ) : null}
                <input ref={heroInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => onHero(e.target.files)} />
              </div>
            </Field>
            <Field label="Video link" hint="Optional YouTube link to a factory tour or founder interview.">
              <input className="field" value={draft.video_url ?? ""} onChange={(e) => set("video_url", text(e.target.value))} placeholder="https://youtube.com/…" />
            </Field>
          </div>
        </Section>

        <Section title="The company" hint="Facts a business owner would compare with their own firm.">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="City">
              <input className="field" value={draft.location_city ?? ""} onChange={(e) => set("location_city", text(e.target.value))} placeholder="Surat" />
            </Field>
            <Field label="State">
              <input className="field" value={draft.location_state ?? ""} onChange={(e) => set("location_state", text(e.target.value))} placeholder="Gujarat" />
            </Field>
            <Field label="Founded">
              <input className="field num" inputMode="numeric" value={draft.founded_year ?? ""} onChange={(e) => set("founded_year", e.target.value ? Number(e.target.value.replace(/\D/g, "")) || null : null)} placeholder="2011" />
            </Field>
            <Field label="Sector">
              <input className="field" value={draft.sector ?? ""} onChange={(e) => set("sector", text(e.target.value))} placeholder="Elevator components" />
            </Field>
            <Field label="Team size">
              <input className="field" value={draft.employees ?? ""} onChange={(e) => set("employees", text(e.target.value))} placeholder="About 180 people" />
            </Field>
          </div>
          <Field label="Key numbers" hint="Short label and value pairs, e.g. “FY24 revenue · ₹62 Cr”, “Promoter holding · 71%”.">
            <div className="space-y-2">
              {draft.highlights.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input className="field !w-[45%]" value={h.label} placeholder="FY24 revenue" onChange={(e) => set("highlights", draft.highlights.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className="field" value={h.value} placeholder="₹62 Cr" onChange={(e) => set("highlights", draft.highlights.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" className="text-ink-3 hover:text-red px-1" onClick={() => set("highlights", draft.highlights.filter((_, j) => j !== i))} aria-label="Remove">
                    <X size={15} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("highlights", [...draft.highlights, { label: "", value: "" }])}>
                <Plus size={14} /> Add a number
              </Button>
            </div>
          </Field>
          <Field label="The business" hint="What they make or do, who buys it, how the money is made. Plain paragraphs.">
            <textarea className="field min-h-[140px]" value={draft.company_story ?? ""} onChange={(e) => set("company_story", text(e.target.value))} />
          </Field>
        </Section>

        <Section title="The journey" hint="This is the part business owners read twice.">
          <Field label="The founder's story" hint="Where the promoter started, the turning points, the people involved.">
            <textarea className="field min-h-[160px]" value={draft.founder_story ?? ""} onChange={(e) => set("founder_story", text(e.target.value))} />
          </Field>
          <Field label="From private company to listed" hint="How they prepared: audits, restructuring, merchant banker, DRHP, SEBI/exchange approval, the issue itself.">
            <textarea className="field min-h-[160px]" value={draft.listing_journey ?? ""} onChange={(e) => set("listing_journey", text(e.target.value))} />
          </Field>
          <Field label="Lessons" hint="Optional free text. Use the takeaways below for crisp bullet points.">
            <textarea className="field" value={draft.lessons ?? ""} onChange={(e) => set("lessons", text(e.target.value))} />
          </Field>
          <Field label="What this means for your company" hint="Three to five bullets written for a promoter reading on a phone.">
            <div className="space-y-2">
              {draft.takeaways.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input className="field" value={t} onChange={(e) => set("takeaways", draft.takeaways.map((x, j) => (j === i ? e.target.value : x)))} placeholder="Three years of audited, growing profits mattered more than size." />
                  <button type="button" className="text-ink-3 hover:text-red px-1" onClick={() => set("takeaways", draft.takeaways.filter((_, j) => j !== i))} aria-label="Remove">
                    <X size={15} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("takeaways", [...draft.takeaways, ""])}>
                <Plus size={14} /> Add a takeaway
              </Button>
            </div>
          </Field>
        </Section>

        <Section title="Our view" hint="An editorial opinion, shown with a disclaimer. Avoid the words buy, sell, subscribe or avoid.">
          <Field label="Verdict">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => {
                const on = draft.verdict === v;
                return (
                  <button key={v} type="button" onClick={() => set("verdict", on ? null : v)} className={`h-9 px-3 rounded-[10px] border text-[13px] transition ${on ? "bg-navy text-white border-navy" : "bg-white border-line-strong text-ink-2 hover:border-ink-3"}`}>
                    {VERDICT_LABEL[v]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Why" hint="One paragraph explaining the verdict in plain words.">
            <textarea className="field" value={draft.verdict_note ?? ""} onChange={(e) => set("verdict_note", text(e.target.value))} />
          </Field>
          <label className="flex items-center gap-3 text-[13px]">
            <input type="checkbox" className="w-4 h-4 accent-[#0F2D52]" checked={draft.show_to_investors} onChange={(e) => set("show_to_investors", e.target.checked)} />
            Also show a short research note in the investor view
          </label>
        </Section>

        <Section title="Gallery" hint="Factory floor, products, the listing ceremony. Up to 8 images; captions are optional.">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {draft.gallery.map((g, i) => (
              <div key={i} className="border border-line rounded-[10px] overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt="" className="w-full h-[110px] object-cover" />
                <div className="p-2 flex gap-1">
                  <input className="field !py-1.5 text-[12px]" placeholder="Caption" value={g.caption} onChange={(e) => set("gallery", draft.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
                  <button type="button" className="text-ink-3 hover:text-red px-1" onClick={() => set("gallery", draft.gallery.filter((_, j) => j !== i))} aria-label="Remove">
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => galleryInput.current?.click()} disabled={uploading !== null || draft.gallery.length >= 8} className="border border-dashed border-line-strong rounded-[10px] min-h-[150px] flex flex-col items-center justify-center text-ink-3 hover:border-ink-3 hover:text-ink-2 text-[12.5px] gap-1 disabled:opacity-50">
              <ImagePlus size={18} />
              {uploading === "gallery" ? "Uploading…" : "Add images"}
            </button>
            <input ref={galleryInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => onGallery(e.target.files)} />
          </div>
        </Section>
      </div>

      <PhonePreview ipo={ipo} draft={draft} />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="text-[18px]">{title}</h2>
      {hint ? <p className="text-ink-3 text-[13px] mt-0.5">{hint}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {hint ? <p className="text-[12px] text-ink-3 mt-1.5">{hint}</p> : null}
    </div>
  );
}
