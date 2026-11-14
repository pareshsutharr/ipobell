// Public runtime config. Only EXPO_PUBLIC_* variables are available here — never secrets.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Copy app/.env.example to app/.env and fill it in.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("EXPO_PUBLIC_SUPABASE_ANON_KEY", process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  links: {
    website: "https://beipoready.com",
    privacy: "https://beipoready.com/privacy-policy",
    terms: "https://beipoready.com/terms-and-conditions",
    disclaimer: "https://beipoready.com/disclaimer",
    contact: "https://beipoready.com/contact-us",
    getListed: "https://beipoready.com/get-listed",
    readinessTool: "https://beipoready.com/ipo-readiness-tool",
    issueSize: "https://beipoready.com/issue-size-calculator",
    issueCost: "https://beipoready.com/issue-cost-estimator",
    checklist: "https://beipoready.com/sme-ipo-checklist",
    caseStudies: "https://beipoready.com/case-studies",
    faqs: "https://beipoready.com/faqs",
    smeAdvisory: "https://beipoready.com/services/sme-ipo-advisory",
    knowledge: "https://beipoready.com/knowledge-center",
    whatsapp: "https://wa.me/919213020393?text=Hi%20Be%20IPO%20Ready%2C%20I%20used%20the%20app%20and%20want%20to%20discuss%20listing%20my%20company.",
    support: "tel:+919213020393",
    dataAttribution: "https://www.ipoguru.in",
  },
  brand: {
    name: "Be IPO Ready",
    shortName: "BEIPOREADY",
    tagline: "Adding value before valuation",
    phone: "+91 92130 20393",
    address: "The Junomoneta Tower, Adajan, Surat 395009",
  },
} as const;
