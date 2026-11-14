// "Get Listed" tools — pure logic, mirrors the calculators on beipoready.com so results match the web.
// Nothing here touches the network; screens render these and leads.ts sends results to the team.

// ---------------------------------------------------------------------------
// 1. IPO readiness assessment — 20 questions × 0–3 points, 5 sections.
// ---------------------------------------------------------------------------
export interface ReadinessOption {
  label: string;
  score: 0 | 1 | 2 | 3;
}
export interface ReadinessQuestion {
  id: string;
  text: string;
  options: ReadinessOption[];
}
export interface ReadinessSection {
  key: string;
  title: string;
  short: string;
  questions: ReadinessQuestion[];
}

const opts = (a: string, b: string, c: string, d: string): ReadinessOption[] => [
  { label: a, score: 0 },
  { label: b, score: 1 },
  { label: c, score: 2 },
  { label: d, score: 3 },
];

export const READINESS_SECTIONS: ReadinessSection[] = [
  {
    key: "financial",
    title: "Financial Health",
    short: "Financials",
    questions: [
      { id: "revenue", text: "What is your company's annual revenue (latest full financial year)?", options: opts("Below ₹10 Crore", "₹10 – ₹25 Crore", "₹25 – ₹100 Crore", "Above ₹100 Crore") },
      { id: "profitability", text: "What best describes your company's profitability track record?", options: opts("Loss-making in 2 of the last 3 years", "Breakeven, barely profitable", "Profitable but PAT margin below 5%", "Consistently profitable (PAT margin 5%+) for 3+ years") },
      { id: "growth", text: "What has been your 3-year revenue CAGR?", options: opts("Negative or flat (below 0%)", "0% – 10%", "10% – 25%", "Above 25%") },
      { id: "debt", text: "What is your company's current debt situation?", options: opts("High leverage, Debt/Equity above 2×", "Moderate, Debt/Equity 1–2×", "Low leverage, Debt/Equity below 1×", "Debt-free or near debt-free") },
    ],
  },
  {
    key: "governance",
    title: "Corporate Governance",
    short: "Governance",
    questions: [
      { id: "board", text: "What is the current composition of your board of directors?", options: opts("Promoter directors only, no independent directors", "1 independent director appointed", "2 independent directors + Audit Committee constituted", "2+ IDs, all mandatory committees, and board minutes maintained") },
      { id: "auditor", text: "Who is your current statutory auditor?", options: opts("Small local CA, not peer-review certified", "CA firm with valid peer review certificate", "Mid-size regional firm with IPO experience", "Big-4 or Top-10 national CA firm") },
      { id: "cs", text: "Does your company have a qualified Company Secretary?", options: opts("No Company Secretary appointed", "Part-time or retainer CS", "Full-time qualified CS in employment", "Full-time CS + secretarial audit conducted for 2+ years") },
      { id: "compliance", text: "How is your ROC / MCA compliance history?", options: opts("Multiple filing defaults or penalties in last 3 years", "1–2 minor defaults, since rectified", "Clean record for the last 1 year", "Spotless compliance history for 3+ years") },
    ],
  },
  {
    key: "operations",
    title: "Operations & Systems",
    short: "Systems",
    questions: [
      { id: "erp", text: "How does your company manage financial reporting?", options: opts("Manual or Excel-based, no accounting software", "Basic accounting software (Tally etc.)", "ERP partially implemented", "Full ERP with real-time financial reporting") },
      { id: "audit", text: "What internal audit / internal control framework is in place?", options: opts("No internal audit, no documented controls", "Ad-hoc reviews only", "Annual external internal audit conducted", "Quarterly internal audit + management action tracking") },
      { id: "rpt", text: "How significant are related party transactions in your company?", options: opts("Large RPTs, some undisclosed or not at arm's length", "Significant RPTs but disclosed in accounts", "Minor RPTs, all at arm's length and disclosed", "No material RPTs") },
      { id: "working_capital", text: "How would you describe your working capital management?", options: opts("Negative, company frequently stretches creditor payments", "Seasonal stress, cash flow tight in certain months", "Manageable, no significant stress", "Healthy, positive cash conversion cycle, low receivables") },
    ],
  },
  {
    key: "market",
    title: "Business & Market Position",
    short: "Market",
    questions: [
      { id: "concentration", text: "What is your customer/revenue concentration?", options: opts("Top 3 customers = 70%+ of revenue", "Top 3 customers = 50–70% of revenue", "Top 3 customers = 30–50% of revenue", "Top 3 customers below 30%, well diversified") },
      { id: "moat", text: "What competitive advantage / moat does your company have?", options: opts("None identified, competing on price only", "Marginal, some differentiation", "Moderate, brand, technology, or process advantage", "Strong, IP, exclusive contracts, network effects, or regulatory moat") },
      { id: "industry", text: "How would you characterise your industry's growth outlook?", options: opts("Declining or structurally challenged", "Flat, low single-digit growth", "Growing, 10–20% industry CAGR", "High growth, 20%+ CAGR with tailwinds") },
      { id: "visibility", text: "How visible / recurring is your revenue?", options: opts("Spot / project-based, no forward visibility", "Short-term contracts (under 6 months)", "Annual contracts with good renewal rate", "Multi-year contracts or strongly recurring SaaS/subscription model") },
    ],
  },
  {
    key: "promoters",
    title: "Promoters & Management",
    short: "Promoters",
    questions: [
      { id: "promoter_exp", text: "How long have promoters been in this industry?", options: opts("Under 5 years", "5–10 years", "10–20 years", "20+ years, deep domain expertise") },
      { id: "team", text: "How deep is your management team?", options: opts("Single founder-dependent, no second line", "2–3 key people but no formal structure", "Mid-management layer with functional heads", "Full C-suite in place, not founder-dependent") },
      { id: "dilution", text: "How clear are promoters about post-IPO dilution?", options: opts("Promoters are resistant to dilution", "Open in principle but no clear plan", "Comfortable with 25–30% dilution for the right valuation", "Clear dilution plan with offer structure already modelled") },
      { id: "fundraising", text: "Has the company raised external capital before?", options: opts("No, entirely promoter-funded", "Informal / angel / friends & family round", "Formal VC or PE round completed", "Multiple rounds, experienced with investor diligence processes") },
    ],
  },
];

export const READINESS_QUESTION_COUNT = READINESS_SECTIONS.reduce((n, s) => n + s.questions.length, 0);
export const READINESS_MAX_SCORE = READINESS_QUESTION_COUNT * 3;

export type ReadinessAnswers = Record<string, 0 | 1 | 2 | 3 | undefined>;

export interface ReadinessBand {
  min: number;
  key: "ready" | "almost" | "getting" | "foundation" | "early";
  title: string;
  timeline: string;
  advice: string;
  tone: "gain" | "primary" | "info" | "warning" | "loss";
}

export const READINESS_BANDS: ReadinessBand[] = [
  { min: 90, key: "ready", title: "IPO Ready", timeline: "Start now", advice: "Your company appears ready to engage a merchant banker and begin the IPO process now.", tone: "gain" },
  { min: 75, key: "almost", title: "Almost Ready", timeline: "6–12 months", advice: "You are 6–12 months from IPO readiness. A focused advisory engagement can close the remaining gaps.", tone: "primary" },
  { min: 55, key: "getting", title: "Getting Ready", timeline: "12–18 months", advice: "You have the fundamentals but significant gaps remain. A structured 12–18 month programme will get you there.", tone: "info" },
  { min: 35, key: "foundation", title: "Foundation Building", timeline: "18–24 months", advice: "Core structural work is needed first. An 18–24 month roadmap is realistic before engaging a merchant banker.", tone: "warning" },
  { min: 0, key: "early", title: "Early Stage", timeline: "24+ months", advice: "Focus on building the financial, governance, and operational foundations before beginning the IPO process.", tone: "loss" },
];

export interface ReadinessResult {
  answered: number;
  total: number;
  points: number;
  maxPoints: number;
  percent: number; // 0–100
  scoreOutOf10: number; // 1 decimal, matches the website
  band: ReadinessBand;
  sections: { key: string; title: string; short: string; points: number; max: number; percent: number }[];
  weakest: { key: string; title: string; percent: number }[];
}

export function scoreReadiness(answers: ReadinessAnswers): ReadinessResult {
  let points = 0;
  let answered = 0;
  const sections = READINESS_SECTIONS.map((s) => {
    let p = 0;
    for (const q of s.questions) {
      const v = answers[q.id];
      if (v !== undefined) {
        p += v;
        answered += 1;
      }
    }
    points += p;
    const max = s.questions.length * 3;
    return { key: s.key, title: s.title, short: s.short, points: p, max, percent: Math.round((p / max) * 100) };
  });
  const percent = Math.round((points / READINESS_MAX_SCORE) * 100);
  const band = READINESS_BANDS.find((b) => percent >= b.min) ?? READINESS_BANDS[READINESS_BANDS.length - 1];
  const weakest = [...sections].sort((a, b) => a.percent - b.percent).slice(0, 2).filter((s) => s.percent < 100);
  return {
    answered,
    total: READINESS_QUESTION_COUNT,
    points,
    maxPoints: READINESS_MAX_SCORE,
    percent,
    scoreOutOf10: Math.round((points / READINESS_MAX_SCORE) * 100) / 10,
    band,
    sections,
    weakest,
  };
}

/** Human-readable answers for the lead payload (same shape the website sends). */
export function readinessPayload(answers: ReadinessAnswers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of READINESS_SECTIONS) {
    for (const q of s.questions) {
      const v = answers[q.id];
      const o = v === undefined ? undefined : q.options.find((x) => x.score === v);
      out[q.text] = o ? `${o.label} (${o.score}/3)` : "—";
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Eligibility check — NSE Emerge / BSE SME / Mainboard, indicative only.
//    Thresholds follow the criteria published on beipoready.com/get-listed and the SEBI ICDR
//    SME amendments (operating profit ≥ ₹1 Cr in 2 of 3 years, OFS ≤ 20%, GCP cap, ≤ ₹25 Cr capital).
// ---------------------------------------------------------------------------
export type Count03 = 0 | 1 | 2 | 3;
export type TrackRecord = "lt1" | "1to2" | "2to3" | "3plus";

export interface EligibilityInput {
  trackRecord: TrackRecord | null;
  converted: boolean | null; // from proprietorship / partnership / LLP (predecessor track record counts)
  promoterChangedLastYear: boolean | null;
  netWorthLatest: number | null; // ₹ Cr
  netWorthPrevious: number | null; // ₹ Cr
  netTangibleAssets: number | null; // ₹ Cr
  operatingProfitYears: Count03 | null; // years in last 3 with EBITDA ≥ ₹1 Cr
  operatingProfitLatest: boolean | null;
  fcfePositiveYears: Count03 | null;
  leverage: number | null; // debt / equity
  financeCompany: boolean | null;
  postIssueCapital: number | null; // ₹ Cr
  issueSize: number | null; // ₹ Cr
  ofsPortion: number | null; // ₹ Cr
  gcpAmount: number | null; // ₹ Cr
  // compliance (true = problem)
  rejectedLast6m: boolean | null;
  insolvency: boolean | null;
  windingUp: boolean | null;
  debentureDefault: boolean | null;
  bankDefault3y: boolean | null;
  regulatoryAction: boolean | null;
  directorChargesheet: boolean | null;
  auditedThreeYears: boolean | null;
}

export const EMPTY_ELIGIBILITY: EligibilityInput = {
  trackRecord: null,
  converted: null,
  promoterChangedLastYear: null,
  netWorthLatest: null,
  netWorthPrevious: null,
  netTangibleAssets: null,
  operatingProfitYears: null,
  operatingProfitLatest: null,
  fcfePositiveYears: null,
  leverage: null,
  financeCompany: null,
  postIssueCapital: null,
  issueSize: null,
  ofsPortion: null,
  gcpAmount: null,
  rejectedLast6m: null,
  insolvency: null,
  windingUp: null,
  debentureDefault: null,
  bankDefault3y: null,
  regulatoryAction: null,
  directorChargesheet: null,
  auditedThreeYears: null,
};

export type PlatformKey = "nse_emerge" | "bse_sme" | "mainboard";
export type EligibilityVerdict = "eligible" | "gaps" | "blocked" | "incomplete";

export interface Check {
  label: string;
  ok: boolean | null; // null = not answered
  detail?: string;
  severity: "block" | "gap" | "note";
}

export interface PlatformResult {
  key: PlatformKey;
  name: string;
  verdict: EligibilityVerdict;
  checks: Check[];
  failing: Check[];
}

export interface EligibilityResult {
  platforms: PlatformResult[];
  recommended: PlatformKey | null;
  answered: number;
  total: number;
  blockers: Check[];
}

/** The numbers in the eligibility rules. They change with SEBI / exchange circulars, so they can be updated remotely (see rules.ts). */
export interface EligibilityLimits {
  smeCapitalMinCr: number; // post-issue paid-up capital, SME platforms
  smeCapitalMaxCr: number;
  ofsMaxPct: number; // offer for sale, share of the issue
  gcpMaxPct: number; // general corporate purposes, share of the issue
  gcpMaxCr: number;
  netWorthMinCr: number;
  ntaMinCr: number; // net tangible assets
  leverageMax: number; // debt / equity
  opProfitMinCr: number; // EBITDA per year
  opProfitMinYears: number; // of the last 3
}

export const DEFAULT_ELIGIBILITY_LIMITS: EligibilityLimits = {
  smeCapitalMinCr: 1,
  smeCapitalMaxCr: 25,
  ofsMaxPct: 20,
  gcpMaxPct: 15,
  gcpMaxCr: 10,
  netWorthMinCr: 1,
  ntaMinCr: 3,
  leverageMax: 3,
  opProfitMinCr: 1,
  opProfitMinYears: 2,
};

function verdictOf(checks: Check[]): EligibilityVerdict {
  const answered = checks.filter((c) => c.ok !== null);
  if (answered.some((c) => c.ok === false && c.severity === "block")) return "blocked";
  if (answered.length < checks.filter((c) => c.severity !== "note").length) return answered.some((c) => c.ok === false) ? "gaps" : "incomplete";
  return answered.some((c) => c.ok === false && c.severity === "gap") ? "gaps" : "eligible";
}

function num(v: number | null): number | null {
  return v === null || Number.isNaN(v) ? null : v;
}

export function countAnswered(i: EligibilityInput): { answered: number; total: number } {
  const vals = Object.values(i);
  return { answered: vals.filter((v) => v !== null).length, total: vals.length };
}

export function checkEligibility(i: EligibilityInput, L: EligibilityLimits = DEFAULT_ELIGIBILITY_LIMITS): EligibilityResult {
  const nwL = num(i.netWorthLatest);
  const nwP = num(i.netWorthPrevious);
  const nta = num(i.netTangibleAssets);
  const cap = num(i.postIssueCapital);
  const size = num(i.issueSize);
  const ofs = num(i.ofsPortion);
  const gcp = num(i.gcpAmount);
  const lev = num(i.leverage);

  const bool = (v: boolean | null, okWhen: boolean) => (v === null ? null : v === okWhen);

  // Common compliance blockers (apply to every exchange).
  const compliance: Check[] = [
    { label: "No listing application rejected in the last 6 months", ok: bool(i.rejectedLast6m, false), severity: "block", detail: "Exchanges impose a 6-month cooling period after a rejection." },
    { label: "No BIFR / insolvency (IBC) proceedings", ok: bool(i.insolvency, false), severity: "block" },
    { label: "No winding-up petition admitted", ok: bool(i.windingUp, false), severity: "block" },
    { label: "No pending default on debentures, bonds or deposits", ok: bool(i.debentureDefault, false), severity: "block" },
    { label: "No director charge-sheeted or under investigation for economic offences", ok: bool(i.directorChargesheet, false), severity: "block" },
    { label: "No bank / FI defaults in the last 3 years", ok: bool(i.bankDefault3y, false), severity: "gap", detail: "Settled defaults must be disclosed; recent ones usually need a cure period." },
    { label: "No material regulatory action against promoters or group companies in the last year", ok: bool(i.regulatoryAction, false), severity: "gap" },
    { label: "Restated, consolidated audited financials for 3 years", ok: bool(i.auditedThreeYears, true), severity: "gap", detail: "Required for the DRHP; can be prepared during the pre-IPO phase." },
  ];

  const track: Check = {
    label: "3-year operating track record (predecessor entity counts)",
    ok: i.trackRecord === null ? null : i.trackRecord === "3plus",
    severity: "gap",
    detail: i.converted ? "Conversion from a partnership / LLP keeps the predecessor's track record." : undefined,
  };

  const opProfit2of3: Check = {
    label: `Operating profit (EBITDA) ≥ ₹${L.opProfitMinCr} Cr in at least ${L.opProfitMinYears} of the last 3 years`,
    ok: i.operatingProfitYears === null ? null : i.operatingProfitYears >= L.opProfitMinYears,
    severity: "gap",
    detail: "SEBI ICDR requirement for SME issuers since 2025.",
  };

  const smeCapital: Check = {
    label: `Post-issue paid-up capital between ₹${L.smeCapitalMinCr} Cr and ₹${L.smeCapitalMaxCr} Cr`,
    ok: cap === null ? null : cap >= L.smeCapitalMinCr && cap <= L.smeCapitalMaxCr,
    severity: "gap",
    detail: cap !== null && cap > L.smeCapitalMaxCr ? `Above ₹${L.smeCapitalMaxCr} Cr the company must list on the Main Board.` : undefined,
  };

  const ofsCheck: Check = {
    label: `Offer for sale ≤ ${L.ofsMaxPct}% of the total issue`,
    ok: size === null || ofs === null ? null : size <= 0 || ofs <= (size * L.ofsMaxPct) / 100 + 1e-9,
    severity: "gap",
  };

  const gcpCheck: Check = {
    label: `General corporate purposes ≤ ${L.gcpMaxPct}% of the issue or ₹${L.gcpMaxCr} Cr, whichever is lower`,
    ok: size === null || gcp === null ? null : gcp <= Math.min((size * L.gcpMaxPct) / 100, L.gcpMaxCr) + 1e-9,
    severity: "gap",
  };

  const nw2y: Check = {
    label: `Net worth ≥ ₹${L.netWorthMinCr} Cr in each of the last 2 financial years`,
    ok: nwL === null || nwP === null ? null : nwL >= L.netWorthMinCr && nwP >= L.netWorthMinCr,
    severity: "gap",
  };

  // NSE Emerge
  const nse: Check[] = [
    track,
    nw2y,
    opProfit2of3,
    { label: "Positive free cash flow to equity in at least 2 of the last 3 years", ok: i.fcfePositiveYears === null ? null : i.fcfePositiveYears >= 2, severity: "gap" },
    smeCapital,
    ofsCheck,
    gcpCheck,
    ...compliance,
  ];

  // BSE SME
  const bse: Check[] = [
    track,
    nw2y,
    { label: `Net tangible assets ≥ ₹${L.ntaMinCr} Cr (latest full FY)`, ok: nta === null ? null : nta >= L.ntaMinCr, severity: "gap" },
    opProfit2of3,
    { label: "Operating profit in the most recent full financial year", ok: bool(i.operatingProfitLatest, true), severity: "gap" },
    {
      label: `Leverage (debt ÷ equity) ≤ ${L.leverageMax}:1`,
      ok: lev === null ? null : lev <= L.leverageMax || i.financeCompany === true,
      severity: "gap",
      detail: i.financeCompany ? "Finance companies may get a relaxation." : undefined,
    },
    { label: "Promoters unchanged for 1 year before the listing application", ok: bool(i.promoterChangedLastYear, false), severity: "gap" },
    smeCapital,
    ofsCheck,
    gcpCheck,
    ...compliance,
  ];

  // Main Board (indicative — SEBI ICDR Reg. 6(1) profitability route)
  const main: Check[] = [
    track,
    { label: `Post-issue paid-up capital above ₹${L.smeCapitalMaxCr} Cr (SME platform limit)`, ok: cap === null ? null : cap > L.smeCapitalMaxCr, severity: "gap", detail: `Below ₹${L.smeCapitalMaxCr} Cr the SME platforms are the natural route.` },
    { label: `Net tangible assets ≥ ₹${L.ntaMinCr} Cr in each of the last 3 years`, ok: nta === null ? null : nta >= L.ntaMinCr, severity: "gap", detail: "Checked on the latest year here; the DRHP must show all three." },
    { label: `Net worth ≥ ₹${L.netWorthMinCr} Cr in each of the last 3 years`, ok: nwL === null || nwP === null ? null : nwL >= L.netWorthMinCr && nwP >= L.netWorthMinCr, severity: "gap" },
    { label: "Average pre-tax operating profit ≥ ₹15 Cr in 3 of the last 5 years", ok: null, severity: "note", detail: "Not asked here — the Main Board profitability test needs five years of restated numbers. Our team checks this with you." },
    ...compliance,
  ];

  const platforms: PlatformResult[] = [
    { key: "nse_emerge", name: "NSE Emerge", checks: nse, verdict: verdictOf(nse), failing: nse.filter((c) => c.ok === false) },
    { key: "bse_sme", name: "BSE SME", checks: bse, verdict: verdictOf(bse), failing: bse.filter((c) => c.ok === false) },
    { key: "mainboard", name: "Main Board", checks: main, verdict: verdictOf(main), failing: main.filter((c) => c.ok === false) },
  ];

  const blockers = compliance.filter((c) => c.ok === false && c.severity === "block");
  let recommended: PlatformKey | null = null;
  if (!blockers.length) {
    if (cap !== null && cap > L.smeCapitalMaxCr) recommended = "mainboard";
    else {
      const smes = platforms.filter((p) => p.key !== "mainboard");
      const eligible = smes.filter((p) => p.verdict === "eligible");
      if (eligible.length) recommended = eligible[0].key;
      else {
        const best = [...smes].sort((a, b) => a.failing.length - b.failing.length)[0];
        if (best && best.verdict !== "incomplete") recommended = best.key;
      }
    }
  }

  const { answered, total } = countAnswered(i);
  return { platforms, recommended, answered, total, blockers };
}

export function eligibilityPayload(i: EligibilityInput, r: EligibilityResult): Record<string, string> {
  const yn = (v: boolean | null) => (v === null ? "—" : v ? "Yes" : "No");
  const n = (v: number | null, unit = " Cr") => (v === null ? "—" : `₹${v}${unit}`);
  const tr: Record<TrackRecord, string> = { lt1: "under 1 year", "1to2": "1–2 years", "2to3": "2–3 years", "3plus": "3+ years" };
  return {
    "Track record": i.trackRecord ? tr[i.trackRecord] : "—",
    "Converted from partnership / LLP": yn(i.converted),
    "Promoter change in last year": yn(i.promoterChangedLastYear),
    "Net worth latest FY": n(i.netWorthLatest),
    "Net worth previous FY": n(i.netWorthPrevious),
    "Net tangible assets": n(i.netTangibleAssets),
    "Years with EBITDA ≥ ₹1 Cr (of 3)": i.operatingProfitYears === null ? "—" : String(i.operatingProfitYears),
    "Operating profit latest FY": yn(i.operatingProfitLatest),
    "Years with positive FCFE (of 3)": i.fcfePositiveYears === null ? "—" : String(i.fcfePositiveYears),
    "Debt / equity": i.leverage === null ? "—" : `${i.leverage}×`,
    "Finance company": yn(i.financeCompany),
    "Post-issue paid-up capital": n(i.postIssueCapital),
    "Issue size": n(i.issueSize),
    "OFS portion": n(i.ofsPortion),
    "GCP amount": n(i.gcpAmount),
    "Rejected by exchange (6m)": yn(i.rejectedLast6m),
    "Insolvency / BIFR": yn(i.insolvency),
    "Winding up": yn(i.windingUp),
    "Debenture / deposit default": yn(i.debentureDefault),
    "Bank default (3y)": yn(i.bankDefault3y),
    "Regulatory action (1y)": yn(i.regulatoryAction),
    "Director charge-sheeted": yn(i.directorChargesheet),
    "3-year restated audited accounts": yn(i.auditedThreeYears),
    Result: r.platforms.map((p) => `${p.name}: ${p.verdict}`).join(" · "),
    Recommended: r.recommended ? r.platforms.find((p) => p.key === r.recommended)?.name ?? "—" : "—",
  };
}

// ---------------------------------------------------------------------------
// 3. Issue size calculator — PAT × sector P/E (+ growth premium), 20–30% dilution, ±10% band.
// ---------------------------------------------------------------------------
export const SECTOR_PE: { sector: string; pe: number }[] = [
  { sector: "IT / Software Services", pe: 28 },
  { sector: "FMCG / Consumer Goods", pe: 32 },
  { sector: "Pharma / Healthcare", pe: 30 },
  { sector: "Manufacturing / Engineering", pe: 15 },
  { sector: "Infrastructure / EPC", pe: 12 },
  { sector: "Textile / Apparel", pe: 12 },
  { sector: "Financial Services / NBFC", pe: 18 },
  { sector: "Retail / E-commerce", pe: 20 },
  { sector: "Agro / Food Processing", pe: 14 },
  { sector: "Renewable Energy", pe: 22 },
  { sector: "Chemicals / Specialty", pe: 18 },
  { sector: "Other", pe: 15 },
];

export interface IssueSizeResult {
  basePe: number;
  premiumPct: number; // 0 / 5 / 15 / 25
  pe: number; // adjusted, 1 decimal
  marketCap: number; // ₹ Cr point estimate
  marketCapLow: number;
  marketCapHigh: number;
  issueLow: number; // 20% of low band
  issueHigh: number; // 30% of high band
  dilutionLow: number;
  dilutionHigh: number;
}

/** Growth premium tiers: revenue CAGR at or above `minCagrPct` adds `premiumPct` to the sector multiple. */
export interface GrowthTier {
  minCagrPct: number;
  premiumPct: number;
}
export const GROWTH_TIERS: GrowthTier[] = [
  { minCagrPct: 30, premiumPct: 25 },
  { minCagrPct: 20, premiumPct: 15 },
  { minCagrPct: 10, premiumPct: 5 },
];

export interface IssueSizeRules {
  sectorPe: { sector: string; pe: number }[];
  growthTiers: GrowthTier[];
  dilutionLowPct: number;
  dilutionHighPct: number;
  /** Valuation band either side of the estimate, in percent. */
  bandPct: number;
}
export const DEFAULT_ISSUE_SIZE_RULES: IssueSizeRules = { sectorPe: SECTOR_PE, growthTiers: GROWTH_TIERS, dilutionLowPct: 20, dilutionHighPct: 30, bandPct: 10 };

/** "Adds a growth premium: 10%+ → +5% · 20%+ → +15% · 30%+ → +25% on the multiple." */
export function growthHint(tiers: GrowthTier[] = GROWTH_TIERS): string {
  const parts = [...tiers].sort((x, y) => x.minCagrPct - y.minCagrPct).map((t) => `${t.minCagrPct}%+ → +${t.premiumPct}%`);
  return `Adds a growth premium: ${parts.join(" · ")} on the multiple.`;
}

export function growthPremium(cagrPct: number | null, tiers: GrowthTier[] = GROWTH_TIERS): number {
  if (cagrPct === null || Number.isNaN(cagrPct)) return 0;
  // the highest tier the CAGR reaches, whatever order the tiers are stored in
  const reached = tiers.filter((t) => cagrPct >= t.minCagrPct).sort((a, b) => b.minCagrPct - a.minCagrPct)[0];
  return reached ? reached.premiumPct : 0;
}

export function calcIssueSize(patCr: number, sector: string, cagrPct: number | null, rules: IssueSizeRules = DEFAULT_ISSUE_SIZE_RULES): IssueSizeResult | null {
  const basePe = rules.sectorPe.find((s) => s.sector === sector)?.pe;
  if (!basePe || !(patCr > 0)) return null;
  const premiumPct = growthPremium(cagrPct, rules.growthTiers);
  const lowBand = 1 - rules.bandPct / 100;
  const highBand = 1 + rules.bandPct / 100;
  const pe = Math.round(basePe * (1 + premiumPct / 100) * 10) / 10;
  const marketCap = patCr * basePe * (1 + premiumPct / 100);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    basePe,
    premiumPct,
    pe,
    marketCap: r1(marketCap),
    marketCapLow: r1(marketCap * lowBand),
    marketCapHigh: r1(marketCap * highBand),
    issueLow: r1((marketCap * lowBand * rules.dilutionLowPct) / 100),
    issueHigh: r1((marketCap * highBand * rules.dilutionHighPct) / 100),
    dilutionLow: rules.dilutionLowPct,
    dilutionHigh: rules.dilutionHighPct,
  };
}

// ---------------------------------------------------------------------------
// 4. Issue cost estimator — line items as a share of issue size (website's ₹35 Cr reference deal).
// ---------------------------------------------------------------------------
const COST_REFERENCE_ISSUE_LAKHS = 3500; // ₹35 Cr reference issue; items below are in ₹ lakh for that deal
export const COST_ITEMS: { label: string; lakhs: number; hint?: string }[] = [
  { label: "Selling, Marketing and Underwriting Fees", lakhs: 185, hint: "Brokerage, syndicate and underwriting commission" },
  { label: "BRLM Fees", lakhs: 50, hint: "Book running lead manager" },
  { label: "Advertising & P.R. expenses", lakhs: 50 },
  { label: "Registrars (Fees) + Postage and DP charges", lakhs: 10 },
  { label: "Stock Exchange Fee & Other Misc. Charges", lakhs: 10 },
  { label: "Market Making Fees", lakhs: 30, hint: "Mandatory for SME issues for 3 years post listing" },
  { label: "Legal Counsel", lakhs: 5 },
  { label: "Printing (Forms, Prospectus, Banners, posters etc)", lakhs: 10 },
];
export const COST_STAGES: { label: string; lakhs: number }[] = [
  { label: "Signing of Mandate", lakhs: 10.75 },
  { label: "Completion of DRHP & Filing", lakhs: 11.25 },
  { label: "On NSE Approval", lakhs: 1 },
  { label: "On IPO Opening", lakhs: 8 },
  { label: "On IPO Completion", lakhs: 319 },
];
export interface IssueCostRules {
  /** The reference deal the line items are priced for, in ₹ lakh (3500 = ₹35 Cr). */
  referenceIssueLakhs: number;
  items: { label: string; lakhs: number; hint?: string }[];
  stages: { label: string; lakhs: number }[];
}
export const DEFAULT_ISSUE_COST_RULES: IssueCostRules = { referenceIssueLakhs: COST_REFERENCE_ISSUE_LAKHS, items: COST_ITEMS, stages: COST_STAGES };

export interface CostLine {
  label: string;
  hint?: string;
  amountCr: number;
  pct: number; // of issue size
}
export interface CostResult {
  issueSizeCr: number;
  totalCr: number;
  totalPct: number;
  items: CostLine[];
  stages: (CostLine & { cumulativePct: number })[]; // pct here = share of total cost
}

export function calcIssueCost(issueSizeCr: number, rules: IssueCostRules = DEFAULT_ISSUE_COST_RULES): CostResult | null {
  if (!(issueSizeCr > 0)) return null;
  const reference = rules.referenceIssueLakhs;
  const totalLakhs = rules.items.reduce((n, i) => n + i.lakhs, 0);
  if (!(reference > 0) || !(totalLakhs > 0)) return null;
  const scale = (issueSizeCr * 100) / reference; // lakhs per reference-lakh
  const items = rules.items.map((i) => ({ label: i.label, hint: i.hint, amountCr: (i.lakhs * scale) / 100, pct: (i.lakhs / reference) * 100 }));
  const totalCr = (totalLakhs * scale) / 100;
  let cum = 0;
  const stages = rules.stages.map((s) => {
    cum += s.lakhs;
    return { label: s.label, amountCr: (s.lakhs * scale) / 100, pct: (s.lakhs / totalLakhs) * 100, cumulativePct: (cum / totalLakhs) * 100 };
  });
  return { issueSizeCr, totalCr, totalPct: (totalLakhs / reference) * 100, items, stages };
}

/** ₹ crore / lakh formatter for planning numbers (0.058 → ₹5.80 L, 2 → ₹2.00 Cr). */
export function formatCrLakh(cr: number): string {
  if (!Number.isFinite(cr)) return "—";
  if (Math.abs(cr) >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(cr * 100).toFixed(2)} L`;
}

// ---------------------------------------------------------------------------
// 5. SME IPO listing checklist — 6 phases, 32 steps.
// ---------------------------------------------------------------------------
export interface ChecklistPhase {
  key: string;
  title: string;
  items: string[];
}
export const CHECKLIST: ChecklistPhase[] = [
  {
    key: "eligibility",
    title: "Check Your Eligibility",
    items: [
      "At least 3 years of operational track record",
      "Positive net worth and net tangible assets of at least ₹1.5 Cr",
      "Distributable profits in at least 2 of the last 3 financial years",
      "Post-issue paid-up capital within the ₹25 Cr SME platform limit",
      "No wilful-defaulter status or insolvency proceedings",
      "Functional company website",
    ],
  },
  {
    key: "ready",
    title: "Get IPO-Ready",
    items: [
      "Audited financials for the last 3 years, restated where needed",
      "Statutory auditor holds a valid peer review certificate",
      "Clean up related party transactions and inter-corporate loans",
      "Simplify and document the cap table",
      "Convert to a public limited company",
      "Appoint independent directors and constitute board committees",
      "Appoint a qualified Company Secretary",
    ],
  },
  {
    key: "intermediaries",
    title: "Appoint Intermediaries",
    items: [
      "Select and mandate a SEBI-registered merchant banker (lead manager)",
      "Appoint legal counsel for the issue",
      "Appoint a registrar & share transfer agent (RTA)",
      "Sign the market maker agreement",
      "Admit securities with NSDL and CDSL (demat)",
    ],
  },
  {
    key: "filing",
    title: "Documentation & Filing",
    items: [
      "Complete due diligence with the lead manager",
      "Draft the DRHP with specific, quantified risk factors",
      "Disclose all related party transactions in the standard format",
      "Justify each object of the issue with supporting documents",
      "File the DRHP with the exchange and respond to queries",
      "Receive in-principle approval; file the RHP with the ROC",
    ],
  },
  {
    key: "issue",
    title: "Issue & Listing",
    items: ["Finalise issue price / price band and issue structure", "Run marketing, advertising and investor roadshows", "Open and close the issue; complete the basis of allotment", "Obtain the listing approval and trade on listing day"],
  },
  {
    key: "post",
    title: "Post-Listing",
    items: ["Meet continuous disclosure obligations (SEBI LODR)", "Maintain the 3-year market making arrangement", "Run a structured investor relations programme", "Plan migration to the Main Board as the company grows"],
  },
];
export const CHECKLIST_TOTAL = CHECKLIST.reduce((n, p) => n + p.items.length, 0);

export function checklistKey(phaseKey: string, index: number): string {
  return `${phaseKey}:${index}`;
}

export function checklistProgress(done: Record<string, boolean>): { done: number; total: number; percent: number; byPhase: { key: string; title: string; done: number; total: number }[] } {
  const byPhase = CHECKLIST.map((p) => ({ key: p.key, title: p.title, total: p.items.length, done: p.items.filter((_, i) => done[checklistKey(p.key, i)]).length }));
  const d = byPhase.reduce((n, p) => n + p.done, 0);
  return { done: d, total: CHECKLIST_TOTAL, percent: Math.round((d / CHECKLIST_TOTAL) * 100), byPhase };
}
