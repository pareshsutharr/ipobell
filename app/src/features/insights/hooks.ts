import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { fetchInsight, fetchInsightMarkers } from "@/features/insights/api";
import type { InsightMarker } from "@/features/insights/types";
import { qk } from "@/lib/query";
import { supabase } from "@/lib/supabase";

// Staff publish, edit and unpublish from the admin panel; the app must follow within seconds, not minutes.
const INSIGHT_STALE_MS = 15 * 1000;

export function useInsight(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.insight(ipoId ?? ""),
    queryFn: () => fetchInsight(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: INSIGHT_STALE_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useInsightMarkers() {
  return useQuery({ queryKey: qk.insightMarkers(), queryFn: fetchInsightMarkers, staleTime: INSIGHT_STALE_MS, refetchOnWindowFocus: true, retry: 1 });
}

/** Marker for one IPO, read from the shared markers query (cheap to call from every list row). */
export function useInsightMarker(ipoId: string | undefined): InsightMarker | undefined {
  const { data } = useInsightMarkers();
  return useMemo(() => (ipoId ? data?.find((m) => m.ipo_id === ipoId) : undefined), [data, ipoId]);
}

/**
 * App-wide realtime: any change to ipo_insights invalidates the markers and the touched IPO's insight.
 * Unpublishing makes the row invisible to the app, so that event may not arrive; the short staleTime,
 * refetch-on-open and refetch-on-foreground above cover that case.
 */
export function useInsightsRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`insights:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ipo_insights" }, (payload) => {
        const row = (payload.new ?? payload.old) as { ipo_id?: string } | null;
        qc.invalidateQueries({ queryKey: qk.insightMarkers() });
        if (row?.ipo_id) qc.invalidateQueries({ queryKey: qk.insight(row.ipo_id) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

/** Image URL with a version suffix so a replaced picture is not served from the on-device image cache. */
export function imageUri(url: string | null | undefined, version: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!version) return url;
  const v = encodeURIComponent(version.slice(0, 24));
  return url.includes("?") ? `${url}&v=${v}` : `${url}?v=${v}`;
}
