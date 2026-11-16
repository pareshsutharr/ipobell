// Promoted IPOs (plan step 5.3): which IPOs are shown under the "Promoted" label and where. Pure, unit-tested.
// Off unless the `promoted_ipos` feature switch is on (held for legal review).
//
// Placement rules:
//  1. Promoted IPOs appear only in their own block on the home screen, titled with the label, and every card
//     in it carries the label too.
//  2. At most MAX_PROMOTED, and only IPOs that are upcoming or open.
//  3. The ordinary lists are never reordered or filtered: a promoted IPO keeps its normal place there, unlabelled,
//     because that place was not paid for.
//  4. Promotion never changes any number, the data score, a comparison or a search result.
import type { IpoListItem } from "@/features/ipos/types";

export const PROMOTED_LABEL = "Promoted";
export const PROMOTED_NOTE = "Promoted means a paid placement. It is not a recommendation, and it does not change how IPOs are ordered or described anywhere else in the app.";
export const MAX_PROMOTED = 2;

/** IPO ids returned by public.promoted_ipos(), in the server's order. */
export function parsePromoted(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const ids: string[] = [];
  for (const r of rows) {
    const id = r && typeof r === "object" ? (r as { ipo_id?: unknown }).ipo_id : null;
    if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_PROMOTED);
}

/** The cards for the promoted block. Empty when the switch is off, nothing is flagged, or the IPOs are not loaded. */
export function promotedBlock(switchOn: boolean, promotedIds: string[] | undefined, loaded: (IpoListItem[] | undefined)[]): IpoListItem[] {
  if (!switchOn || !promotedIds?.length) return [];
  const byId = new Map<string, IpoListItem>();
  for (const list of loaded) for (const ipo of list ?? []) if (!byId.has(ipo.id)) byId.set(ipo.id, ipo);
  return promotedIds
    .map((id) => byId.get(id))
    .filter((ipo): ipo is IpoListItem => Boolean(ipo) && (ipo!.status === "upcoming" || ipo!.status === "open"))
    .slice(0, MAX_PROMOTED);
}
