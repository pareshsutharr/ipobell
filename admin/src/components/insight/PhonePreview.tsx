import { VERDICT_LABEL, type InsightDraft, type IpoRow } from "@/lib/types";

const VERDICT_STYLE = {
  positive: "bg-[#e6f3eb] text-[#1d7a46]",
  neutral: "bg-[#eef0f4] text-[#4a5160]",
  cautious: "bg-[#fbefdd] text-[#a9641c]",
} as const;

/** A faithful, static rendering of the Business Insight block as the app shows it. */
export function PhonePreview({ ipo, draft }: { ipo: IpoRow; draft: InsightDraft }) {
  const vitals = [
    draft.location_city || draft.location_state ? ["Based in", [draft.location_city, draft.location_state].filter(Boolean).join(", ")] : null,
    draft.founded_year ? ["Founded", String(draft.founded_year)] : null,
    draft.sector ? ["Sector", draft.sector] : null,
    draft.employees ? ["Team", draft.employees] : null,
    ...draft.highlights.filter((h) => h.label && h.value).map((h) => [h.label, h.value]),
  ].filter((x): x is string[] => Boolean(x));

  return (
    <div className="sticky top-8">
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-medium mb-3">Preview · Business perspective</p>
      <div className="mx-auto w-[340px] rounded-[38px] border-[10px] border-[#161a22] bg-white overflow-hidden" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.06)" }}>
        <div className="h-[640px] overflow-y-auto scrollbar-thin">
          <div className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {ipo.logo_url ? <img src={ipo.logo_url} alt="" className="w-9 h-9 rounded-[8px] border border-line object-contain" /> : <span className="w-9 h-9 rounded-[8px] border border-line" />}
            <div className="min-w-0">
              <p className="font-semibold text-[14px] truncate">{ipo.display_name ?? ipo.name}</p>
              <p className="text-[11px] text-ink-3">{ipo.board === "sme" ? "SME" : "Mainboard"} · Business Insight</p>
            </div>
          </div>

          {draft.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.hero_image_url} alt="" className="w-full h-[180px] object-cover" />
          ) : (
            <div className="w-full h-[180px] bg-[#f1efe9] flex items-center justify-center text-[12px] text-ink-3">Hero image</div>
          )}

          <div className="px-4 pt-4 pb-5">
            <p className="text-[10px] uppercase tracking-[0.1em] text-[#c9962b] font-medium">From the Be IPO Ready desk</p>
            <p className="display text-[20px] leading-[1.2] mt-1.5">{draft.headline || "Headline goes here"}</p>
            {draft.verdict ? <span className={`inline-flex mt-3 rounded-md px-2 h-[22px] items-center text-[11.5px] font-medium ${VERDICT_STYLE[draft.verdict]}`}>{VERDICT_LABEL[draft.verdict]}</span> : null}
            <p className="text-[13px] text-ink-2 mt-3 leading-relaxed">{draft.summary || "A two or three sentence summary of the company and why its listing matters."}</p>

            {vitals.length ? (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
                {vitals.map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10.5px] text-ink-3">{k}</p>
                    <p className="text-[13px] font-medium mt-0.5">{v}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {draft.company_story ? <Block title="The business" text={draft.company_story} /> : null}
            {draft.founder_story ? <Block title="The founder's journey" text={draft.founder_story} /> : null}
            {draft.listing_journey ? <Block title="From private company to listed" text={draft.listing_journey} /> : null}
            {draft.verdict_note ? <Block title="Our view" text={draft.verdict_note} muted /> : null}

            {draft.takeaways.filter(Boolean).length ? (
              <div className="mt-5">
                <p className="text-[13px] font-semibold">What this means for your company</p>
                <ul className="mt-2 space-y-2">
                  {draft.takeaways.filter(Boolean).map((t, i) => (
                    <li key={i} className="flex gap-2 text-[12.5px] text-ink-2 leading-snug">
                      <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#c9962b] shrink-0" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {draft.gallery.filter((g) => g.url).length ? (
              <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                {draft.gallery
                  .filter((g) => g.url)
                  .map((g, i) => (
                    <figure key={i} className="shrink-0 w-[160px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.url} alt={g.caption} className="w-[160px] h-[110px] object-cover rounded-[10px]" />
                      {g.caption ? <figcaption className="text-[10.5px] text-ink-3 mt-1">{g.caption}</figcaption> : null}
                    </figure>
                  ))}
              </div>
            ) : null}

            {draft.video_url ? <VideoCard url={draft.video_url} /> : null}

            <div className="mt-5 rounded-[10px] bg-[#0F2D52] text-white px-4 py-3">
              <p className="text-[13px] font-semibold">Thinking about listing your company?</p>
              <p className="text-[11.5px] text-white/70 mt-0.5">Take the 10-minute readiness check or book a call.</p>
            </div>
            <p className="text-[10px] text-ink-3 mt-4 leading-snug">Editorial view of Be IPO Ready, an SME IPO advisory firm. Not SEBI-registered investment advice.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** What the app shows for the video: the YouTube thumbnail (HD when available) with a play button. */
function VideoCard({ url }: { url: string }) {
  const id = youtubeId(url);
  return (
    <div className="mt-5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[#0F2D52] font-medium">Watch</p>
      <div className="relative mt-2 rounded-[10px] overflow-hidden bg-[#0A1120] aspect-video">
        {id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://img.youtube.com/vi/${id}/maxresdefault.jpg`}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.src.includes("hqdefault")) img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            }}
          />
        ) : null}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-11 h-11 rounded-full bg-white/90 text-[#0F2D52] flex items-center justify-center text-[14px] pl-0.5">▶</span>
        </div>
        <span className="absolute left-2.5 bottom-2 rounded-full bg-[#0A1120]/70 text-white text-[10.5px] px-2.5 py-1">{id ? "Opens in YouTube" : "Watch the video"}</span>
      </div>
    </div>
  );
}

function Block({ title, text, muted }: { title: string; text: string; muted?: boolean }) {
  return (
    <div className="mt-5">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className={`text-[12.5px] mt-1.5 leading-relaxed whitespace-pre-line ${muted ? "text-ink-3" : "text-ink-2"}`}>{text}</p>
    </div>
  );
}
