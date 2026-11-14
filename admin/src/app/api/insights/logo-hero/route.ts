// POST /api/insights/logo-hero { ipo_id } → builds a 1200×675 hero image from the company's logo (from the
// IPO feed) on a clean card, stores it in the `insights` bucket and returns the public URL. Works for every
// IPO that has a logo, so an insight never has to go out without a hero. Admins only; upload runs through the
// caller's session so bucket RLS applies.
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";

import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

const W = 1200;
const H = 675;
const CARD_W = 760;
const CARD_H = 400;
const LOGO_MAX_W = 560;
const LOGO_MAX_H = 260;

function backdrop(): Buffer {
  // Cream canvas, white card with a hairline border, gold rule under the card. Matches the app's palette.
  const x = (W - CARD_W) / 2;
  const y = (H - CARD_H) / 2;
  return Buffer.from(
    `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#F1EFE9"/>
      <circle cx="${W - 120}" cy="-60" r="300" fill="#E9E5DA"/>
      <circle cx="80" cy="${H + 40}" r="220" fill="#E9E5DA"/>
      <rect x="${x + 6}" y="${y + 10}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="#DAD5C8"/>
      <rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="28" fill="#FFFFFF" stroke="#E2DED3" stroke-width="2"/>
      <rect x="${x + 60}" y="${y + CARD_H - 34}" width="${CARD_W - 120}" height="4" rx="2" fill="#C9962B"/>
    </svg>`,
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { data: adminRow } = await supabase.from("admin_users").select("role").eq("user_id", auth.user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { ipo_id?: string };
    if (!body.ipo_id) return NextResponse.json({ error: "ipo_id is required." }, { status: 400 });
    const { data: ipo, error } = await supabase.from("ipos").select("id, name, logo_url").eq("id", body.ipo_id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ipo) return NextResponse.json({ error: "IPO not found." }, { status: 404 });
    if (!ipo.logo_url) return NextResponse.json({ error: "This IPO has no logo in the feed." }, { status: 422 });

    const res = await fetch(ipo.logo_url, { headers: { "user-agent": "Mozilla/5.0 (compatible; BeIPOReadyAdmin/1.0)", accept: "image/*" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return NextResponse.json({ error: `Could not download the logo (HTTP ${res.status}).` }, { status: 502 });
    const logoBuf = Buffer.from(await res.arrayBuffer());
    if (logoBuf.byteLength < 200) return NextResponse.json({ error: "The logo file is empty." }, { status: 422 });

    // Fit the logo inside the card, upscaling small feed logos at most 3× so they do not look blurry.
    const meta = await sharp(logoBuf).metadata();
    const srcW = meta.width ?? LOGO_MAX_W;
    const srcH = meta.height ?? LOGO_MAX_H;
    const scale = Math.min(LOGO_MAX_W / srcW, LOGO_MAX_H / srcH, 3);
    const logo = await sharp(logoBuf)
      .resize({ width: Math.max(1, Math.round(srcW * scale)), height: Math.max(1, Math.round(srcH * scale)), fit: "inside" })
      .png()
      .toBuffer();
    const logoMeta = await sharp(logo).metadata();
    const lw = logoMeta.width ?? 0;
    const lh = logoMeta.height ?? 0;

    const hero = await sharp(backdrop())
      .composite([{ input: logo, left: Math.round((W - lw) / 2), top: Math.round((H - lh) / 2 - 10) }])
      .webp({ quality: 90 })
      .toBuffer();

    const path = `${ipo.id}/hero-logo-${crypto.randomUUID()}.webp`;
    const { error: upErr } = await supabase.storage.from("insights").upload(path, hero, { contentType: "image/webp", upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    const { data } = supabase.storage.from("insights").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, bytes: hero.byteLength });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
