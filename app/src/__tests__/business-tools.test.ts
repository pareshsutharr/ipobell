import { describe, expect, it } from "@jest/globals";

import {
  calcIssueCost,
  calcIssueSize,
  checkEligibility,
  checklistKey,
  checklistProgress,
  CHECKLIST_TOTAL,
  EMPTY_ELIGIBILITY,
  growthPremium,
  READINESS_QUESTION_COUNT,
  READINESS_SECTIONS,
  readinessPayload,
  scoreReadiness,
  type EligibilityInput,
  type ReadinessAnswers,
} from "@/features/business/tools";

describe("readiness score", () => {
  it("has 20 questions in 5 sections, each with 4 options scored 0–3", () => {
    expect(READINESS_SECTIONS).toHaveLength(5);
    expect(READINESS_QUESTION_COUNT).toBe(20);
    for (const s of READINESS_SECTIONS) {
      expect(s.questions).toHaveLength(4);
      for (const q of s.questions) expect(q.options.map((o) => o.score)).toEqual([0, 1, 2, 3]);
    }
  });

  it("matches the website: all top answers → 100% / 10.0, IPO ready", () => {
    const all3: ReadinessAnswers = {};
    for (const s of READINESS_SECTIONS) for (const q of s.questions) all3[q.id] = 3;
    const r = scoreReadiness(all3);
    expect(r.percent).toBe(100);
    expect(r.scoreOutOf10).toBe(10);
    expect(r.band.key).toBe("ready");
    expect(r.weakest).toHaveLength(0);
  });

  it("maps mixed answers to the right band and flags weakest sections", () => {
    const a: ReadinessAnswers = {};
    for (const s of READINESS_SECTIONS) for (const q of s.questions) a[q.id] = s.key === "governance" ? 0 : 2;
    const r = scoreReadiness(a); // 16 × 2 = 32 of 60 → 53%
    expect(r.points).toBe(32);
    expect(r.percent).toBe(53);
    expect(r.band.key).toBe("foundation");
    expect(r.weakest[0].key).toBe("governance");
  });

  it("partial answers count what is answered", () => {
    const r = scoreReadiness({ revenue: 3, debt: 1 });
    expect(r.answered).toBe(2);
    expect(r.points).toBe(4);
    const p = readinessPayload({ revenue: 3 });
    expect(p["What is your company's annual revenue (latest full financial year)?"]).toBe("Above ₹100 Crore (3/3)");
    expect(Object.values(p).filter((v) => v === "—")).toHaveLength(19);
  });
});

describe("eligibility", () => {
  const clean: EligibilityInput = {
    ...EMPTY_ELIGIBILITY,
    trackRecord: "3plus",
    converted: false,
    promoterChangedLastYear: false,
    netWorthLatest: 4,
    netWorthPrevious: 3,
    netTangibleAssets: 5,
    operatingProfitYears: 3,
    operatingProfitLatest: true,
    fcfePositiveYears: 2,
    leverage: 1.2,
    financeCompany: false,
    postIssueCapital: 12,
    issueSize: 20,
    ofsPortion: 2,
    gcpAmount: 2.5,
    rejectedLast6m: false,
    insolvency: false,
    windingUp: false,
    debentureDefault: false,
    bankDefault3y: false,
    regulatoryAction: false,
    directorChargesheet: false,
    auditedThreeYears: true,
  };

  it("passes a clean SME profile on both SME platforms and recommends NSE Emerge", () => {
    const r = checkEligibility(clean);
    const byKey = Object.fromEntries(r.platforms.map((p) => [p.key, p]));
    expect(byKey.nse_emerge.verdict).toBe("eligible");
    expect(byKey.bse_sme.verdict).toBe("eligible");
    expect(byKey.mainboard.verdict).toBe("gaps"); // capital ≤ 25 Cr
    expect(r.recommended).toBe("nse_emerge");
    expect(r.blockers).toHaveLength(0);
  });

  it("blocks every platform on insolvency", () => {
    const r = checkEligibility({ ...clean, insolvency: true });
    expect(r.platforms.every((p) => p.verdict === "blocked")).toBe(true);
    expect(r.recommended).toBeNull();
    expect(r.blockers).toHaveLength(1);
  });

  it("flags OFS above 20% and GCP above the cap as gaps", () => {
    const r = checkEligibility({ ...clean, ofsPortion: 5, gcpAmount: 4 });
    const nse = r.platforms.find((p) => p.key === "nse_emerge")!;
    expect(nse.verdict).toBe("gaps");
    expect(nse.failing.map((c) => c.label)).toEqual(expect.arrayContaining([expect.stringContaining("Offer for sale"), expect.stringContaining("General corporate purposes")]));
  });

  it("routes large companies to the Main Board", () => {
    const r = checkEligibility({ ...clean, postIssueCapital: 40 });
    expect(r.recommended).toBe("mainboard");
    expect(r.platforms.find((p) => p.key === "bse_sme")!.verdict).toBe("gaps");
  });

  it("BSE SME tests NTA, leverage and promoter stability; NSE does not", () => {
    const r = checkEligibility({ ...clean, netTangibleAssets: 2, leverage: 4, promoterChangedLastYear: true });
    expect(r.platforms.find((p) => p.key === "nse_emerge")!.verdict).toBe("eligible");
    const bse = r.platforms.find((p) => p.key === "bse_sme")!;
    expect(bse.verdict).toBe("gaps");
    expect(bse.failing).toHaveLength(3);
    expect(r.recommended).toBe("nse_emerge");
  });

  it("finance companies get the leverage relaxation", () => {
    const r = checkEligibility({ ...clean, leverage: 5, financeCompany: true });
    expect(r.platforms.find((p) => p.key === "bse_sme")!.verdict).toBe("eligible");
  });

  it("is incomplete with nothing answered", () => {
    const r = checkEligibility(EMPTY_ELIGIBILITY);
    expect(r.platforms.every((p) => p.verdict === "incomplete")).toBe(true);
    expect(r.answered).toBe(0);
    expect(r.recommended).toBeNull();
  });
});

describe("issue size", () => {
  it("reproduces the website's worked example (manufacturing, PAT 5, CAGR 22%)", () => {
    const r = calcIssueSize(5, "Manufacturing / Engineering", 22)!;
    expect(r.basePe).toBe(15);
    expect(r.premiumPct).toBe(15);
    expect(r.pe).toBe(17.3);
    expect(r.marketCap).toBeCloseTo(86.3, 1);
    expect(r.issueLow).toBeCloseTo(15.5, 1);
    expect(r.issueHigh).toBeCloseTo(28.5, 1);
  });
  it("growth premium tiers", () => {
    expect(growthPremium(null)).toBe(0);
    expect(growthPremium(9)).toBe(0);
    expect(growthPremium(10)).toBe(5);
    expect(growthPremium(20)).toBe(15);
    expect(growthPremium(30)).toBe(25);
  });
  it("rejects bad input", () => {
    expect(calcIssueSize(0, "Other", null)).toBeNull();
    expect(calcIssueSize(5, "Nope", null)).toBeNull();
  });
});

describe("issue cost", () => {
  it("is ~10% of the issue with the website's line items (₹20 Cr → ₹2 Cr)", () => {
    const r = calcIssueCost(20)!;
    expect(r.totalCr).toBeCloseTo(2, 5);
    expect(r.totalPct).toBeCloseTo(10, 5);
    expect(r.items[0].label).toMatch(/underwriting/i);
    expect(r.items[0].pct).toBeCloseTo(5.2857, 3);
    expect(r.items.reduce((n, i) => n + i.amountCr, 0)).toBeCloseTo(r.totalCr, 6);
    expect(r.stages[r.stages.length - 1].pct).toBeCloseTo(91.14, 1);
    expect(r.stages[r.stages.length - 1].cumulativePct).toBeCloseTo(100, 6);
  });
  it("rejects zero", () => {
    expect(calcIssueCost(0)).toBeNull();
  });
});

describe("checklist", () => {
  it("has 32 steps and tracks progress by phase", () => {
    expect(CHECKLIST_TOTAL).toBe(32);
    const p = checklistProgress({ [checklistKey("eligibility", 0)]: true, [checklistKey("eligibility", 1)]: true, [checklistKey("post", 3)]: true });
    expect(p.done).toBe(3);
    expect(p.percent).toBe(9);
    expect(p.byPhase[0].done).toBe(2);
    expect(p.byPhase[5].done).toBe(1);
  });
});
