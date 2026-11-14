// Paging helpers for long IPO lists (pure, unit-tested).
import type { IpoListItem } from "@/features/ipos/types";

export const IPO_PAGE_SIZE = 40;

export interface PageLike {
  rows: IpoListItem[];
  total: number;
  offset: number;
}

/** Offset of the next page, or undefined when everything is loaded (or a page came back empty). */
export function nextOffset(last: PageLike | undefined, pages: PageLike[]): number | undefined {
  if (!last || last.rows.length === 0) return undefined;
  const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
  return loaded < last.total ? loaded : undefined;
}

/**
 * All loaded rows in order, each IPO once. The list can shift while the user scrolls (an IPO lists, the sync
 * runs), so the same row can arrive on two pages; the first occurrence wins.
 */
export function flattenPages(pages: PageLike[] | undefined): IpoListItem[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: IpoListItem[] = [];
  for (const p of pages) {
    for (const r of p.rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

/** Total matching rows as reported by the newest page (it is the freshest count). */
export function totalOf(pages: PageLike[] | undefined): number | undefined {
  return pages?.length ? pages[pages.length - 1].total : undefined;
}
