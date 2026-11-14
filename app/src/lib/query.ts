import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000, // keep for offline use
      retry: 2,
      refetchOnReconnect: true,
    },
  },
});

// React Native has no window focus events; tell TanStack when the app comes to the foreground so
// stale queries (insights, lists) refetch on resume.
AppState.addEventListener("change", (state) => focusManager.setFocused(state === "active"));

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "ipobell-query-cache-v1",
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const qk = {
  ipos: (status: string, board: string | null, q: string) => ["ipos", status, board ?? "all", q] as const,
  iposPaged: (status: string, board: string | null) => ["ipos-paged", status, board ?? "all"] as const,
  stateCounts: (board: string | null) => ["ipo-state-counts", board ?? "all"] as const,
  iposByState: (state: string | null, status: string | null) => ["ipos-by-state", state ?? "not-specified", status ?? "all"] as const,
  ipoStates: () => ["ipo-states"] as const,
  sectorStats: (board: string | null) => ["ipo-sector-stats", board ?? "all"] as const,
  iposBySector: (sector: string | null, status: string | null) => ["ipos-by-sector", sector ?? "not-specified", status ?? "all"] as const,
  ipoInterest: (ipoId: string) => ["ipo-interest", ipoId] as const,
  ipo: (slug: string) => ["ipo", slug] as const,
  subscription: (ipoId: string) => ["ipo-subscription", ipoId] as const,
  gmpHistory: (ipoId: string) => ["ipo-gmp", ipoId] as const,
  financials: (ipoId: string) => ["ipo-financials", ipoId] as const,
  documents: (ipoId: string) => ["ipo-documents", ipoId] as const,
  anchors: (ipoId: string) => ["ipo-anchors", ipoId] as const,
  upcomingDates: () => ["ipo-dates"] as const,
  listed: (board: string | null, months: number) => ["ipos-listed", board ?? "all", months] as const,
  stats: (board: string | null, months: number) => ["listing-stats", board ?? "all", months] as const,
  watchlist: (userId: string | null) => ["watchlist", userId] as const,
  watchlistIpos: (userId: string | null) => ["watchlist-ipos", userId] as const,
  prefs: (userId: string | null) => ["notification-preferences", userId] as const,
  profile: (userId: string | null) => ["profile", userId] as const,
  insight: (ipoId: string) => ["ipo-insight", ipoId] as const,
  insightMarkers: () => ["ipo-insight-markers"] as const,
};
