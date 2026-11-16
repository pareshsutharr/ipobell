// Balance sheet files: what the nightly purge removes. Pure, so it is tested without a database.

export const BALANCE_SHEET_BUCKET = "balance-sheets";
/** <user id>/<report id>.<ext>, the only shape of path the app ever writes. */
export const BALANCE_SHEET_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$/;

export interface PurgeRow {
  reason: string;
  report_id: string | null;
  file_path: string;
}

export interface PurgePlan {
  /** Files to remove from storage. */
  paths: string[];
  /** Reports to delete once their file is gone: report id → file path. */
  reports: { id: string; path: string }[];
  /** Rows that were ignored because the path is not one the app writes. */
  skipped: number;
}

export function planPurge(rows: unknown): PurgePlan {
  const plan: PurgePlan = { paths: [], reports: [], skipped: 0 };
  if (!Array.isArray(rows)) return plan;
  const seen = new Set<string>();
  for (const raw of rows) {
    const r = raw as Partial<PurgeRow> | null;
    if (!r || typeof r.file_path !== "string" || !BALANCE_SHEET_PATH.test(r.file_path)) {
      plan.skipped += 1;
      continue;
    }
    if (!seen.has(r.file_path)) {
      seen.add(r.file_path);
      plan.paths.push(r.file_path);
    }
    if (r.reason === "expired" && typeof r.report_id === "string") plan.reports.push({ id: r.report_id, path: r.file_path });
  }
  return plan;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + Math.max(1, size)));
  return out;
}

/** Reports whose file was removed (or was already gone) and can now be deleted. */
export function reportsToDelete(plan: PurgePlan, failedPaths: Set<string>): string[] {
  return plan.reports.filter((r) => !failedPaths.has(r.path)).map((r) => r.id);
}
