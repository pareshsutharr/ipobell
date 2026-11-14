// POST /api/insights/import-image { ipo_id, url } → copies an image from the web into the `insights` storage
// bucket (so the app never hotlinks a third-party server) and returns its public URL. Admins only; the upload
// goes through the caller's own session, so the bucket's RLS still applies.
import { NextResponse, type NextRequest } from "next/server";

import { safeFetch, UnsafeUrlError } from "@/lib/safe-fetch";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // matches the bucket's file_size_limit
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

export async function POST(request: NextRequest) {
  try {
    const supabase = await supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { data: adminRow } = await supabase.from("admin_users").select("role").eq("user_id", auth.user.id).maybeSingle();
    if (!adminRow) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as { ipo_id?: string; url?: string };
    if (!body.ipo_id || !body.url) return NextResponse.json({ error: "ipo_id and url are required." }, { status: 400 });
    // safeFetch refuses private/local addresses and re-checks every redirect, so this route cannot be used to
    // reach the server's own network.
    let res: Response;
    let target: URL;
    try {
      const fetched = await safeFetch(body.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; BeIPOReadyAdmin/1.0)", accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
      res = fetched.response;
      target = new URL(fetched.finalUrl);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return NextResponse.json({ error: e.message }, { status: 400 });
      return NextResponse.json({ error: "The image server could not be reached." }, { status: 502 });
    }
    if (!res.ok) return NextResponse.json({ error: `The image server answered HTTP ${res.status}.` }, { status: 502 });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) return NextResponse.json({ error: `Unsupported image type (${type || "unknown"}). Use JPG, PNG, WebP or AVIF.` }, { status: 415 });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB." }, { status: 413 });
    if (buf.byteLength < 1024) return NextResponse.json({ error: "Image is empty." }, { status: 422 });

    const path = `${body.ipo_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("insights").upload(path, buf, { contentType: type, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data } = supabase.storage.from("insights").getPublicUrl(path);
    return NextResponse.json({ url: data.publicUrl, bytes: buf.byteLength, source: target.hostname });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
