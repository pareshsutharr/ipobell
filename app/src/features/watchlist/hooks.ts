import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";

import { fetchIposByIds } from "@/features/ipos/api";
import type { WatchlistRow } from "@/features/ipos/types";
import { useUserId } from "@/lib/auth/hooks";
import { qk } from "@/lib/query";
import { errorMessage, supabase } from "@/lib/supabase";

export const FREE_WATCHLIST_LIMIT = 50;

export function useWatchlist() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.watchlist(userId),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("watchlist").select("*").eq("user_id", userId as string).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WatchlistRow[];
    },
  });
}

export function useWatchlistIpos() {
  const { data: rows } = useWatchlist();
  const userId = useUserId();
  const ids = useMemo(() => (rows ?? []).map((r) => r.ipo_id), [rows]);
  return useQuery({
    queryKey: [...qk.watchlistIpos(userId), ids.join(",")],
    enabled: Boolean(userId) && rows !== undefined,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const ipos = await fetchIposByIds(ids);
      const order = new Map(ids.map((id, i) => [id, i]));
      return ipos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
  });
}

export function useIsWatched(ipoId: string | undefined): boolean {
  const { data } = useWatchlist();
  return Boolean(ipoId && data?.some((r) => r.ipo_id === ipoId));
}

export class WatchlistLimitError extends Error {}

export function useToggleWatchlist() {
  const userId = useUserId();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ ipoId, watched }: { ipoId: string; watched: boolean }) => {
      if (!userId) throw new Error("Not signed in");
      if (watched) {
        const { error } = await supabase.from("watchlist").delete().eq("user_id", userId).eq("ipo_id", ipoId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("watchlist").insert({ user_id: userId, ipo_id: ipoId });
        if (error) {
          if (error.message.includes("WATCHLIST_LIMIT")) throw new WatchlistLimitError(errorMessage(error));
          throw error;
        }
      }
    },
    onMutate: async ({ ipoId, watched }) => {
      await qc.cancelQueries({ queryKey: qk.watchlist(userId) });
      const prev = qc.getQueryData<WatchlistRow[]>(qk.watchlist(userId)) ?? [];
      const next = watched
        ? prev.filter((r) => r.ipo_id !== ipoId)
        : [{ id: `tmp-${ipoId}`, user_id: userId as string, ipo_id: ipoId, created_at: new Date().toISOString() }, ...prev];
      qc.setQueryData(qk.watchlist(userId), next);
      Haptics.impactAsync(watched ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(qk.watchlist(userId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.watchlist(userId) });
      qc.invalidateQueries({ queryKey: qk.watchlistIpos(userId) });
    },
  });

  const toggle = useCallback((ipoId: string, watched: boolean) => mutation.mutateAsync({ ipoId, watched }), [mutation]);
  return { toggle, isPending: mutation.isPending };
}
