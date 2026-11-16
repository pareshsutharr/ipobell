// Saving, listing and deleting balance sheet reports (public.balance_sheet_reports + the private
// `balance-sheets` bucket). Nothing here runs until the user has ticked the consent box.
import type { YearFigures } from "@/features/business/health";
import { BALANCE_SHEET_BUCKET, BALANCE_SHEET_CONSENT_VERSION, classifySaveError, newReportId, parseSavedReport, parseSavedReports, reportPath, type SavedReport, type SaveFailure } from "@/features/business/healthSaved";
import { MIME_BY_KIND, type FileKind } from "@/features/business/sheetRead";
import { supabase } from "@/lib/supabase";

export class SaveError extends Error {
  reason: SaveFailure;
  constructor(reason: SaveFailure) {
    super(reason);
    this.reason = reason;
  }
}

const COLUMNS = "id, file_path, file_name, file_size, file_kind, figures, figures_source, created_at, expires_at";

/** The user's saved reports, newest first. null = the feature is not set up on the server yet. */
export async function fetchSavedReports(): Promise<SavedReport[] | null> {
  const { data, error } = await supabase.from("balance_sheet_reports").select(COLUMNS).order("created_at", { ascending: false }).limit(10);
  if (error) {
    if (classifySaveError(error) === "not_set_up") return null;
    throw error;
  }
  return parseSavedReports(data);
}

export interface SaveInput {
  userId: string;
  bytes: Uint8Array;
  fileName: string;
  kind: FileKind;
  figures: YearFigures[];
  figuresSource: "file" | "typed";
}

/** Upload the file, then record the report. If the record fails the file is removed again. */
export async function saveReport(input: SaveInput): Promise<SavedReport> {
  const id = newReportId();
  const path = reportPath(input.userId, id, input.kind);
  const bucket = supabase.storage.from(BALANCE_SHEET_BUCKET);
  const body = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;

  const up = await bucket.upload(path, body, { contentType: MIME_BY_KIND[input.kind], upsert: false });
  if (up.error) throw new SaveError(classifySaveError(up.error));

  const { data, error } = await supabase
    .from("balance_sheet_reports")
    .insert({ id, file_path: path, file_name: input.fileName.slice(0, 200), file_size: input.bytes.byteLength, file_kind: input.kind, figures: input.figures, figures_source: input.figuresSource, consent_version: BALANCE_SHEET_CONSENT_VERSION })
    .select(COLUMNS)
    .single();
  const saved = error ? null : parseSavedReport(data);
  if (!saved) {
    await bucket.remove([path]).catch(() => undefined); // do not leave a file nobody can see in the list
    throw new SaveError(error ? classifySaveError(error) : "failed");
  }
  return saved;
}

/** Remove the file first, then the record: if the file cannot be removed the report stays listed so the user can retry. */
export async function deleteReport(report: Pick<SavedReport, "id" | "filePath">): Promise<void> {
  const { error: fileError } = await supabase.storage.from(BALANCE_SHEET_BUCKET).remove([report.filePath]);
  if (fileError) throw new SaveError(classifySaveError(fileError));
  const { error } = await supabase.from("balance_sheet_reports").delete().eq("id", report.id);
  if (error) throw new SaveError(classifySaveError(error));
}
