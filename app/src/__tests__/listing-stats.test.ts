import { describe, expect, it } from "@jest/globals";

import { hitRate, periodLabel, SMALL_SAMPLE, STAT_PERIODS, summarise } from "@/features/ipos/stats";
import type { ListingStats } from "@/features/ipos/types";

const stats = (over: Partial<ListingStats> = {}): ListingStats => ({
  count: 50, avg_listing_gain: 18.42, median_listing_gain: 9.5, positive_count: 34, negative_count: 14, flat_count: 2,
  best: { slug: "best", name: "Best Ltd", gain: 140 }, worst: { slug: "worst", name: "Worst Ltd", gain: -32 }, avg_current_gain: 11.2, total_raised_cr: 2450.75, ...over,
});

describe("hitRate", () => {
  it("is the share that listed above issue price, one decimal", () => {
    expect(hitRate(stats())).toBe(68);
    expect(hitRate({ count: 3, positive_count: 2 })).toBe(66.7);
    expect(hitRate({ count: 7, positive_count: 7 })).toBe(100);
    expect(hitRate({ count: 7, positive_count: 0 })).toBe(0);
  });

  it("is null when there is nothing to measure", () => {
    expect(hitRate({ count: 0, positive_count: 0 })).toBeNull();
    expect(hitRate(null)).toBeNull();
    expect(hitRate(undefined)).toBeNull();
  });
});

describe("summarise", () => {
  it("passes the database numbers through unchanged", () => {
    expect(summarise(stats())).toEqual({ count: 50, hitRate: 68, hitRateDetail: "34 of 50 listed above issue price", avgListingGain: 18.42, medianListingGain: 9.5, avgCurrentGain: 11.2, totalRaisedCr: 2450.75, smallSample: false });
  });

  it("an empty period shows no numbers rather than zeros", () => {
    // What the database function returns when no IPO matches: count 0 and nulls.
    const empty = summarise({ count: 0, avg_listing_gain: null, median_listing_gain: null, positive_count: 0, negative_count: 0, flat_count: 0, best: null, worst: null, avg_current_gain: null, total_raised_cr: null });
    expect(empty).toEqual({ count: 0, hitRate: null, hitRateDetail: "No listings in this period", avgListingGain: null, medianListingGain: null, avgCurrentGain: null, totalRaisedCr: null, smallSample: false });
    expect(summarise(undefined).count).toBe(0);
    expect(summarise(null).hitRate).toBeNull();
  });

  it("flags a small sample", () => {
    expect(summarise(stats({ count: SMALL_SAMPLE - 1, positive_count: 2 })).smallSample).toBe(true);
    expect(summarise(stats({ count: SMALL_SAMPLE, positive_count: 2 })).smallSample).toBe(false);
    expect(summarise(stats({ count: 1, positive_count: 1 })).hitRate).toBe(100);
  });

  it("keeps negative averages negative", () => {
    const s = summarise(stats({ avg_listing_gain: -4.25, median_listing_gain: -1, avg_current_gain: -12 }));
    expect([s.avgListingGain, s.medianListingGain, s.avgCurrentGain]).toEqual([-4.25, -1, -12]);
  });
});

describe("periods", () => {
  it("offers 3, 6, 12 months and all", () => {
    expect(STAT_PERIODS.map((p) => p.months)).toEqual([3, 6, 12, 0]);
  });

  it("labels each period in words", () => {
    expect(periodLabel(3)).toBe("the last 3 months");
    expect(periodLabel(12)).toBe("the last 12 months");
    expect(periodLabel(0)).toBe("all listed IPOs on record");
  });
});
