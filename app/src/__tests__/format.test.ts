import { describe, expect, it } from "@jest/globals";
import { crore, dateRange, daysUntil, groupIndian, inr, inrCompact, pct, relativeDay, times, todayIST } from "@/lib/format";

describe("inr", () => {
  it("groups in Indian style", () => {
    expect(inr(14985)).toBe("₹14,985");
    expect(inr(1234567)).toBe("₹12,34,567");
    expect(inr(82.5)).toBe("₹82.50");
    expect(inr(-10)).toBe("-₹10");
    expect(inr(5, { sign: true })).toBe("+₹5");
    expect(inr(null)).toBe("—");
  });
  it("groupIndian handles short numbers", () => {
    expect(groupIndian("999")).toBe("999");
    expect(groupIndian("1000")).toBe("1,000");
  });
  it("compacts lakh/crore", () => {
    expect(inrCompact(1003995)).toBe("₹10.04 L");
    expect(inrCompact(25000000)).toBe("₹2.50 Cr");
    expect(inrCompact(999)).toBe("₹999");
  });
});

describe("crore", () => {
  it("formats issue sizes", () => {
    expect(crore(1200)).toBe("₹1,200 Cr");
    expect(crore(30187.65)).toBe("₹30,188 Cr");
    expect(crore(23.33)).toBe("₹23.33 Cr");
    expect(crore(undefined)).toBe("—");
  });
});

describe("pct / times", () => {
  it("signs percentages", () => {
    expect(pct(2.1)).toBe("+2.10%");
    expect(pct(-10.14)).toBe("-10.14%");
    expect(pct(2.1, { sign: false, decimals: 1 })).toBe("2.1%");
    expect(pct(null)).toBe("—");
  });
  it("formats subscription multiples", () => {
    expect(times(0.06)).toBe("0.06x");
    expect(times(22.19)).toBe("22.2x");
    expect(times(139.69)).toBe("140x");
    expect(times(null)).toBe("—");
  });
});

describe("dates", () => {
  it("formats ranges", () => {
    expect(dateRange("2026-10-26", "2026-10-28")).toBe("26–28 Oct");
    expect(dateRange("2026-10-29", "2026-11-02")).toBe("29 Oct – 2 Nov");
    expect(dateRange(null, null)).toBe("Dates TBA");
    expect(dateRange("2026-10-29", null)).toBe("From 29 Oct");
  });
  it("counts days from IST today", () => {
    const today = todayIST();
    expect(daysUntil(today)).toBe(0);
    expect(daysUntil(null)).toBeNull();
    expect(relativeDay(today)).toBe("Today");
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 3);
    expect(daysUntil(d.toISOString().slice(0, 10))).toBe(3);
    expect(relativeDay(d.toISOString().slice(0, 10))).toBe("In 3 days");
  });
});
