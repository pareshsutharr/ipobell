import type { ChipTone } from "@/components/ui/Chip";
import type { InsightVerdict, IpoInsight } from "@/features/insights/types";

/** Shown wherever the house view (verdict) appears. One wording everywhere; change it here only. */
export const HOUSE_VIEW_DISCLAIMER = "Editorial opinion from an SME IPO advisory firm, not SEBI-registered investment advice. Do your own research.";
/** Shorter form for small cards where the full line does not fit. */
export const HOUSE_VIEW_DISCLAIMER_SHORT = "Our opinion, not investment advice.";

/** Editorial house view → label, tone and icon. Wording deliberately avoids buy/sell language. */
export function verdictMeta(v: InsightVerdict | null | undefined): { label: string; tone: ChipTone; icon: "trending-up-outline" | "remove-outline" | "alert-circle-outline" } {
  switch (v) {
    case "positive":
      return { label: "Worth a close look", tone: "gain", icon: "trending-up-outline" };
    case "cautious":
      return { label: "Proceed with caution", tone: "loss", icon: "alert-circle-outline" };
    case "neutral":
    default:
      return { label: "Balanced view", tone: "neutral", icon: "remove-outline" };
  }
}

/** "Surat, Gujarat · Founded 2011 · 120 people · Textiles" */
export function insightVitals(i: Pick<IpoInsight, "location_city" | "location_state" | "founded_year" | "employees" | "sector">): { icon: "location-outline" | "calendar-outline" | "people-outline" | "briefcase-outline"; text: string }[] {
  const out: { icon: "location-outline" | "calendar-outline" | "people-outline" | "briefcase-outline"; text: string }[] = [];
  const place = [i.location_city, i.location_state].filter(Boolean).join(", ");
  if (place) out.push({ icon: "location-outline", text: place });
  if (i.founded_year) out.push({ icon: "calendar-outline", text: `Founded ${i.founded_year}` });
  if (i.employees) out.push({ icon: "people-outline", text: i.employees });
  if (i.sector) out.push({ icon: "briefcase-outline", text: i.sector });
  return out;
}

/** Split long-form text into paragraphs (admin panel saves plain text with blank lines). */
export function paragraphs(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
