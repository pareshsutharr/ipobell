// Checklist ticks: saved on the phone and, when signed in, to the account (public.checklist_progress) so they
// follow the user to another device. Pure decisions here; the screen does the reading and writing.
import { CHECKLIST, checklistKey } from "@/features/business/tools";

export type Done = Record<string, boolean>;

export interface LocalChecklist {
  done: Done;
  /** The phone has ticks the account has not received yet. */
  dirty: boolean;
}

const VALID_KEYS: ReadonlySet<string> = new Set(CHECKLIST.flatMap((phase) => phase.items.map((_, i) => checklistKey(phase.key, i))));

/** Keep only real checklist items that are ticked. Anything else (old keys, false, junk) is dropped. */
export function sanitizeDone(input: unknown): Done {
  const out: Done = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === true && VALID_KEYS.has(k)) out[k] = true;
  }
  return out;
}

/** What is stored on the phone. Reads the old format (a plain map of ticks) as "not yet sent to the account". */
export function parseLocal(raw: string | null): LocalChecklist {
  if (!raw) return { done: {}, dirty: false };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "done" in parsed) {
      const p = parsed as { done?: unknown; dirty?: unknown };
      const done = sanitizeDone(p.done);
      return { done, dirty: Boolean(p.dirty) };
    }
    const done = sanitizeDone(parsed);
    return { done, dirty: Object.keys(done).length > 0 };
  } catch {
    return { done: {}, dirty: false };
  }
}

export interface OpenDecision {
  /** Ticks to show. */
  done: Done;
  /** Send `done` to the account now. */
  push: boolean;
}

/**
 * When the checklist opens and the account's copy has been fetched:
 *  - ticks made on this phone that the account has not seen win, and are sent;
 *  - otherwise the account's copy wins (it may come from another device);
 *  - with no account copy and nothing local, there is nothing to do.
 * `remote` is null when the account has no saved checklist, undefined when it could not be read.
 */
export function decideOnOpen(local: LocalChecklist, remote: unknown | null | undefined): OpenDecision {
  if (remote === undefined) return { done: local.done, push: false }; // offline or signed out: keep working locally
  if (local.dirty) return { done: local.done, push: true };
  if (remote === null) return { done: local.done, push: Object.keys(local.done).length > 0 };
  return { done: sanitizeDone(remote), push: false };
}

export function sameDone(a: Done, b: Done): boolean {
  const ka = Object.keys(a).filter((k) => a[k]);
  const kb = Object.keys(b).filter((k) => b[k]);
  return ka.length === kb.length && ka.every((k) => b[k]);
}
