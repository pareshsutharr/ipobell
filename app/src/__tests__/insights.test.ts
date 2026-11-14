import { describe, expect, it } from "@jest/globals";

import { insightVitals, paragraphs, verdictMeta } from "@/features/insights/verdict";

describe("insight helpers", () => {
  it("maps verdicts to non-advisory labels", () => {
    expect(verdictMeta("positive").label).toBe("Worth a close look");
    expect(verdictMeta("cautious").tone).toBe("loss");
    expect(verdictMeta(null).label).toBe("Balanced view");
    for (const v of ["positive", "neutral", "cautious"] as const) {
      expect(verdictMeta(v).label.toLowerCase()).not.toMatch(/\b(buy|sell|subscribe)\b/);
    }
  });

  it("builds vitals only from present fields", () => {
    const v = insightVitals({ location_city: "Surat", location_state: "Gujarat", founded_year: 2011, employees: null, sector: "Textiles" });
    expect(v.map((x) => x.text)).toEqual(["Surat, Gujarat", "Founded 2011", "Textiles"]);
    expect(insightVitals({ location_city: null, location_state: null, founded_year: null, employees: null, sector: null })).toEqual([]);
  });

  it("splits long-form text on blank lines", () => {
    expect(paragraphs("One.\n\nTwo.\n\n\nThree.  ")).toEqual(["One.", "Two.", "Three."]);
    expect(paragraphs(null)).toEqual([]);
  });
});
