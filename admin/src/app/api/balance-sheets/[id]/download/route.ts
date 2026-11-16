// GET /api/balance-sheets/<report id>/download → redirects to a link for the uploaded file that works for one minute.
// Admins only: the report row and the file are read with the signed-in admin's own session, so the database's
// row-level security decides. Anyone else gets "not found".
import { NextResponse, type NextRequest } from "next/server";

import { BALANCE_SHEET_BUCKET, isUuid, safeDownloadName } from "@/lib/balance-sheets";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/balance-sheets/[id]/download">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const { data: report } = await supabase.from("balance_sheet_reports").select("file_path, file_name").eq("id", id).maybeSingle();
  if (!report) return NextResponse.json({ error: "Not found. The report may have been deleted by its owner or after 90 days." }, { status: 404 });

  const { data: signed, error } = await supabase.storage.from(BALANCE_SHEET_BUCKET).createSignedUrl(report.file_path as string, 60, { download: safeDownloadName(report.file_name as string) });
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "The file could not be opened." }, { status: 404 });

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
