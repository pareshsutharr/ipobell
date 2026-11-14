import { describe, expect, it } from "@jest/globals";

import { parseSectorStat, sectorHitRate, sectorToParam, splitSectorStats, type SectorStat } from "@/features/ipos/sectors";
import { isNotSetUpError, NOT_SPECIFIED_PARAM, paramToState } from "@/features/ipos/states";

const s = (sector: string | null, total: number, over: Partial<SectorStat> = {}): SectorStat => ({ sector, total, open: 0, upcoming: 0, closed: 0, listed: total, avgListingGain: null, listedAboveIssue: 0, listedWithPrice: 0, avgSubscription: null, totalRaisedCr: null, ...over });

describe("reading a row from the database", () => {
  it("accepts numbers and numeric strings, keeps unknown averages as null", () => {
    const r = parseSectorStat({ sector: "Textile / Apparel", total: "5", open: 1, upcoming: 0, closed: 0, listed: "4", avg_listing_gain: "13.33", listed_above_issue: 2, listed_with_price: 3, avg_subscription: 13.7, total_raised_cr: "585.00" });
    expect(r).toEqual({ sector: "Textile / Apparel", total: 5, open: 1, upcoming: 0, closed: 0, listed: 4, avgListingGain: 13.33, listedAboveIssue: 2, listedWithPrice: 3, avgSubscription: 13.7, totalRaisedCr: 585 });
    const none = parseSectorStat({ sector: null, total: 2, avg_listing_gain: null, avg_subscription: null });
    expect(none.sector).toBeNull();
    expect(none.avgListingGain).toBeNull();
    expect(none.avgSubscription).toBeNull();
    expect(none.listedWithPrice).toBe(0);
  });

  it("an average of zero stays zero, it is not 'unknown'", () => {
    expect(parseSectorStat({ sector: "Pharma / Healthcare", total: 2, avg_listing_gain: 0 }).avgListingGain).toBe(0);
  });
});

describe("hit rate", () => {
  it("share listed above issue price, one decimal; null when nothing has listed", () => {
    expect(sectorHitRate({ listedAboveIssue: 2, listedWithPrice: 3 })).toBe(66.7);
    expect(sectorHitRate({ listedAboveIssue: 0, listedWithPrice: 4 })).toBe(0);
    expect(sectorHitRate({ listedAboveIssue: 0, listedWithPrice: 0 })).toBeNull();
  });
});

describe("ordering the sectors", () => {
  const rows = [
    s("Textile / Apparel", 5, { avgListingGain: 13.33, avgSubscription: 13.7 }),
    s("Pharma / Healthcare", 2, { avgListingGain: 0, avgSubscription: 40 }),
    s("Renewable Energy", 9, { avgListingGain: null, avgSubscription: null }),
    s(null, 30),
    s("Other", 0),
  ];

  it("by number of IPOs, with 'Not specified' kept apart and empty sectors dropped", () => {
    const r = splitSectorStats(rows);
    expect(r.sectors.map((x) => x.sector)).toEqual(["Renewable Energy", "Textile / Apparel", "Pharma / Healthcare"]);
    expect(r.notSpecified?.total).toBe(30);
    expect(r.withSector).toBe(16);
    expect(r.totalIpos).toBe(46);
  });

  it("by listing gain or subscription, sectors without the figure last", () => {
    expect(splitSectorStats(rows, "gain").sectors.map((x) => x.sector)).toEqual(["Textile / Apparel", "Pharma / Healthcare", "Renewable Energy"]);
    expect(splitSectorStats(rows, "subscription").sectors.map((x) => x.sector)).toEqual(["Pharma / Healthcare", "Textile / Apparel", "Renewable Energy"]);
  });

  it("a negative average sorts below zero but above 'unknown'", () => {
    const r = splitSectorStats([s("A", 1, { avgListingGain: -5 }), s("B", 1, { avgListingGain: null }), s("C", 1, { avgListingGain: 0 })], "gain");
    expect(r.sectors.map((x) => x.sector)).toEqual(["C", "A", "B"]);
  });

  it("no data, and input left untouched", () => {
    expect(splitSectorStats(undefined)).toEqual({ sectors: [], notSpecified: null, totalIpos: 0, withSector: 0 });
    const input = [s("B", 1), s("A", 2)];
    splitSectorStats(input);
    expect(input.map((x) => x.sector)).toEqual(["B", "A"]);
  });
});

describe("routes", () => {
  it("sector names with slashes and spaces survive the route", () => {
    for (const name of ["IT / Software Services", "Pharma / Healthcare", "Retail / E-commerce", "Other"]) {
      const param = sectorToParam(name);
      expect(param).not.toContain("/"); // a slash would split the route into two segments
      expect(paramToState(param)).toBe(name); // router passed it through untouched
      expect(paramToState(decodeURIComponent(param))).toBe(name); // router decoded it once
      expect(paramToState(encodeURIComponent(param))).toBe(name); // router encoded it again
    }
    expect(sectorToParam(null)).toBe(NOT_SPECIFIED_PARAM);
  });

  it("a backend without the sector function is recognised", () => {
    expect(isNotSetUpError({ code: "PGRST202", message: "Could not find the function public.ipo_sector_stats(p_board) in the schema cache" })).toBe(true);
  });
});
