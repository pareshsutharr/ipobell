import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Disclaimer, EmptyState, ErrorState, FilterChip, IconButton, ListSkeleton, PressableScale, Screen, SegmentedControl, Text } from "@/components/ui";
import { BusinessPromo } from "@/features/business/components/BusinessPromo";
import { BusinessStrip } from "@/features/business/components/BusinessStrip";
import { LatestInsights } from "@/features/insights/components/LatestInsights";
import { useInsightMarkers } from "@/features/insights/hooks";
import { PerspectiveSwitch } from "@/features/perspective/PerspectiveSwitch";
import { usePerspective } from "@/features/perspective/store";
import { IpoCard } from "@/features/ipos/components/IpoCard";
import { useIpos } from "@/features/ipos/hooks";
import type { Board, IpoListItem, IpoStatus } from "@/features/ipos/types";
import { openExternal } from "@/lib/analytics";
import { env } from "@/lib/env";
import { BrandLogo } from "@/features/shell/components/Brand";
import { useTheme } from "@/lib/theme/ThemeProvider";

type Row = { kind: "ipo"; ipo: IpoListItem; index: number };

const SEGMENTS: IpoStatus[] = ["open", "upcoming", "closed", "listed"];

const EMPTY_COPY: Record<IpoStatus, { title: string; message: string }> = {
  open: { title: "No IPOs open right now", message: "Check Upcoming for issues opening soon. We'll ring the bell when one opens." },
  upcoming: { title: "Nothing on the calendar yet", message: "New IPOs appear here as soon as they're announced." },
  closed: { title: "No IPOs awaiting listing", message: "Issues that have closed and are waiting to list show up here." },
  listed: { title: "No listings found", message: "Try a different board filter." },
};

function isStatus(v: unknown): v is IpoStatus {
  return typeof v === "string" && (SEGMENTS as string[]).includes(v);
}

export default function HomeScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<IpoStatus>(isStatus(params.segment) ? params.segment : "open");
  const [board, setBoard] = useState<Board | null>(null);
  const perspective = usePerspective((s) => s.perspective);
  const business = perspective === "business";
  const markers = useInsightMarkers();

  // Derived state: a new deep-link param (e.g. from a push tap) switches the segment during render.
  const [seenParam, setSeenParam] = useState(params.segment);
  if (params.segment !== seenParam) {
    setSeenParam(params.segment);
    if (isStatus(params.segment)) setSegment(params.segment);
  }

  // All four queries run so segment counts are visible; only the active one drives the list.
  const open = useIpos("open", { board });
  const upcoming = useIpos("upcoming", { board });
  const closed = useIpos("closed", { board });
  const listed = useIpos("listed", { board });
  const byStatus = { open, upcoming, closed, listed } as const;
  const active = byStatus[segment];

  const rows = useMemo<Row[]>(() => {
    const data = active.data ?? [];
    const out: Row[] = [];
    data.forEach((ipo, index) => {
      out.push({ kind: "ipo", ipo, index });
    });
    return out;
  }, [active.data]);

  const onWatchlistLimit = useCallback(() => {
    Alert.alert("Watchlist is full", "You can watch up to 50 IPOs. Remove one to add another.");
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => <IpoCard ipo={item.ipo} index={item.index} onWatchlistLimit={onWatchlistLimit} />,
    [onWatchlistLimit],
  );
  const keyExtractor = useCallback((item: Row) => item.ipo.id, []);

  const onRefresh = useCallback(() => {
    void Promise.all([open.refetch(), upcoming.refetch(), closed.refetch(), listed.refetch(), markers.refetch()]);
  }, [open, upcoming, closed, listed, markers]);

  const Header = (
    <View style={{ paddingBottom: spacing.xs, gap: spacing.md }}>
      {business ? <BusinessStrip /> : null}
      {business ? <LatestInsights /> : null}
      <SegmentedControl
        value={segment}
        onChange={setSegment}
        options={[
          { value: "open", label: "Open", count: open.data?.length },
          { value: "upcoming", label: "Upcoming", count: upcoming.data?.length },
          { value: "closed", label: "Closed", count: closed.data?.length },
          { value: "listed", label: "Listed" },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xs }}>
        <FilterChip label="All" selected={board === null} onPress={() => setBoard(null)} />
        <FilterChip label="Mainboard" selected={board === "mainboard"} onPress={() => setBoard("mainboard")} />
        <FilterChip label="SME" selected={board === "sme"} onPress={() => setBoard("sme")} />
      </ScrollView>
      {segment === "listed" ? (
        <PressableScale onPress={() => router.push("/listing-stats")} accessibilityRole="button" accessibilityLabel="Open listing statistics" style={[styles.statsLink, { marginHorizontal: spacing.lg, borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="stats-chart-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="title">Listing statistics</Text>
            <Text variant="caption" color="textMuted">
              Average listing gain and hit rate, SME against Mainboard
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </PressableScale>
      ) : null}
    </View>
  );

  const Footer = (
    <View style={{ paddingVertical: spacing.xl, gap: spacing.md }}>
      {business ? null : <BusinessPromo />}
      <Disclaimer compact />
      <PressableScale onPress={() => openExternal(env.links.dataAttribution, "IPO Guru attribution")} style={styles.attribution} accessibilityRole="link">
        <Text variant="caption" color="textFaint">
          Data by{" "}
        </Text>
        <Text variant="caption" color="primary" weight="semibold">
          IPO Guru
        </Text>
        <Ionicons name="open-outline" size={11} color={colors.primary} />
      </PressableScale>
    </View>
  );

  let body: React.ReactNode;
  if (active.isLoading && !active.data) {
    body = (
      <View>
        {Header}
        <ListSkeleton count={5} />
      </View>
    );
  } else if (active.isError && !active.data) {
    body = (
      <View>
        {Header}
        <ErrorState message={active.error instanceof Error ? active.error.message : undefined} onRetry={() => active.refetch()} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={<EmptyState icon="pulse-outline" title={EMPTY_COPY[segment].title} message={EMPTY_COPY[segment].message} />}
        refreshControl={<RefreshControl refreshing={active.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingTop: spacing.xs }}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <Screen>
      <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
        <View style={styles.wordmark}>
          <BrandLogo height={36} />
        </View>
        <View style={styles.actions}>
          <IconButton icon="search-outline" accessibilityLabel="Search IPOs" onPress={() => router.push("/search")} />
          <IconButton icon="notifications-outline" accessibilityLabel="Notification settings" onPress={() => router.push("/notifications")} />
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
        <PerspectiveSwitch />
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8, paddingBottom: 10 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 8 },
  attribution: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3 },
  statsLink: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});
