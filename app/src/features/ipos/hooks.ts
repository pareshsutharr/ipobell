import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  fetchAllotmentWindow,
  fetchAnchors,
  fetchDocuments,
  fetchDrhpSummary,
  fetchFinancials,
  fetchGmpHistory,
  fetchIpo,
  fetchIpos,
  fetchIpoInterest,
  fetchIpoStates,
  fetchIposBySector,
  fetchIposByState,
  fetchIposPage,
  fetchLatestSubscription,
  fetchListed,
  fetchListingStats,
  fetchSectorStats,
  fetchStateCounts,
  fetchSubscriptionTrend,
  fetchUploadedDocuments,
  searchIpos,
  type ListFilters,
} from "@/features/ipos/api";
import { IPO_PAGE_SIZE, nextOffset } from "@/features/ipos/paging";
import type { Board, IpoStatus } from "@/features/ipos/types";
import { qk } from "@/lib/query";
import { supabase } from "@/lib/supabase";

export function useIpos(status: IpoStatus, filters: ListFilters = {}) {
  return useQuery({
    queryKey: qk.ipos(status, filters.board ?? null, filters.search ?? ""),
    queryFn: () => fetchIpos(status, filters),
    staleTime: status === "open" ? 30 * 1000 : 5 * 60 * 1000,
  });
}

/** A status list loaded a page at a time (Listed and Closed can run to hundreds of rows). */
export function useIposPaged(status: IpoStatus, filters: ListFilters = {}) {
  return useInfiniteQuery({
    queryKey: qk.iposPaged(status, filters.board ?? null),
    queryFn: ({ pageParam }) => fetchIposPage(status, filters, pageParam, IPO_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStateCounts(board: Board | null) {
  return useQuery({ queryKey: qk.stateCounts(board), queryFn: () => fetchStateCounts(board), staleTime: 10 * 60 * 1000, retry: 1 });
}

export function useIposByState(state: string | null, status: IpoStatus | null) {
  return useInfiniteQuery({
    queryKey: qk.iposByState(state, status),
    queryFn: ({ pageParam }) => fetchIposByState(state, status, pageParam, IPO_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSectorStats(board: Board | null) {
  return useQuery({ queryKey: qk.sectorStats(board), queryFn: () => fetchSectorStats(board), staleTime: 10 * 60 * 1000, retry: 1 });
}

export function useIposBySector(sector: string | null, status: IpoStatus | null) {
  return useInfiniteQuery({
    queryKey: qk.iposBySector(sector, status),
    queryFn: ({ pageParam }) => fetchIposBySector(sector, status, pageParam, IPO_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => nextOffset(last, pages),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** State per IPO id, shared by every list row (one small request, cached for half an hour). */
export function useIpoStates() {
  return useQuery({ queryKey: qk.ipoStates(), queryFn: fetchIpoStates, staleTime: 30 * 60 * 1000, retry: 1 });
}

/** The state entered for one IPO, or undefined when none is entered. */
export function useIpoState(ipoId: string | undefined): string | undefined {
  const { data } = useIpoStates();
  return ipoId ? data?.[ipoId] : undefined;
}

/** Published DRHP summary. A failure (for example an older backend) shows nothing rather than an error. */
export function useDrhpSummary(ipoId: string | undefined) {
  return useQuery({ queryKey: qk.drhpSummary(ipoId ?? ""), queryFn: () => fetchDrhpSummary(ipoId as string), enabled: Boolean(ipoId), staleTime: 60 * 1000, refetchOnMount: "always", retry: false });
}

export function useUploadedDocuments(ipoId: string | undefined) {
  return useQuery({ queryKey: qk.uploadedDocuments(ipoId ?? ""), queryFn: () => fetchUploadedDocuments(ipoId as string), enabled: Boolean(ipoId), staleTime: 5 * 60 * 1000, retry: false });
}

/** Interest totals for one IPO. A failure (for example an older backend) simply shows nothing. */
export function useIpoInterest(ipoId: string | undefined) {
  return useQuery({ queryKey: qk.ipoInterest(ipoId ?? ""), queryFn: () => fetchIpoInterest(ipoId as string), enabled: Boolean(ipoId), staleTime: 10 * 60 * 1000, retry: false });
}

export function useIpoSearch(search: string) {
  const q = search.trim();
  return useQuery({
    queryKey: ["ipo-search", q],
    queryFn: () => searchIpos(q),
    enabled: q.length >= 2,
    staleTime: 60 * 1000,
  });
}

export function useIpo(slug: string | undefined) {
  return useQuery({
    queryKey: qk.ipo(slug ?? ""),
    queryFn: () => fetchIpo(slug as string),
    enabled: Boolean(slug),
    staleTime: 30 * 1000,
  });
}

export function useSubscription(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.subscription(ipoId ?? ""),
    queryFn: () => fetchLatestSubscription(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 30 * 1000,
  });
}

export function useSubscriptionTrend(ipoId: string | undefined) {
  return useQuery({
    queryKey: ["ipo-subscription-trend", ipoId ?? ""],
    queryFn: () => fetchSubscriptionTrend(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 60 * 1000,
  });
}

export function useGmpHistory(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.gmpHistory(ipoId ?? ""),
    queryFn: () => fetchGmpHistory(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFinancials(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.financials(ipoId ?? ""),
    queryFn: () => fetchFinancials(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 60 * 60 * 1000,
  });
}

export function useDocuments(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.documents(ipoId ?? ""),
    queryFn: () => fetchDocuments(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 60 * 60 * 1000,
  });
}

export function useAnchors(ipoId: string | undefined) {
  return useQuery({
    queryKey: qk.anchors(ipoId ?? ""),
    queryFn: () => fetchAnchors(ipoId as string),
    enabled: Boolean(ipoId),
    staleTime: 60 * 60 * 1000,
  });
}

export function useAllotmentWindow() {
  return useQuery({ queryKey: qk.upcomingDates(), queryFn: fetchAllotmentWindow, staleTime: 5 * 60 * 1000 });
}

export function useListed(board: Board | null, months: number) {
  return useQuery({ queryKey: qk.listed(board, months), queryFn: () => fetchListed(board, months), staleTime: 10 * 60 * 1000 });
}

export function useListingStats(board: Board | null, months: number) {
  return useQuery({ queryKey: qk.stats(board, months), queryFn: () => fetchListingStats(board, months), staleTime: 10 * 60 * 1000 });
}

/**
 * Live updates for one IPO: subscription snapshots, GMP points and the row itself
 * (Supabase Realtime → invalidate the relevant queries).
 */
export function useIpoRealtime(ipoId: string | undefined, slug: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!ipoId || !slug) return;
    // Unique topic per mount: supabase.channel() returns an existing channel with the same name,
    // and adding listeners to an already-subscribed channel throws.
    const channel = supabase
      .channel(`ipo:${ipoId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ipos", filter: `id=eq.${ipoId}` }, () => {
        qc.invalidateQueries({ queryKey: qk.ipo(slug) });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ipo_subscriptions", filter: `ipo_id=eq.${ipoId}` }, () => {
        qc.invalidateQueries({ queryKey: qk.subscription(ipoId) });
        qc.invalidateQueries({ queryKey: ["ipo-subscription-trend", ipoId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ipo_gmp_history", filter: `ipo_id=eq.${ipoId}` }, () => {
        qc.invalidateQueries({ queryKey: qk.gmpHistory(ipoId) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ipo_insights", filter: `ipo_id=eq.${ipoId}` }, () => {
        qc.invalidateQueries({ queryKey: qk.insight(ipoId) });
        qc.invalidateQueries({ queryKey: qk.insightMarkers() });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [ipoId, slug, qc]);
}
