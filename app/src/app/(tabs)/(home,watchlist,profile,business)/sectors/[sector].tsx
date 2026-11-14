// IPOs of one sector (or the "Not specified" group), loaded a page at a time, with a status filter.
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View } from "react-native";

import { Disclaimer, EmptyState, ErrorState, FilterChip, ListSkeleton, Screen, Text } from "@/components/ui";
import { IpoCard } from "@/features/ipos/components/IpoCard";
import { useIposBySector, useSectorStats } from "@/features/ipos/hooks";
import { flattenPages, totalOf } from "@/features/ipos/paging";
import { isNotSetUpError, paramToState, stateLabel } from "@/features/ipos/states";
import type { IpoListItem, IpoStatus } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { useTheme } from "@/lib/theme/ThemeProvider";

const STATUSES: { value: IpoStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "upcoming", label: "Upcoming" },
  { value: "closed", label: "Closed" },
  { value: "listed", label: "Listed" },
];

export default function SectorIposScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ sector: string }>();
  const sector = paramToState(params.sector);
  const [status, setStatus] = useState<IpoStatus | null>(null);

  const list = useIposBySector(sector, status);
  const counts = useSectorStats(null);
  const mine = counts.data?.find((c) => (c.sector ?? null) === sector);
  const rows = useMemo(() => flattenPages(list.data?.pages), [list.data]);
  const total = totalOf(list.data?.pages);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(({ item, index }: { item: IpoListItem; index: number }) => <IpoCard ipo={item} index={index} />, []);

  const Header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
      <FilterChip label="All" selected={status === null} onPress={() => setStatus(null)} count={mine?.total} />
      {STATUSES.map((s) => (
        <FilterChip key={s.value} label={s.label} selected={status === s.value} onPress={() => setStatus(s.value)} count={mine ? mine[s.value] : undefined} />
      ))}
    </ScrollView>
  );

  const Footer = (
    <View style={{ paddingVertical: spacing.xl, gap: spacing.md }}>
      {isFetchingNextPage ? (
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more IPOs" />
      ) : !hasNextPage && rows.length > 0 ? (
        <Text variant="caption" color="textFaint" align="center">
          All {total ?? rows.length} shown
        </Text>
      ) : null}
      <Disclaimer compact />
    </View>
  );

  let body: React.ReactNode;
  if (list.isLoading && !list.data) {
    body = (
      <View>
        {Header}
        <ListSkeleton count={5} />
      </View>
    );
  } else if (list.isError && !list.data) {
    body = isNotSetUpError(list.error) ? (
      <EmptyState icon="pie-chart-outline" title="Sector view is being set up" message="This view will appear once our servers are updated. Please check back soon." />
    ) : (
      <ErrorState message={list.error instanceof Error ? list.error.message : undefined} onRetry={() => list.refetch()} />
    );
  } else {
    body = (
      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={<EmptyState icon="file-tray-outline" title={status ? `No ${status} IPOs here` : "No IPOs here"} message={status ? "Try another status." : undefined} compact />}
        refreshControl={<RefreshControl refreshing={list.isRefetching && !isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <Screen>
      <PageHeader title={stateLabel(sector)} subtitle={sector ? "IPOs in this sector" : "IPOs whose sector has not been entered yet"} />
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}
