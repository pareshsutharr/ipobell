/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { BOARD_OPTIONS, FILTER_SECTORS, filterSummary, hasFilters, ipoPasses, NO_FILTERS, presetOf, readFilters, SIZE_PRESETS, toggleSector, type NotificationFilters } from "@/features/notifications/filters";

const f = (over: Partial<NotificationFilters> = {}): NotificationFilters => ({ ...NO_FILTERS, ...over });
const ipo = (board: "sme" | "mainboard", sector: string | null, size: number | null) => ({ board, sector, issue_size_cr: size });

describe("reading filters from a preferences row", () => {
  it("a row without the columns (older backend) means no filters", () => {
    expect(readFilters({})).toEqual(NO_FILTERS);
    expect(readFilters(null)).toEqual(NO_FILTERS);
    expect(readFilters(undefined)).toEqual(NO_FILTERS);
    expect(hasFilters(readFilters({}))).toBe(false);
  });

  it("reads saved values, including numbers that arrive as strings", () => {
    const r = readFilters({ filter_board: "sme", filter_sectors: ["Other", "Renewable Energy"], filter_min_issue_cr: "25.00" as unknown as number, filter_max_issue_cr: 100 });
    expect(r).toEqual({ filter_board: "sme", filter_sectors: ["Other", "Renewable Energy"], filter_min_issue_cr: 25, filter_max_issue_cr: 100 });
  });

  it("drops junk instead of trusting it", () => {
    const r = readFilters({ filter_board: "nasdaq" as never, filter_sectors: ["Made up", 5 as never, "Other"], filter_min_issue_cr: "abc" as never, filter_max_issue_cr: null });
    expect(r).toEqual({ filter_board: null, filter_sectors: ["Other"], filter_min_issue_cr: null, filter_max_issue_cr: null });
    expect(readFilters({ filter_sectors: [] }).filter_sectors).toBeNull();
  });
});

describe("size presets", () => {
  it("cover every size with shared, inclusive edges and no gaps", () => {
    const bands = SIZE_PRESETS.filter((p) => p.key !== "any");
    expect(bands[0].min).toBeNull();
    expect(bands[bands.length - 1].max).toBeNull();
    for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBe(bands[i - 1].max);
    for (const p of bands) if (p.min !== null && p.max !== null) expect(p.min).toBeLessThan(p.max);
  });

  it("recognises a saved range as its preset, and a custom range as none", () => {
    expect(presetOf(f())?.key).toBe("any");
    expect(presetOf(f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }))?.key).toBe("mid");
    expect(presetOf(f({ filter_min_issue_cr: 500 }))?.key).toBe("xl");
    expect(presetOf(f({ filter_min_issue_cr: 40, filter_max_issue_cr: 60 }))).toBeNull();
  });
});

describe("choosing sectors", () => {
  it("adds and removes, keeping the list order", () => {
    expect(toggleSector(null, "Renewable Energy")).toEqual(["Renewable Energy"]);
    expect(toggleSector(["Renewable Energy"], "Pharma / Healthcare")).toEqual(["Pharma / Healthcare", "Renewable Energy"]);
    expect(toggleSector(["Pharma / Healthcare", "Renewable Energy"], "Renewable Energy")).toEqual(["Pharma / Healthcare"]);
  });

  it("none chosen and all chosen both mean 'all' (stored as null)", () => {
    expect(toggleSector(["Other"], "Other")).toBeNull();
    const allButOne = FILTER_SECTORS.slice(1);
    expect(toggleSector(allButOne, FILTER_SECTORS[0])).toBeNull();
  });

  it("uses the same sector names as the admin panel", () => {
    const admin = fs.readFileSync(path.join(__dirname, "../../../admin/src/lib/ipo-admin-data.ts"), "utf8");
    const block = /export const SECTORS = \[([\s\S]*?)\] as const;/.exec(admin);
    expect(block).not.toBeNull();
    const adminSectors = [...(block as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(FILTER_SECTORS).toEqual(adminSectors);
  });
});

describe("summary line", () => {
  it("describes the filters in words", () => {
    expect(filterSummary(f())).toBe("All IPOs");
    expect(filterSummary(f({ filter_board: "sme" }))).toBe("SME IPOs");
    expect(filterSummary(f({ filter_board: "mainboard", filter_min_issue_cr: 500 }))).toBe("Mainboard IPOs · Above ₹500 Cr");
    expect(filterSummary(f({ filter_sectors: ["Other"] }))).toBe("SME and Mainboard · Other");
    expect(filterSummary(f({ filter_board: "sme", filter_sectors: ["Other", "Renewable Energy"], filter_min_issue_cr: 25, filter_max_issue_cr: 100 }))).toBe("SME IPOs · 2 sectors · ₹25 – 100 Cr");
    expect(filterSummary(f({ filter_min_issue_cr: 40, filter_max_issue_cr: 60 }))).toBe("SME and Mainboard · ₹40 – 60 Cr");
    expect(filterSummary(f({ filter_max_issue_cr: 60 }))).toBe("SME and Mainboard · Up to ₹60 Cr");
  });

  it("board options are both, SME, Mainboard", () => {
    expect(BOARD_OPTIONS.map((o) => o.value)).toEqual([null, "sme", "mainboard"]);
  });
});

describe("which IPOs pass (same rule as the server)", () => {
  // The same cases as the database truth table in supabase/migrations/20261114000900 tests.
  const cases: [string, NotificationFilters, ReturnType<typeof ipo>, boolean][] = [
    ["no filters pass everything", f(), ipo("sme", "Other", 10), true],
    ["board mismatch", f({ filter_board: "sme" }), ipo("mainboard", "Other", 10), false],
    ["sector match", f({ filter_sectors: ["Textile / Apparel", "Other"] }), ipo("sme", "Other", 10), true],
    ["sector mismatch", f({ filter_sectors: ["Textile / Apparel"] }), ipo("sme", "Other", 10), false],
    ["sector not entered still passes", f({ filter_sectors: ["Textile / Apparel"] }), ipo("sme", null, 10), true],
    ["size at lower bound", f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }), ipo("sme", "Other", 25), true],
    ["size at upper bound", f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }), ipo("sme", "Other", 100), true],
    ["size below range", f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }), ipo("sme", "Other", 24.99), false],
    ["size above range", f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }), ipo("sme", "Other", 100.01), false],
    ["size not announced still passes", f({ filter_min_issue_cr: 25, filter_max_issue_cr: 100 }), ipo("sme", "Other", null), true],
    ["all three must hold", f({ filter_board: "sme", filter_sectors: ["Other"], filter_max_issue_cr: 50 }), ipo("sme", "Pharma / Healthcare", 10), false],
  ];
  it.each(cases)("%s", (_label, filters, target, want) => {
    expect(ipoPasses(filters, target)).toBe(want);
  });

  it("a watchlisted IPO always passes", () => {
    expect(ipoPasses(f({ filter_board: "mainboard", filter_sectors: ["Other"], filter_min_issue_cr: 500 }), ipo("sme", "Textile / Apparel", 10), true)).toBe(true);
  });
});
