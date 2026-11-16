// The two features held for legal review (public.feature_switches) and the promotion fields on an IPO.
// Pure helpers for the admin panel; tests/held-features.test.ts.

export type SwitchKey = "data_score" | "promoted_ipos";

export const HELD_FEATURES: { key: SwitchKey; title: string; what: string; before: string }[] = [
  {
    key: "data_score",
    title: "Data score on IPO pages",
    what: "Shows a score out of 100 on every IPO page: points for revenue growth, profit margin, debt and P/E, with the full table next to it. It is labelled “Data score” and says it is not a rating or a recommendation.",
    before: "Your plan says: do not build before legal advice. Turn it on only after your legal adviser has approved showing a score on IPOs.",
  },
  {
    key: "promoted_ipos",
    title: "Promoted IPOs on the home screen",
    what: "Shows up to two IPOs you have marked as promoted in a separate block on the home screen, labelled “Promoted” with a line saying it is a paid placement. Ordinary lists are not reordered.",
    before: "Your plan says: legal review first. Turn it on only after your legal adviser has approved paid placements and the wording of the label.",
  },
];

/** Rows of feature_switches → which are on. Only an explicit true counts. */
export function readSwitches(rows: unknown): Record<SwitchKey, boolean> {
  const out: Record<SwitchKey, boolean> = { data_score: false, promoted_ipos: false };
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const { key, enabled } = r as { key?: unknown; enabled?: unknown };
    if (key === "data_score" || key === "promoted_ipos") out[key] = enabled === true;
  }
  return out;
}

export interface Promotion {
  is_promoted: boolean;
  /** yyyy-mm-dd, or null for "until the IPO closes". */
  promoted_until: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why this promotion cannot be saved; null when it is fine. `today` is yyyy-mm-dd in India. */
export function checkPromotion(p: Promotion, today: string): string | null {
  if (p.promoted_until !== null) {
    if (!DATE.test(p.promoted_until) || Number.isNaN(Date.parse(`${p.promoted_until}T00:00:00Z`))) return "The end date is not a valid date.";
    if (p.is_promoted && p.promoted_until < today) return "The end date is in the past, so the IPO would not be shown.";
    if (!p.is_promoted) return "Remove the end date, or tick Promoted.";
  }
  return null;
}

/** What the app does with this IPO right now, in words. */
export function promotionStatus(p: Promotion, ipoStatus: string, switchOn: boolean, today: string): string {
  if (!p.is_promoted) return "Not promoted.";
  if (p.promoted_until !== null && p.promoted_until < today) return "Marked as promoted, but the end date has passed: not shown.";
  if (ipoStatus !== "upcoming" && ipoStatus !== "open") return "Marked as promoted, but the IPO is no longer upcoming or open: not shown.";
  if (!switchOn) return "Marked as promoted, but the Promoted IPOs feature is switched off (Settings): not shown.";
  return `Shown under the “Promoted” label on the home screen${p.promoted_until ? ` until ${p.promoted_until}` : " until the IPO closes"}. At most two IPOs are shown at a time, earliest opening first.`;
}

export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function promotionError(message: string): string {
  if (/ONLY_SUPER_ADMIN_PROMOTES/.test(message)) return "Only a super admin can mark an IPO as promoted.";
  if (/promoted_until|schema cache/i.test(message)) return "Promotion is not set up in the database yet. Apply the migration 20261116000200_data_score_and_promoted.sql.";
  return message;
}
