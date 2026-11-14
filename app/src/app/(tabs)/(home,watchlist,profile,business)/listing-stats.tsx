// Listing statistics: how IPOs that have already listed performed, SME against Mainboard.
// Numbers come from the `get_listing_stats` database function (one call per board).
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Card, Disclaimer, EmptyState, ErrorState, FilterChip, KeyValueRow, PressableScale, Screen, Section, Skeleton, Stat, Text } from "@/components/ui";
import { CompanyLogo, GainText } from "@/features/ipos/components/IpoBits";
import { useListed, useListingStats } from "@/features/ipos/hooks";
import { periodLabel, STAT_PERIODS, summarise } from "@/features/ipos/stats";
import type { Board, ListingStats } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { crore, dateShort, pct } from "@/lib/format";
import { useSignedColor, useTheme } from "@/lib/theme/ThemeProvider";

const RECENT_SHOWN = 25;

function BoardCard({ title, tone, stats, loading }: { title: string; tone: string; stats: ListingStats | undefined; loading: boolean }) {
  const signed = useSignedColor();
  const s = summarise(stats);
  return (
    <Card style={{ flex: 1 }}>
      <View style={styles.boardHead}>
        <View style={[styles.dot, { backgroundColor: tone }]} />
        <Text variant="title">{title}</Text>
      </View>
      {loading ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="85%" />
          <Skeleton width="70%" />
        </View>
      ) : s.count === 0 ? (
        <Text variant="bodySm" color="textMuted" style={{ marginTop: 12 }}>
          No listings in this period.
        </Text>
      ) : (
        <View style={{ marginTop: 12, gap: 12 }}>
          <Stat label="Average listing gain" value={pct(s.avgListingGain)} valueColor={signed(s.avgListingGain)} />
          <Stat label="Listed above issue price" value={s.hitRate === null ? "—" : `${s.hitRate}%`} sub={`${stats?.positive_count ?? 0} of ${s.count}`} />
          <Stat label="Typical (median) gain" value={pct(s.medianListingGain)} valueColor={signed(s.medianListingGain)} />
          {s.smallSample ? (
            <Text variant="caption" color="textFaint">
              Only {s.count} {s.count === 1 ? "listing" : "listings"}: read with care.
            </Text>
          ) : null}
        </View>
      )}
    </Card>
  );
}

export default function ListingStatsScreen() {
  const { colors, spacing } = useTheme();
  const signed = useSignedColor();
  const [months, setMonths] = useState<number>(12);
  const [board, setBoard] = useState<Board | null>(null);

  const all = useListingStats(null, months);
  const sme = useListingStats("sme", months);
  const main = useListingStats("mainboard", months);
  const listed = useListed(board, months);

  const refreshing = all.isRefetching || sme.isRefetching || main.isRefetching || listed.isRefetching;
  const onRefresh = useCallback(() => {
    void Promise.all([all.refetch(), sme.refetch(), main.refetch(), listed.refetch()]);
  }, [all, sme, main, listed]);

  const total = summarise(all.data);
  const openIpo = (slug: string) => router.push({ pathname: "/ipo/[slug]", params: { slug } });

  return (
    <Screen>
      <PageHeader title="Listing statistics" subtitle="How IPOs performed once they listed" />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
          {STAT_PERIODS.map((p) => (
            <FilterChip key={p.months} label={p.label} selected={months === p.months} onPress={() => setMonths(p.months)} />
          ))}
        </ScrollView>

        {all.isError && !all.data ? (
          <ErrorState message={all.error instanceof Error ? all.error.message : undefined} onRetry={onRefresh} />
        ) : (
          <>
            <View style={{ paddingHorizontal: spacing.lg }}>
              <Card variant="alt">
                <Text variant="overline" color="textFaint">
                  All IPOs · {periodLabel(months)}
                </Text>
                {all.isLoading && !all.data ? (
                  <View style={{ gap: 10, marginTop: 12 }}>
                    <Skeleton width="45%" height={28} />
                    <Skeleton width="80%" />
                  </View>
                ) : total.count === 0 ? (
                  <Text variant="bodySm" color="textMuted" style={{ marginTop: 10 }}>
                    No IPOs listed in this period.
                  </Text>
                ) : (
                  <>
                    <View style={styles.headline}>
                      <View style={{ flex: 1 }}>
                        <Stat label="Average listing gain" value={pct(total.avgListingGain)} valueColor={signed(total.avgListingGain)} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Stat label="Listed above issue price" value={total.hitRate === null ? "—" : `${total.hitRate}%`} align="right" />
                      </View>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <KeyValueRow label="IPOs listed" value={String(total.count)} />
                      <KeyValueRow label="Above / below / at issue price" value={`${all.data?.positive_count ?? 0} / ${all.data?.negative_count ?? 0} / ${all.data?.flat_count ?? 0}`} />
                      <KeyValueRow label="Typical (median) listing gain" value={pct(total.medianListingGain)} valueColor={signed(total.medianListingGain)} />
                      <KeyValueRow label="Average gain at today's price" value={pct(total.avgCurrentGain)} valueColor={signed(total.avgCurrentGain)} />
                      <KeyValueRow label="Money raised" value={crore(total.totalRaisedCr)} last />
                    </View>
                  </>
                )}
              </Card>
            </View>

            <View style={[styles.boards, { paddingHorizontal: spacing.lg, marginTop: spacing.md }]}>
              <BoardCard title="SME" tone={colors.sme} stats={sme.data} loading={sme.isLoading && !sme.data} />
              <BoardCard title="Mainboard" tone={colors.primary} stats={main.data} loading={main.isLoading && !main.data} />
            </View>

            {all.data?.best || all.data?.worst ? (
              <Section title="Best and worst listing" subtitle={`In ${periodLabel(months)}`}>
                {[all.data?.best, all.data?.worst].map((x, i) =>
                  x ? (
                    <PressableScale key={`${i}-${x.slug}`} onPress={() => openIpo(x.slug)} accessibilityRole="button" style={[styles.row, i === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <Ionicons name={i === 0 ? "trending-up-outline" : "trending-down-outline"} size={18} color={signed(x.gain)} />
                      <Text variant="bodySm" style={{ flex: 1 }} numberOfLines={1}>
                        {x.name}
                      </Text>
                      <GainText value={x.gain} variant="numSm" />
                    </PressableScale>
                  ) : null,
                )}
              </Section>
            ) : null}

            <Section title="Listings in this period" subtitle="Listing-day gain, then gain at today's price">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
                <FilterChip label="All" selected={board === null} onPress={() => setBoard(null)} />
                <FilterChip label="SME" selected={board === "sme"} onPress={() => setBoard("sme")} />
                <FilterChip label="Mainboard" selected={board === "mainboard"} onPress={() => setBoard("mainboard")} />
              </ScrollView>
              {listed.isLoading && !listed.data ? (
                <View style={{ gap: 14, paddingVertical: 8 }}>
                  <Skeleton />
                  <Skeleton />
                  <Skeleton />
                </View>
              ) : listed.isError && !listed.data ? (
                <ErrorState onRetry={() => listed.refetch()} />
              ) : (listed.data ?? []).length === 0 ? (
                <EmptyState compact icon="stats-chart-outline" title="No listings in this period" message="Try a longer period." />
              ) : (
                <>
                  {(listed.data ?? []).slice(0, RECENT_SHOWN).map((ipo, i, arr) => (
                    <PressableScale key={ipo.id} onPress={() => openIpo(ipo.slug)} accessibilityRole="button" style={[styles.row, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={32} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodySm" numberOfLines={1}>
                          {ipo.display_name ?? ipo.name}
                        </Text>
                        <Text variant="caption" color="textFaint" numberOfLines={1}>
                          {ipo.board === "sme" ? "SME" : "Mainboard"} · listed {dateShort(ipo.listing_date)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <GainText value={ipo.listing_gain_percent} variant="numSm" />
                        <Text variant="caption" color="textFaint" numeric>
                          now {pct(ipo.current_gain_percent)}
                        </Text>
                      </View>
                    </PressableScale>
                  ))}
                  {(listed.data ?? []).length > RECENT_SHOWN ? (
                    <Text variant="caption" color="textFaint" style={{ marginTop: 10 }}>
                      Showing the {RECENT_SHOWN} most recent of {(listed.data ?? []).length}. The averages above use every listing in the period.
                    </Text>
                  ) : null}
                </>
              )}
            </Section>

            <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, paddingTop: 16, lineHeight: 17 }}>
              Listing gain compares the listing price with the issue price. Past listings say nothing certain about future ones.
            </Text>
            <Disclaimer compact />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: "row", gap: 12, marginTop: 12 },
  boards: { flexDirection: "row", gap: 12 },
  boardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
});
