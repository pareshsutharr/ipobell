// Find real photos and videos for an insight: images on the company's own website (home, about, team,
// management, gallery pages), the lead image of each press article Gemini grounded on, plus any URLs Gemini
// itself quoted. Every candidate is verified with a real request before it is shown to the admin, so nothing
// hallucinated gets through. Nothing here generates images: promoters are real people.

export interface MediaImage {
  url: string;
  /** Hostname the image was found on. */
  source: string;
  from: "company site" | "press" | "ai";
  bytes: number | null;
}

export interface MediaVideo {
  url: string;
  title: string;
  author: string | null;
  thumbnail: string | null;
  /** How the video was found: a YouTube search for the company, a page embed, or quoted by Gemini. */
  from: "youtube search" | "page" | "ai";
}

export interface DiscoveredMedia {
  images: MediaImage[];
  videos: MediaVideo[];
}

const UA = "Mozilla/5.0 (compatible; BeIPOReadyAdmin/1.0; +https://beipoready.com)";
const IMAGE_TYPES = /^image\/(jpeg|png|webp|avif)/i;
const SKIP_NAME = /(logo|icon|sprite|pixel|tracking|placeholder|spinner|loader|arrow|bullet|button|badge|flag|whatsapp|facebook|twitter|linkedin|instagram|youtube|captcha|\.svg|\.gif|\.ico)/i;
const SUBPAGE = /(about|team|management|promoter|leadership|director|founder|gallery|media|our-story|journey|milestone|history)/i;
// IPO data feeds and aggregators. The feed's "website" for an IPO often points at one of these instead of the
// company, and their pages are full of ads and other companies' logos, so they are never treated as the company site.
const AGGREGATORS = /(^|\.)(ipoguru\.in|chittorgarh\.com|chittorgarh\.net|ipowatch\.in|ipocentral\.in|ipopremium\.in|investorgain\.com|nseindia\.com|bseindia\.com|sebi\.gov\.in|moneycontrol\.com|economictimes\.com|livemint\.com|business-standard\.com|zerodha\.com|groww\.in|angelone\.in|5paisa\.com|upstox\.com|screener\.in|tickertape\.in|trendlyne\.com|google\.com|youtube\.com|facebook\.com|linkedin\.com|twitter\.com|x\.com|instagram\.com|wikipedia\.org)$/i;

export function isAggregator(url: string): boolean {
  return AGGREGATORS.test(host(url));
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function absolute(src: string, base: string): string | null {
  const s = src.trim().replace(/&amp;/g, "&");
  if (!s || s.startsWith("data:") || s.startsWith("blob:")) return null;
  try {
    const u = new URL(s, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string, ms = 8000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5" }, signal: AbortSignal.timeout(ms), redirect: "follow" });
    if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") ?? "")) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

function metaImage(html: string, base: string): string | null {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|og:image:secure_url|twitter:image)["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  return m ? absolute(m[1], base) : null;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"));
  return m ? m[1] : null;
}

function pageImages(html: string, base: string, cap = 40): string[] {
  const out: string[] = [];
  const og = metaImage(html, base);
  if (og) out.push(og);
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < cap) {
    const tag = m[0];
    // Lazy-loaded images keep the real file in data-src and a placeholder in src.
    const raw = attr(tag, "data-src") ?? attr(tag, "data-lazy-src") ?? attr(tag, "data-original") ?? attr(tag, "src") ?? attr(tag, "srcset")?.split(",")[0]?.trim().split(/\s+/)[0] ?? null;
    if (!raw) continue;
    const w = Number(attr(tag, "width"));
    const h = Number(attr(tag, "height"));
    if (w && h && w < 150 && h < 150) continue; // icons, logos, badges
    const u = absolute(raw, base);
    if (u && !SKIP_NAME.test(u) && !out.includes(u)) out.push(u);
  }
  return out;
}

function internalLinks(html: string, base: string, cap = 6): string[] {
  const origin = host(base);
  const out = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < cap) {
    const u = absolute(m[1], base);
    if (u && host(u) === origin && SUBPAGE.test(u) && !/\.(pdf|jpg|png|zip)$/i.test(u) && u !== base) out.add(u);
  }
  return [...out];
}

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function pageVideos(html: string): string[] {
  const ids = new Set<string>();
  const re = /(?:youtube\.com\/(?:watch\?(?:[^"'\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) ids.add(m[1]);
  return [...ids].map((id) => `https://www.youtube.com/watch?v=${id}`);
}

async function verifyImage(url: string): Promise<number | null | false> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*" }, signal: AbortSignal.timeout(6000) });
    const type = res.headers.get("content-type") ?? "";
    const len = Number(res.headers.get("content-length") ?? "");
    await res.body?.cancel().catch(() => undefined);
    if (!res.ok || !IMAGE_TYPES.test(type)) return false;
    if (Number.isFinite(len) && len > 0 && len < 12_000) return false; // icons and tracking pixels
    return Number.isFinite(len) && len > 0 ? len : null;
  } catch {
    return false;
  }
}

async function verifyVideo(url: string, from: MediaVideo["from"]): Promise<MediaVideo | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return { url: watch, title: j.title ?? "YouTube video", author: j.author_name ?? null, thumbnail: await bestThumbnail(id, j.thumbnail_url ?? null), from };
  } catch {
    return null;
  }
}

/** The 1280×720 thumbnail when YouTube has one (not every video does), else the standard 480×360 one. */
async function bestThumbnail(id: string, fallback: string | null): Promise<string> {
  const maxres = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  try {
    const res = await fetch(maxres, { method: "HEAD", headers: { "user-agent": UA }, signal: AbortSignal.timeout(4000) });
    const len = Number(res.headers.get("content-length") ?? "0");
    if (res.ok && len > 5000) return maxres; // a missing size answers 404 or a tiny grey placeholder
  } catch {
    // fall through
  }
  return fallback ?? `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// --- YouTube search -------------------------------------------------------------------------------------
// YouTube's results page embeds its data as JSON; we read the videoRenderer entries out of it. No API key
// needed. If YouTube ever changes the markup we simply find fewer videos; nothing else breaks.

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const NAME_STOPWORDS = new Set(["limited", "ltd", "ltd.", "private", "pvt", "pvt.", "india", "indian", "services", "service", "industries", "technologies", "technology", "solutions", "enterprises", "international", "global", "the", "and", "of", "&", "ipo", "co", "company", "corp", "corporation", "group"]);
const PRIORITY = /(ipo|listing|bell|founder|promoter|interview|journey|story|about|corporate|profile|md|ceo|chairman|managing director|factory|plant)/i;

interface SearchHit {
  id: string;
  title: string;
  owner: string | null;
}

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

async function searchYouTube(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en&gl=IN`, {
      headers: { "user-agent": BROWSER_UA, "accept-language": "en-IN,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    const seen = new Set<string>();
    const re = /"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < 12) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const chunk = html.slice(m.index, m.index + 6000);
      const title = chunk.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
      const owner = chunk.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)?.[1];
      hits.push({ id, title: title ? unescapeJson(title) : "", owner: owner ? unescapeJson(owner) : null });
    }
    return hits;
  } catch {
    return [];
  }
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

/** Search YouTube for the company's IPO coverage, founder interviews and corporate videos; keep only hits that name the company. */
async function companyVideos(companyName: string): Promise<{ url: string; score: number }[]> {
  const tokens = nameTokens(companyName);
  if (!tokens.length) return [];
  const short = tokens.slice(0, 3).join(" ");
  const queries = [`"${short}" IPO`, `"${short}" founder interview`, `${short} company corporate video`, `"${short}" listing ceremony`];
  const results = await Promise.allSettled(queries.map(searchYouTube));
  const scored = new Map<string, number>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const hit of r.value) {
      const hay = `${hit.title} ${hit.owner ?? ""}`.toLowerCase();
      const matched = tokens.filter((t) => hay.includes(t)).length;
      if (matched === 0) continue; // unrelated video that just ranked for the query
      const score = matched * 10 + (PRIORITY.test(hit.title) ? 5 : 0) + (hit.owner && tokens.some((t) => hit.owner!.toLowerCase().includes(t)) ? 3 : 0);
      const url = `https://www.youtube.com/watch?v=${hit.id}`;
      scored.set(url, Math.max(scored.get(url) ?? 0, score));
    }
  }
  return [...scored.entries()].map(([url, score]) => ({ url, score })).sort((a, b) => b.score - a.score);
}

export async function discoverMedia(input: { companyName: string; website: string | null; websiteHint: string | null; sourcePages: string[]; hintedImages: string[]; hintedVideos: string[] }): Promise<DiscoveredMedia> {
  const candidates = new Map<string, Omit<MediaImage, "bytes">>();
  const videoFrom = new Map<string, MediaVideo["from"]>();
  const addVideo = (url: string, from: MediaVideo["from"]) => {
    const id = youtubeId(url);
    if (id && !videoFrom.has(id)) videoFrom.set(id, from);
  };
  input.hintedVideos.forEach((v) => addVideo(v, "ai"));

  // 0. YouTube search for the company itself (runs alongside the page crawl below).
  const searchPromise = companyVideos(input.companyName);
  const add = (url: string, source: string, from: MediaImage["from"]) => {
    if (!candidates.has(url)) candidates.set(url, { url, source, from });
  };

  // 1. Company website: home page, then up to six "about / team / gallery" style pages linked from it.
  // The feed's web_url is used only when it is the company's own domain; otherwise fall back to the site Gemini found.
  const normalise = (u: string | null) => (u && u.trim() ? absolute(/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`, "https://example.invalid/") : null);
  const site = [normalise(input.website), normalise(input.websiteHint)].find((u) => u && !isAggregator(u)) ?? null;
  if (site) {
    const home = await fetchHtml(site);
    if (home) {
      pageImages(home.html, home.finalUrl).forEach((u) => add(u, host(home.finalUrl), "company site"));
      pageVideos(home.html).forEach((v) => addVideo(v, "page"));
      const subs = await Promise.allSettled(internalLinks(home.html, home.finalUrl).map((u) => fetchHtml(u, 6000)));
      for (const r of subs) {
        if (r.status !== "fulfilled" || !r.value) continue;
        pageImages(r.value.html, r.value.finalUrl, 25).forEach((u) => add(u, host(r.value!.finalUrl), "company site"));
        pageVideos(r.value.html).forEach((v) => addVideo(v, "page"));
      }
    }
  }

  // 2. Press coverage Gemini grounded on: lead image and any embedded YouTube video.
  const press = await Promise.allSettled(input.sourcePages.slice(0, 8).map((u) => fetchHtml(u, 6000)));
  for (const r of press) {
    if (r.status !== "fulfilled" || !r.value) continue;
    const og = metaImage(r.value.html, r.value.finalUrl);
    // Aggregator lead images are generic banners or another company's logo, never a photo of this business.
    if (og && !SKIP_NAME.test(og) && !isAggregator(r.value.finalUrl)) add(og, host(r.value.finalUrl), "press");
    pageVideos(r.value.html).forEach((v) => addVideo(v, "page"));
  }

  // 3. URLs Gemini quoted directly (least trusted, verified like everything else).
  input.hintedImages.forEach((u) => {
    const a = absolute(u, "https://example.invalid/");
    if (a && !SKIP_NAME.test(a) && !isAggregator(a)) add(a, host(a), "ai");
  });

  const ordered = [...candidates.values()].sort((a, b) => rank(a.from) - rank(b.from)).slice(0, 48);
  const checked = await Promise.allSettled(ordered.map(async (c) => ({ c, bytes: await verifyImage(c.url) })));
  const images: MediaImage[] = [];
  for (const r of checked) {
    if (r.status !== "fulfilled" || r.value.bytes === false) continue;
    images.push({ ...r.value.c, bytes: r.value.bytes });
    if (images.length >= 24) break;
  }

  // Videos: the company's own embeds first, then YouTube search hits by relevance, then anything Gemini quoted.
  const searched = await searchPromise;
  const orderedVideos: { url: string; from: MediaVideo["from"] }[] = [];
  for (const [id, from] of videoFrom) if (from === "page") orderedVideos.push({ url: `https://www.youtube.com/watch?v=${id}`, from });
  for (const s of searched) {
    const id = youtubeId(s.url)!;
    if (!videoFrom.has(id) || videoFrom.get(id) === "ai") {
      videoFrom.set(id, "youtube search");
      orderedVideos.push({ url: s.url, from: "youtube search" });
    }
  }
  for (const [id, from] of videoFrom) if (from === "ai") orderedVideos.push({ url: `https://www.youtube.com/watch?v=${id}`, from });
  const vchecked = await Promise.allSettled(orderedVideos.slice(0, 12).map((v) => verifyVideo(v.url, v.from)));
  const videos = vchecked.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])).slice(0, 8);

  return { images, videos };
}

function rank(from: MediaImage["from"]): number {
  return from === "company site" ? 0 : from === "press" ? 1 : 2;
}
