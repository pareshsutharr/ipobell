// Mirrors public.ipo_insights (supabase/migrations/20261029000100_roles_admins_insights.sql)
export type InsightVerdict = "positive" | "neutral" | "cautious";

export interface InsightHighlight {
  label: string;
  value: string;
}

export interface InsightImage {
  url: string;
  caption?: string | null;
}

export interface IpoInsight {
  id: string;
  ipo_id: string;
  status: "draft" | "published";
  headline: string | null;
  summary: string | null;
  company_story: string | null;
  founder_story: string | null;
  listing_journey: string | null;
  lessons: string | null;
  location_city: string | null;
  location_state: string | null;
  founded_year: number | null;
  employees: string | null;
  sector: string | null;
  verdict: InsightVerdict | null;
  verdict_note: string | null;
  takeaways: string[];
  highlights: InsightHighlight[];
  hero_image_url: string | null;
  gallery: InsightImage[];
  video_url: string | null;
  show_to_investors: boolean;
  published_at: string | null;
  updated_at: string;
}

export interface InsightMarker {
  ipo_id: string;
  verdict: InsightVerdict | null;
  headline: string | null;
  hero_image_url: string | null;
  published_at: string | null;
}
