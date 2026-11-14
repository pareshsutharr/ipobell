import { describe, expect, it } from "@jest/globals";

import { minLotsFor, retailMinimum } from "@/features/ipos/lots";

const base = { lot_size: 1200, price_max: 100, issue_price: null, min_investment: 120000 };

describe("retail minimum application", () => {
  it("is 2 lots for SME and 1 lot for Mainboard", () => {
    expect(minLotsFor("sme")).toBe(2);
    expect(minLotsFor("mainboard")).toBe(1);
    expect(retailMinimum({ ...base, board: "sme" })).toEqual({ lots: 2, shares: 2400, amount: 240000, fromIssue: false });
    expect(retailMinimum({ ...base, board: "mainboard" })).toEqual({ lots: 1, shares: 1200, amount: 120000, fromIssue: false });
  });

  it("prefers the issue's own Retail (Min) row when published", () => {
    const r = retailMinimum({ ...base, board: "sme", lot_calculator: [{ label: "Retail (Min)", lots: 2, shares: 2400, amount: 236000 }, { label: "Retail (Max)", lots: 2, shares: 2400, amount: 236000 }] });
    expect(r).toEqual({ lots: 2, shares: 2400, amount: 236000, fromIssue: true });
  });

  it("scales the feed figure when there is no price band, and returns null with nothing to go on", () => {
    expect(retailMinimum({ board: "sme", lot_size: null, price_max: null, issue_price: null, min_investment: 150000 })?.amount).toBe(300000);
    expect(retailMinimum({ board: "sme", lot_size: null, price_max: null, issue_price: null, min_investment: null })).toBeNull();
  });
});
