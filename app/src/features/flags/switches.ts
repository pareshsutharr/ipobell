// Feature switches (public.feature_switches). Two features are held for legal review and start OFF; a super
// admin turns them on in the admin panel. Anything unreadable, missing or unexpected counts as off.
// Pure; the hook that reads the table is in useFeatureSwitches.ts.
export interface FeatureSwitches {
  /** Data score on IPO pages (plan step 5.2). */
  dataScore: boolean;
  /** "Promoted" block on the home screen (plan step 5.3). */
  promotedIpos: boolean;
}

export const ALL_OFF: FeatureSwitches = { dataScore: false, promotedIpos: false };

/** Only an explicit `enabled: true` turns a feature on. */
export function parseSwitches(rows: unknown): FeatureSwitches {
  const out = { ...ALL_OFF };
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { key, enabled } = r as { key?: unknown; enabled?: unknown };
    if (key === "data_score") out.dataScore = enabled === true;
    else if (key === "promoted_ipos") out.promotedIpos = enabled === true;
  }
  return out;
}
