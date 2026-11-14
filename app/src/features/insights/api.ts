import type { InsightMarker, IpoInsight } from "@/features/insights/types";
import { supabase } from "@/lib/supabase";

function normalise(row: Record<string, unknown>): IpoInsight {
  return {
    ...(row as unknown as IpoInsight),
    takeaways: Array.isArray(row.takeaways) ? (row.takeaways as string[]) : [],
    highlights: Array.isArray(row.highlights) ? (row.highlights as IpoInsight["highlights"]) : [],
    gallery: Array.isArray(row.gallery) ? (row.gallery as IpoInsight["gallery"]) : [],
  };
}

/** Published insight for one IPO (RLS hides drafts from the app). */
export async function fetchInsight(ipoId: string): Promise<IpoInsight | null> {
  const { data, error } = await supabase.from("ipo_insights").select("*").eq("ipo_id", ipoId).eq("status", "published").maybeSingle();
  if (error) throw error;
  return data ? normalise(data as Record<string, unknown>) : null;
}

/** Which IPOs have a published insight — one small query for list markers. */
export async function fetchInsightMarkers(): Promise<InsightMarker[]> {
  const { data, error } = await supabase.from("ipo_insight_markers").select("*").order("published_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as InsightMarker[];
}
