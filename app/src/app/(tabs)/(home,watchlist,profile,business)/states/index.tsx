// IPOs by state: every state with at least one IPO, by the company's registered office.
// State is entered by the Be IPO Ready team; IPOs without one are grouped under "Not specified".
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { Disclaimer, EmptyState, ErrorState, FilterChip, ListSkeleton, PressableScale, Screen, Text } from "@/components/ui";
import { useStateCounts } from "@/features/ipos/hooks";
import { isNotSetUpError, NOT_SPECIFIED, splitStateCounts, stateToParam, statusBreakdown, type StateCount } from "@/features/ipos/states";
import type { Board } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function StatesScreen() {
  const { colors, spacing } = useTheme();
  const [board, setBoard] = useState<Board | null>(null);
  const counts = useStateCounts(board);
  const { states, notSpecified, totalIpos, withState } = splitStateCounts(counts.data);
  const max = states[0]?.total ?? 1;

  const open = (state: string | null) => router.push({ pathname: "/states/[state]", params: { state: stateToParam(state) } });

  const renderItem = ({ item }: { item: StateCount }) => (
    <PressableScale onPress={() => open(item.state)} accessibilityRole="button" accessibilityLabel={`${item.state}, ${item.total} IPOs`} style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHead}>
          <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>
            {item.state}
          </Text>
          <Text variant="numMd" numeric>
            {item.total}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(4, Math.round((item.total / max) * 100))}%` }]} />
        </View>
        <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
          {statusBreakdown(item)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </PressableScale>
  );

  const Header = (
    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.md }}>
      <View style={styles.chips}>
        <FilterChip label="All" selected={board === null} onPress={() => setBoard(null)} />
        <FilterChip label="SME" selected={board === "sme"} onPress={() => setBoard("sme")} />
        <FilterChip label="Mainboard" selected={board === "mainboard"} onPress={() => setBoard("mainboard")} />
      </View>
      {totalIpos > 0 ? (
        <Text variant="caption" color="textMuted">
          {`${withState} of ${totalIpos} IPOs have a state so far. The state is the company's registered office, entered by our team.`}
        </Text>
      ) : null}
    </View>
  );

  const Footer = (
    <View style={{ paddingBottom: 32 }}>
      {notSpecified ? (
        <PressableScale onPress={() => open(null)} accessibilityRole="button" accessibilityLabel={`${NOT_SPECIFIED}, ${notSpecified.total} IPOs`} style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.rowHead}>
              <Text variant="title" color="textMuted" style={{ flex: 1 }}>
                {NOT_SPECIFIED}
              </Text>
              <Text variant="numMd" color="textMuted" numeric>
                {notSpecified.total}
              </Text>
            </View>
            <Text variant="caption" color="textFaint" style={{ marginTop: 4 }}>
              State not entered yet
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </PressableScale>
      ) : null}
      <Disclaimer compact />
    </View>
  );

  let body: React.ReactNode;
  if (counts.isLoading && !counts.data) body = <ListSkeleton count={6} />;
  else if (counts.isError && !counts.data) {
    body = isNotSetUpError(counts.error) ? (
      <EmptyState icon="map-outline" title="State-wise view is being set up" message="This view will appear once our servers are updated. Please check back soon." />
    ) : (
      <ErrorState message={counts.error instanceof Error ? counts.error.message : undefined} onRetry={() => counts.refetch()} />
    );
  } else {
    body = (
      <FlatList
        data={states}
        renderItem={renderItem}
        keyExtractor={(item) => item.state ?? "none"}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={
          <EmptyState icon="map-outline" title="No states entered yet" message={notSpecified ? `Our team is adding the state for each IPO. ${notSpecified.total} IPOs are waiting.` : "No IPOs match this filter."} compact />
        }
        refreshControl={<RefreshControl refreshing={counts.isRefetching} onRefresh={() => void counts.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <Screen>
      <PageHeader title="IPOs by state" subtitle="Where the companies are based" />
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  track: { height: 4, borderRadius: 2, marginTop: 8, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2 },
});
