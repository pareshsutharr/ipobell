// Saved balance sheet reports: the consent text, the shape of a saved report and how server answers are read.
// Pure. The reading and writing is in healthApi.ts.
import { sanitizeFigures, type YearFigures } from "@/features/business/health";
import { fileKind, type FileKind } from "@/features/business/sheetRead";

export const BALANCE_SHEET_BUCKET = "balance-sheets";
export const RETENTION_DAYS = 90;
export const MAX_SAVED_REPORTS = 5;

/** Changes whenever the consent wording below changes; stored with every saved report. */
export const BALANCE_SHEET_CONSENT_VERSION = "2026-11-16";
export const BALANCE_SHEET_CONSENT_TITLE = "Save the file and figures to my account";
export const BALANCE_SHEET_CONSENT: string[] = [
  "The file you chose and the figures on this screen are stored on Be IPO Ready's servers, in a private folder for your account.",
  "Be IPO Ready's advisory team can open them to prepare for a call with you. They are not shared with anyone else and are never sold.",
  `They are deleted automatically after ${RETENTION_DAYS} days. You can delete them sooner from this screen, and they are removed if you delete your account.`,
];
export const BALANCE_SHEET_CONSENT_CHECKBOX = "I agree to store this file and these figures as described above.";
/** Shown before a file is chosen: reading needs no consent because nothing leaves the phone. */
export const READ_ON_PHONE_NOTE = "Your file is read on this phone. Nothing is uploaded unless you choose to save it at the end.";

export const HEALTH_DISCLAIMER =
  "This report restates your own figures as ratios and compares them with published SME listing limits. It is general information, not a grade, an audit, an eligibility decision or advice. Limits change; an advisor confirms them against the current rules.";

export interface SavedReport {
  id: string;
  filePath: string;
  fileName: string;
  fileKind: FileKind;
  fileSize: number;
  figures: YearFigures[];
  figuresSource: "file" | "typed";
  createdAt: string;
  expiresAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A row of public.balance_sheet_reports, or null when it is not usable. */
export function parseSavedReport(row: unknown): SavedReport | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || !UUID.test(r.id)) return null;
  if (typeof r.file_path !== "string" || typeof r.file_name !== "string" || !r.file_name) return null;
  const kind = fileKind(r.file_path);
  if (!kind) return null;
  if (typeof r.created_at !== "string" || typeof r.expires_at !== "string" || Number.isNaN(Date.parse(r.created_at)) || Number.isNaN(Date.parse(r.expires_at))) return null;
  return {
    id: r.id,
    filePath: r.file_path,
    fileName: r.file_name,
    fileKind: kind,
    fileSize: typeof r.file_size === "number" && r.file_size > 0 ? r.file_size : 0,
    figures: sanitizeFigures(r.figures),
    figuresSource: r.figures_source === "typed" ? "typed" : "file",
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export function parseSavedReports(rows: unknown): SavedReport[] {
  return Array.isArray(rows) ? rows.map(parseSavedReport).filter((r): r is SavedReport => r !== null) : [];
}

/** <user id>/<report id>.<ext>: the only place the app may write (enforced by the storage policy). */
export function reportPath(userId: string, reportId: string, kind: FileKind): string {
  if (!UUID.test(userId) || !UUID.test(reportId)) throw new Error("bad id");
  return `${userId}/${reportId}.${kind}`;
}

/** A random id for a new report (not a secret: access is decided by the account, not by the id). */
export function newReportId(random: () => number = Math.random): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(random() * 4)]}${hex(3)}-${hex(12)}`;
}

/** Whole days until a saved report is deleted (0 on its last day). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  const ms = Date.parse(expiresAt) - now.getTime();
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / 86_400_000));
}

export function fileSizeLabel(bytes: number): string {
  if (!(bytes > 0)) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type SaveFailure = "not_set_up" | "limit" | "too_large" | "file_type" | "signed_out" | "offline" | "failed";

interface ServerError {
  code?: string;
  message?: string;
  statusCode?: string | number;
  status?: number;
  error?: string;
}

/** Why saving failed, from a database or storage error. */
export function classifySaveError(e: unknown): SaveFailure {
  const err = (e ?? {}) as ServerError;
  const msg = `${err.message ?? ""} ${err.error ?? ""}`;
  const status = String(err.statusCode ?? err.status ?? "");
  if (/REPORT_LIMIT/.test(msg)) return "limit";
  if (/SIGN_IN_REQUIRED|JWT|not authenticated/i.test(msg) || status === "401") return "signed_out";
  if (err.code === "PGRST205" || err.code === "PGRST202" || err.code === "42P01" || /bucket not found|balance_sheet_reports.*schema cache|schema cache.*balance_sheet_reports/i.test(msg)) return "not_set_up";
  if (status === "413" || /exceeded the maximum allowed size|payload too large/i.test(msg)) return "too_large";
  if (status === "415" || /mime type .* is not supported/i.test(msg)) return "file_type";
  if (/network request failed|failed to fetch|timeout/i.test(msg)) return "offline";
  return "failed";
}

export const SAVE_FAILURE_TEXT: Record<SaveFailure, string> = {
  not_set_up: "Saving is being set up. Your report above is complete; you can still send it to our team.",
  limit: `You already have ${MAX_SAVED_REPORTS} saved reports. Delete one below to save another.`,
  too_large: "This file is larger than 10 MB and cannot be saved.",
  file_type: "This kind of file cannot be saved. Use Excel, CSV or PDF.",
  signed_out: "Please sign in again to save the report.",
  offline: "No connection. Please try again.",
  failed: "The report could not be saved. Please try again.",
};
