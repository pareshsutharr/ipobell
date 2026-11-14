import { describe, expect, it } from "@jest/globals";

import { flattenPages, IPO_PAGE_SIZE, nextOffset, totalOf, type PageLike } from "@/features/ipos/paging";
import type { IpoListItem } from "@/features/ipos/types";

const row = (id: string) => ({ id, slug: id, name: id }) as unknown as IpoListItem;
const page = (ids: string[], total: number, offset: number): PageLike => ({ rows: ids.map(row), total, offset });
const ids = (from: number, n: number) => Array.from({ length: n }, (_, i) => `ipo-${from + i}`);

describe("nextOffset", () => {
  it("asks for the next page while rows remain", () => {
    const p1 = page(ids(0, 40), 524, 0);
    expect(nextOffset(p1, [p1])).toBe(40);
    const p2 = page(ids(40, 40), 524, 40);
    expect(nextOffset(p2, [p1, p2])).toBe(80);
  });

  it("stops when everything is loaded", () => {
    const p1 = page(ids(0, 40), 60, 0);
    const p2 = page(ids(40, 20), 60, 40);
    expect(nextOffset(p2, [p1, p2])).toBeUndefined();
    const exact = page(ids(0, 40), 40, 0);
    expect(nextOffset(exact, [exact])).toBeUndefined();
  });

  it("stops on an empty page even if the count says more (rows were removed meanwhile)", () => {
    const p1 = page(ids(0, 40), 100, 0);
    const empty = page([], 100, 40);
    expect(nextOffset(empty, [p1, empty])).toBeUndefined();
    expect(nextOffset(undefined, [])).toBeUndefined();
  });

  it("walks a 524-row list in 14 pages and ends", () => {
    const total = 524;
    const pages: PageLike[] = [];
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const p = page(ids(offset, Math.min(IPO_PAGE_SIZE, total - offset)), total, offset);
      pages.push(p);
      offset = nextOffset(p, pages);
      expect(pages.length).toBeLessThan(50);
    }
    expect(pages.length).toBe(14);
    expect(flattenPages(pages).length).toBe(524);
  });
});

describe("flattenPages", () => {
  it("keeps order across pages", () => {
    expect(flattenPages([page(["a", "b"], 4, 0), page(["c", "d"], 4, 2)]).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("shows each IPO once when the list shifted between page loads", () => {
    // A new IPO listed after page 1 was loaded: everything moved down one, so "b" arrives again on page 2.
    expect(flattenPages([page(["a", "b"], 5, 0), page(["b", "c"], 5, 2)]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("handles nothing loaded", () => {
    expect(flattenPages(undefined)).toEqual([]);
    expect(flattenPages([])).toEqual([]);
    expect(flattenPages([page([], 0, 0)])).toEqual([]);
  });
});

describe("totalOf", () => {
  it("uses the newest page's count", () => {
    expect(totalOf([page(["a"], 10, 0), page(["b"], 11, 1)])).toBe(11);
    expect(totalOf(undefined)).toBeUndefined();
    expect(totalOf([])).toBeUndefined();
  });
});
