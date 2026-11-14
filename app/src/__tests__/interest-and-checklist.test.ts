/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { decideOnOpen, parseLocal, sameDone, sanitizeDone } from "@/features/business/checklistSync";
import { INTEREST_TYPES, interestLead } from "@/features/business/interest";
import { CHECKLIST, CHECKLIST_TOTAL, checklistKey } from "@/features/business/tools";
import { interestLine, parseInterest } from "@/features/ipos/interest";

const K0 = checklistKey(CHECKLIST[0].key, 0);
const K1 = checklistKey(CHECKLIST[0].key, 1);
const K2 = checklistKey(CHECKLIST[1].key, 0);

describe("interest signal", () => {
  it("reads the database answer", () => {
    expect(parseInterest({ watchers: 7, viewers_30d: 9 })).toEqual({ watchers: 7, viewers: 9 });
    expect(parseInterest({ watchers: null, viewers_30d: null })).toEqual({ watchers: null, viewers: null });
  });

  it("never shows a number below 3, even if a server sent one", () => {
    expect(parseInterest({ watchers: 2, viewers_30d: 1 })).toEqual({ watchers: null, viewers: null });
    expect(parseInterest({ watchers: 0, viewers_30d: 3 })).toEqual({ watchers: null, viewers: 3 });
  });

  it("ignores junk", () => {
    for (const junk of [null, undefined, "x", 5, [], { watchers: "7" }, { watchers: NaN, viewers_30d: Infinity }]) {
      expect(parseInterest(junk)).toEqual({ watchers: null, viewers: null });
    }
  });

  it("writes one short line, or nothing", () => {
    expect(interestLine({ watchers: 42, viewers: 310 })).toBe("42 people watching · 310 people viewed this month");
    expect(interestLine({ watchers: 42, viewers: null })).toBe("42 people watching");
    expect(interestLine({ watchers: null, viewers: 12 })).toBe("12 people viewed this month");
    expect(interestLine({ watchers: null, viewers: null })).toBeNull();
    expect(interestLine(undefined)).toBeNull();
    expect(interestLine({ watchers: 1250, viewers: 12000 })).toBe("1.2k people watching · 12k people viewed this month");
  });
});

describe("checklist: what is kept", () => {
  it("keeps only real, ticked checklist items", () => {
    expect(sanitizeDone({ [K0]: true, [K1]: false, "made-up:9": true, [K2]: "yes" })).toEqual({ [K0]: true });
    expect(sanitizeDone(null)).toEqual({});
    expect(sanitizeDone([K0])).toEqual({});
    expect(sanitizeDone("x")).toEqual({});
  });

  it("accepts every item of the real checklist", () => {
    const all = Object.fromEntries(CHECKLIST.flatMap((p) => p.items.map((_, i) => [checklistKey(p.key, i), true])));
    expect(Object.keys(sanitizeDone(all)).length).toBe(CHECKLIST_TOTAL);
  });

  it("reads the old on-phone format as ticks the account has not seen", () => {
    expect(parseLocal(JSON.stringify({ [K0]: true, [K1]: true }))).toEqual({ done: { [K0]: true, [K1]: true }, dirty: true });
    expect(parseLocal(JSON.stringify({}))).toEqual({ done: {}, dirty: false });
  });

  it("reads the new format, and survives a corrupt value", () => {
    expect(parseLocal(JSON.stringify({ done: { [K0]: true, junk: true }, dirty: false }))).toEqual({ done: { [K0]: true }, dirty: false });
    expect(parseLocal(JSON.stringify({ done: { [K0]: true }, dirty: true })).dirty).toBe(true);
    expect(parseLocal("{not json")).toEqual({ done: {}, dirty: false });
    expect(parseLocal(null)).toEqual({ done: {}, dirty: false });
  });
});

describe("checklist: phone copy against account copy", () => {
  it("second device, nothing ticked locally: the account's ticks appear", () => {
    expect(decideOnOpen({ done: {}, dirty: false }, { [K0]: true, [K2]: true })).toEqual({ done: { [K0]: true, [K2]: true }, push: false });
  });

  it("ticks made on this phone that were never sent win, and are sent", () => {
    expect(decideOnOpen({ done: { [K1]: true }, dirty: true }, { [K0]: true })).toEqual({ done: { [K1]: true }, push: true });
  });

  it("an un-tick made elsewhere is respected when this phone has nothing unsent", () => {
    expect(decideOnOpen({ done: { [K0]: true, [K1]: true }, dirty: false }, { [K0]: true })).toEqual({ done: { [K0]: true }, push: false });
  });

  it("first sign-in with existing local ticks uploads them", () => {
    expect(decideOnOpen({ done: { [K0]: true }, dirty: false }, null)).toEqual({ done: { [K0]: true }, push: true });
    expect(decideOnOpen({ done: {}, dirty: false }, null)).toEqual({ done: {}, push: false });
  });

  it("offline or signed out: keep the phone's copy and send nothing", () => {
    expect(decideOnOpen({ done: { [K0]: true }, dirty: true }, undefined)).toEqual({ done: { [K0]: true }, push: false });
  });

  it("junk in the account copy is dropped, not shown", () => {
    expect(decideOnOpen({ done: {}, dirty: false }, { [K0]: true, hacked: true, [K1]: 1 }).done).toEqual({ [K0]: true });
    expect(decideOnOpen({ done: {}, dirty: false }, "garbage").done).toEqual({});
  });

  it("sameDone compares ticks, not object identity or false entries", () => {
    expect(sameDone({ [K0]: true }, { [K0]: true })).toBe(true);
    expect(sameDone({ [K0]: true, [K1]: false }, { [K0]: true })).toBe(true);
    expect(sameDone({ [K0]: true }, { [K1]: true })).toBe(false);
    expect(sameDone({}, { [K0]: true })).toBe(false);
  });
});

describe("fundraising / pre-IPO / IPO interest", () => {
  it("offers exactly the three types in the plan", () => {
    expect(INTEREST_TYPES.map((t) => t.value)).toEqual(["fundraising", "pre_ipo", "ipo"]);
  });

  it("each type produces a lead that says what the person wants", () => {
    expect(interestLead("fundraising")).toMatchObject({ payload: { Interest: "Fundraising" }, message: "Interested in fundraising." });
    expect(interestLead("pre_ipo")).toMatchObject({ payload: { Interest: "Pre-IPO round" }, message: "Interested in a pre-IPO round." });
    expect(interestLead("ipo")).toMatchObject({ payload: { Interest: "IPO" }, message: "Interested in an IPO." });
    for (const t of INTEREST_TYPES) {
      const l = interestLead(t.value);
      expect(l.title.length).toBeGreaterThan(5);
      expect(l.cta).toBe("Request a call");
      expect(l.message.length).toBeLessThan(2000);
    }
  });

  it("the lead uses a source the database accepts", () => {
    // public.business_leads.source has a CHECK list; "business-hub" is in it, so no migration is needed.
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261028000100_business_leads.sql"), "utf8") as string;
    expect(sql).toMatch(/'business-hub'/);
    const card = fs.readFileSync(path.join(__dirname, "../features/business/components/InterestCard.tsx"), "utf8") as string;
    expect(card).toMatch(/source="business-hub"/);
  });
});
