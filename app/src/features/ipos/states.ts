// State-wise view helpers (pure, unit-tested). State comes from what the team enters in the admin panel
// (public.ipo_admin_data); an IPO with nothing entered is "Not specified", never guessed.
import type { IpoStatus } from "@/features/ipos/types";

export const NOT_SPECIFIED = "Not specified";
/** Route parameter used for the "Not specified" group (a state name can never be this). */
export const NOT_SPECIFIED_PARAM = "not-specified";

export interface StateCount {
  /** null = no state entered */
  state: string | null;
  total: number;
  open: number;
  upcoming: number;
  closed: number;
  listed: number;
}

export function stateLabel(state: string | null | undefined): string {
  return state && state.trim() ? state : NOT_SPECIFIED;
}

export function stateToParam(state: string | null | undefined): string {
  return state && state.trim() ? state : NOT_SPECIFIED_PARAM;
}

/** Route parameter → state name, or null for the "Not specified" group. */
export function paramToState(param: string | string[] | undefined): string | null {
  const p = Array.isArray(param) ? param[0] : param;
  if (!p || p === NOT_SPECIFIED_PARAM) return null;
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

/** Named states by number of IPOs (most first, then A to Z); the "Not specified" group is returned separately. */
export function splitStateCounts(rows: StateCount[] | undefined): { states: StateCount[]; notSpecified: StateCount | null; totalIpos: number; withState: number } {
  const all = rows ?? [];
  const states = all.filter((r) => r.state && r.total > 0).sort((a, b) => b.total - a.total || (a.state as string).localeCompare(b.state as string));
  const notSpecified = all.find((r) => !r.state && r.total > 0) ?? null;
  const withState = states.reduce((n, r) => n + r.total, 0);
  return { states, notSpecified, totalIpos: withState + (notSpecified?.total ?? 0), withState };
}

/** "3 open · 2 upcoming · 40 listed" — only the non-zero parts, live statuses first. */
export function statusBreakdown(c: Pick<StateCount, IpoStatus>): string {
  const parts: string[] = [];
  if (c.open) parts.push(`${c.open} open`);
  if (c.upcoming) parts.push(`${c.upcoming} upcoming`);
  if (c.closed) parts.push(`${c.closed} closed`);
  if (c.listed) parts.push(`${c.listed} listed`);
  return parts.join(" · ");
}

/** The database objects for this feature may not exist yet on an older backend. */
export function isNotSetUpError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === "PGRST202" || e.code === "PGRST205" || e.code === "42P01" || e.code === "42883" || /ipo_state_counts|ipo_directory|schema cache/i.test(e.message ?? "")));
}
