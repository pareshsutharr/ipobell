// IPOs by sector: how many IPOs each sector has and how its listed IPOs did.
// Sector is entered by the Be IPO Ready team; IPOs without one are grouped under "Not specified".
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Disclaimer, EmptyState, ErrorState, FilterChip, ListSkeleton, PressableScale, Screen, Text } from "@/components/ui";
import { useSectorStats } from "@/features/ipos/hooks";
import { sectorHitRate, sectorToParam, SMALL_SECTOR_SAMPLE, splitSectorStats, type SectorSort, type SectorStat } from "@/features/ipos/sectors";
import { isNotSetUpError, NOT_SPECIFIED, statusBreakdown } from "@/features/ipos/states";
import type { Board } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { pct, times } from "@/lib/format";
import { useSignedColor, useTheme } from "@/lib/theme/ThemeProvider";

const SORTS: { value: SectorSort; label: string }[] = [
  { value: "count", label: "Most IPOs" },
  { value: "gain", label: "Listing gain" },
  { value: "subscription", label: "Subscription" },
];

export default function SectorsScreen() {
  const { colors, spacing } = useTheme();
  const signed = useSignedColor();
  const [board, setBoard] = useState<Board | null>(null);
  const [sort, setSort] = useState<SectorSort>("count");
  const stats = useSectorStats(board);
  const { sectors, notSpecified, totalIpos, withSector } = splitSectorStats(stats.data, sort);

  const open = (sector: string | null) => router.push({ pathname: "/sectors/[sector]", params: { sector: sectorToParam(sector) } });

  const renderItem = ({ item }: { item: SectorStat }) => {
    const hit = sectorHitRate(item);
    const small = item.listedWithPrice > 0 && item.listedWithPrice < SMALL_SECTOR_SAMPLE;
    return (
      <PressableScale onPress={() => open(item.sector)} accessibilityRole="button" accessibilityLabel={`${item.sector}, ${item.total} IPOs`} style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowHead}>
            <Text variant="title" numberOfLines={1} style={{ flex: 1 }}>
              {item.sector}
            </Text>
            <Text variant="caption" color="textMuted" numeric>
              {item.total} {item.total === 1 ? "IPO" : "IPOs"}
            </Text>
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text variant="caption" color="textFaint">
                Avg listing gain
              </Text>
              <Text variant="numSm" numeric color={item.avgListingGain === null ? colors.textFaint : signed(item.avgListingGain)}>
                {pct(item.avgListingGain)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text variant="caption" color="textFaint">
                Listed above issue
              </Text>
              <Text variant="numSm" numeric color={hit === null ? colors.textFaint : colors.text}>
                {hit === null ? "—" : `${hit}%`}
              </Text>
            </View>
            <View style={[styles.metric, { alignItems: "flex-end" }]}>
              <Text variant="caption" color="textFaint">
                Avg subscription
              </Text>
              <Text variant="numSm" numeric color={item.avgSubscription === null ? colors.textFaint : colors.text}>
                {times(item.avgSubscription)}
              </Text>
            </View>
          </View>
          <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
            {statusBreakdown(item)}
            {small ? ` · only ${item.listedWithPrice} listed, read with care` : ""}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </PressableScale>
    );
  };

  const Header = (
    <View style={{ paddingBottom: spacing.sm, gap: spacing.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg }}>
        <FilterChip label="All" selected={board === null} onPress={() => setBoard(null)} />
        <FilterChip label="SME" selected={board === "sme"} onPress={() => setBoard("sme")} />
        <FilterChip label="Mainboard" selected={board === "mainboard"} onPress={() => setBoard("mainboard")} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg }}>
        {SORTS.map((s) => (
          <FilterChip key={s.value} label={s.label} icon={sort === s.value ? "swap-vertical-outline" : undefined} selected={sort === s.value} onPress={() => setSort(s.value)} />
        ))}
      </ScrollView>
      {totalIpos > 0 ? (
        <Text variant="caption" color="textMuted" style={{ paddingHorizontal: spacing.lg }}>
          {`${withSector} of ${totalIpos} IPOs have a sector so far, entered by our team. Averages cover only IPOs that have listed.`}
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
              <Text variant="caption" color="textMuted" numeric>
                {notSpecified.total} {notSpecified.total === 1 ? "IPO" : "IPOs"}
              </Text>
            </View>
            <Text variant="caption" color="textFaint" style={{ marginTop: 4 }}>
              Sector not entered yet
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </PressableScale>
      ) : null}
      <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, paddingTop: 14, lineHeight: 17 }}>
        Past listings in a sector say nothing certain about the next one.
      </Text>
      <Disclaimer compact />
    </View>
  );

  let body: React.ReactNode;
  if (stats.isLoading && !stats.data) body = <ListSkeleton count={5} />;
  else if (stats.isError && !stats.data) {
    body = isNotSetUpError(stats.error) ? (
      <EmptyState icon="pie-chart-outline" title="Sector view is being set up" message="This view will appear once our servers are updated. Please check back soon." />
    ) : (
      <ErrorState message={stats.error instanceof Error ? stats.error.message : undefined} onRetry={() => stats.refetch()} />
    );
  } else {
    body = (
      <FlatList
        data={sectors}
        renderItem={renderItem}
        keyExtractor={(item) => item.sector ?? "none"}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={<EmptyState icon="pie-chart-outline" title="No sectors entered yet" message={notSpecified ? `Our team is adding the sector for each IPO. ${notSpecified.total} IPOs are waiting.` : "No IPOs match this filter."} compact />}
        refreshControl={<RefreshControl refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <Screen>
      <PageHeader title="IPOs by sector" subtitle="Counts and listing results, sector by sector" />
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
  metrics: { flexDirection: "row", gap: 12, marginTop: 10 },
  metric: { flex: 1 },
});
