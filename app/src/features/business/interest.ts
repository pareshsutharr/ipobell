// Pre-IPO / fundraising interest (pure, unit-tested). Sent through the existing lead form with source
// "business-hub"; the interest type rides in the payload and the message, so no backend change is needed and the
// staff e-mail shows it as "Interest: ...".
export type InterestType = "fundraising" | "pre_ipo" | "ipo";

export const INTEREST_TYPES: { value: InterestType; label: string; blurb: string }[] = [
  { value: "fundraising", label: "Fundraising", blurb: "Growth capital from investors now, with a listing later or not at all." },
  { value: "pre_ipo", label: "Pre-IPO round", blurb: "A placement with investors in the months before the IPO." },
  { value: "ipo", label: "IPO", blurb: "Listing on NSE Emerge, BSE SME or the Main Board." },
];

export interface InterestLead {
  title: string;
  subtitle: string;
  cta: string;
  blurb: string;
  message: string;
  payload: Record<string, string>;
}

export function interestLead(type: InterestType): InterestLead {
  const t = INTEREST_TYPES.find((x) => x.value === type) ?? INTEREST_TYPES[0];
  const what = t.value === "fundraising" ? "fundraising" : t.value === "pre_ipo" ? "a pre-IPO round" : "an IPO";
  return {
    title: t.value === "ipo" ? "Talk to us about your IPO" : t.value === "pre_ipo" ? "Talk to us about a pre-IPO round" : "Talk to us about fundraising",
    subtitle: "Share your details and an advisor will call you back within one working day. No obligation.",
    cta: "Request a call",
    blurb: t.blurb,
    message: `Interested in ${what}.`,
    payload: { Interest: t.label },
  };
}
