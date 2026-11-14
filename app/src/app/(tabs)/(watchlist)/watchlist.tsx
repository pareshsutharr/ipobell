import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { EmptyState, ErrorState, ListSkeleton, Screen, Text } from "@/components/ui";
import { IpoCard } from "@/features/ipos/components/IpoCard";
import type { IpoListItem, IpoStatus } from "@/features/ipos/types";
import { useWatchlist, useWatchlistIpos } from "@/features/watchlist/hooks";
import { useTheme } from "@/lib/theme/ThemeProvider";

const ORDER: { status: IpoStatus; title: string }[] = [
  { status: "open", title: "Open" },
  { status: "upcoming", title: "Upcoming" },
  { status: "closed", title: "Closed · awaiting listing" },
  { status: "listed", title: "Listed" },
];

export default function WatchlistScreen() {
  const { colors, spacing } = useTheme();
  const watchlist = useWatchlist();
  const ipos = useWatchlistIpos();

  const sections = useMemo(
    () =>
      ORDER.map((s) => ({ title: s.title, data: (ipos.data ?? []).filter((i) => i.status === s.status) })).filter((s) => s.data.length > 0),
    [ipos.data],
  );
  const count = watchlist.data?.length ?? 0;

  const renderItem = useCallback(({ item, index }: { item: IpoListItem; index: number }) => <IpoCard ipo={item} index={index} />, []);
  const onRefresh = useCallback(() => {
    void Promise.all([watchlist.refetch(), ipos.refetch()]);
  }, [watchlist, ipos]);

  const loading = (watchlist.isLoading || ipos.isLoading) && !ipos.data;

  let body: React.ReactNode;
  if (loading) {
    body = <ListSkeleton count={3} />;
  } else if ((watchlist.isError || ipos.isError) && !ipos.data) {
    body = <ErrorState onRetry={onRefresh} />;
  } else if (!sections.length) {
    body = (
      <EmptyState
        icon="star-outline"
        title="Your watchlist is empty"
        message="Tap the star on any IPO to follow it. Watchlisted IPOs get GMP alerts and can power watchlist-only notifications."
        actionLabel="Browse IPOs"
        onAction={() => router.navigate("/")}
      />
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <Animated.View entering={FadeIn} style={[styles.sectionHeader, { backgroundColor: colors.background, paddingHorizontal: spacing.lg }]}>
            <Text variant="overline" color="textFaint">
              {section.title}
            </Text>
            <Text variant="caption" color="textFaint" numeric>
              {section.data.length}
            </Text>
          </Animated.View>
        )}
        stickySectionHeadersEnabled
        refreshControl={<RefreshControl refreshing={ipos.isRefetching} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressBackgroundColor={colors.surface} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
      />
    );
  }

  return (
    <Screen>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text variant="h1">Watchlist</Text>
          <View style={styles.subRow}>
            <Ionicons name="star" size={12} color={colors.primary} />
            <Text variant="bodySm" color="textMuted" numeric>
              {`${count} IPO${count === 1 ? "" : "s"}`}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingTop: 10, paddingBottom: 14, gap: 12 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 14, paddingBottom: 6 },
});
