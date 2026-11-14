// Notification filters: board, sector and issue size (pure, unit-tested). The server applies them when it picks
// recipients (private.notification_recipients in supabase/migrations/20261114000900_notification_filters.sql).
import { SECTOR_PE } from "@/features/business/tools";
import type { Board, NotificationPreferences } from "@/features/ipos/types";

export type NotificationFilters = Pick<NotificationPreferences, "filter_board" | "filter_sectors" | "filter_min_issue_cr" | "filter_max_issue_cr">;

/** The same sector names the admin panel offers for each IPO. */
export const FILTER_SECTORS: string[] = SECTOR_PE.map((s) => s.sector);

export const BOARD_OPTIONS: { value: Board | null; label: string }[] = [
  { value: null, label: "Both" },
  { value: "sme", label: "SME" },
  { value: "mainboard", label: "Mainboard" },
];

export interface SizePreset {
  key: string;
  label: string;
  min: number | null;
  max: number | null;
}

/** Issue size bands in Rs crore. Bounds are inclusive on the server, so neighbouring bands share their edge. */
export const SIZE_PRESETS: SizePreset[] = [
  { key: "any", label: "Any size", min: null, max: null },
  { key: "small", label: "Up to ₹25 Cr", min: null, max: 25 },
  { key: "mid", label: "₹25 – 100 Cr", min: 25, max: 100 },
  { key: "large", label: "₹100 – 500 Cr", min: 100, max: 500 },
  { key: "xl", label: "Above ₹500 Cr", min: 500, max: null },
];

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Read filters from a preferences row. A backend without the columns (or junk values) reads as "no filters". */
export function readFilters(prefs: Partial<NotificationFilters> | null | undefined): NotificationFilters {
  const board = prefs?.filter_board === "sme" || prefs?.filter_board === "mainboard" ? prefs.filter_board : null;
  const sectors = Array.isArray(prefs?.filter_sectors) ? prefs.filter_sectors.filter((s): s is string => typeof s === "string" && FILTER_SECTORS.includes(s)) : [];
  return { filter_board: board, filter_sectors: sectors.length ? sectors : null, filter_min_issue_cr: num(prefs?.filter_min_issue_cr), filter_max_issue_cr: num(prefs?.filter_max_issue_cr) };
}

export function presetOf(f: Pick<NotificationFilters, "filter_min_issue_cr" | "filter_max_issue_cr">): SizePreset | null {
  return SIZE_PRESETS.find((p) => p.min === num(f.filter_min_issue_cr) && p.max === num(f.filter_max_issue_cr)) ?? null;
}

/** Add or remove one sector. Selecting every sector is the same as selecting none: stored as null ("all"). */
export function toggleSector(current: string[] | null | undefined, sector: string): string[] | null {
  const set = new Set(current ?? []);
  if (set.has(sector)) set.delete(sector);
  else set.add(sector);
  const next = FILTER_SECTORS.filter((s) => set.has(s));
  return next.length === 0 || next.length === FILTER_SECTORS.length ? null : next;
}

export function hasFilters(f: NotificationFilters): boolean {
  return Boolean(f.filter_board || (f.filter_sectors && f.filter_sectors.length) || f.filter_min_issue_cr !== null || f.filter_max_issue_cr !== null);
}

export const NO_FILTERS: NotificationFilters = { filter_board: null, filter_sectors: null, filter_min_issue_cr: null, filter_max_issue_cr: null };

/** One sentence describing who the alerts are now limited to, e.g. "SME IPOs · 2 sectors · ₹25 – 100 Cr". */
export function filterSummary(f: NotificationFilters): string {
  if (!hasFilters(f)) return "All IPOs";
  const parts: string[] = [];
  parts.push(f.filter_board === "sme" ? "SME IPOs" : f.filter_board === "mainboard" ? "Mainboard IPOs" : "SME and Mainboard");
  const n = f.filter_sectors?.length ?? 0;
  if (n === 1) parts.push((f.filter_sectors as string[])[0]);
  else if (n > 1) parts.push(`${n} sectors`);
  const preset = presetOf(f);
  if (preset && preset.key !== "any") parts.push(preset.label);
  else if (!preset) {
    const min = num(f.filter_min_issue_cr);
    const max = num(f.filter_max_issue_cr);
    parts.push(min !== null && max !== null ? `₹${min} – ${max} Cr` : min !== null ? `Above ₹${min} Cr` : `Up to ₹${max} Cr`);
  }
  return parts.join(" · ");
}

/**
 * The same rule the server uses, for tests and for explaining a filter in the app. A watchlisted IPO always passes;
 * a sector or size that is not known yet never blocks.
 */
export function ipoPasses(f: NotificationFilters, ipo: { board: Board; sector: string | null; issue_size_cr: number | null }, watchlisted = false): boolean {
  if (watchlisted) return true;
  if (f.filter_board && ipo.board !== f.filter_board) return false;
  if (f.filter_sectors && f.filter_sectors.length && ipo.sector !== null && !f.filter_sectors.includes(ipo.sector)) return false;
  const min = num(f.filter_min_issue_cr);
  const max = num(f.filter_max_issue_cr);
  if (min !== null && ipo.issue_size_cr !== null && ipo.issue_size_cr < min) return false;
  if (max !== null && ipo.issue_size_cr !== null && ipo.issue_size_cr > max) return false;
  return true;
}
