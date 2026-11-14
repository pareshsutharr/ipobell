// IPO list row — flat, divider-separated (Groww-style). Name kept as IpoCard for existing imports.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { PressableScale } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { useInsightMarker } from "@/features/insights/hooks";
import { verdictMeta } from "@/features/insights/verdict";
import { boardLabel, CompanyLogo, GainText, GmpChip, statusLabel, statusTone } from "@/features/ipos/components/IpoBits";
import { useIpoState } from "@/features/ipos/hooks";
import { usePerspective } from "@/features/perspective/store";
import { retailMinimumAmount } from "@/features/ipos/lots";
import type { IpoListItem } from "@/features/ipos/types";
import { useIsWatched, useToggleWatchlist, WatchlistLimitError } from "@/features/watchlist/hooks";
import { dateRange, dateShort, inr, times } from "@/lib/format";
import { useToneColors } from "@/components/ui/Chip";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface Props {
  ipo: IpoListItem;
  index?: number;
  onWatchlistLimit?: () => void;
}

function Meta({ label, value, color, align }: { label: string; value: string; color?: string; align?: "left" | "right" }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: align === "right" ? "flex-end" : "flex-start", flex: 1 }}>
      <Text variant="caption" color="textFaint">
        {label}
      </Text>
      <Text variant="numSm" color={color ?? colors.text} numeric numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
    </View>
  );
}

export const IpoCard = memo(function IpoCard({ ipo, onWatchlistLimit }: Props) {
  const { colors, spacing } = useTheme();
  const watched = useIsWatched(ipo.id);
  const { toggle } = useToggleWatchlist();
  const status = useToneColors(statusTone(ipo.status));
  const business = usePerspective((s) => s.perspective) === "business";
  const marker = useInsightMarker(business ? ipo.id : undefined);
  const markerTone = useToneColors(marker ? verdictMeta(marker.verdict).tone : "neutral");
  // Rows from the state-wise list carry their state; other lists look it up from the shared map.
  const lookedUp = useIpoState(ipo.id);
  const state = (ipo as { state?: string | null }).state ?? lookedUp;

  const onStar = () => {
    track("watchlist", { action: watched ? "remove" : "add", slug: ipo.slug, name: ipo.display_name ?? ipo.name });
    toggle(ipo.id, watched).catch((e) => {
      if (e instanceof WatchlistLimitError) onWatchlistLimit?.();
    });
  };

  const dates =
    ipo.status === "listed"
      ? `Listed ${dateShort(ipo.listing_date)}`
      : ipo.status === "closed"
        ? `Allotment ${dateShort(ipo.allotment_date)} · Listing ${dateShort(ipo.listing_date)}`
        : ipo.dates_tba
          ? "Dates to be announced"
          : dateRange(ipo.open_date, ipo.close_date);

  return (
    <PressableScale
      onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: ipo.slug } })}
      accessibilityRole="button"
      accessibilityLabel={`${ipo.name} IPO`}
      style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}
    >
      <View style={styles.top}>
        <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" numberOfLines={1}>
            {ipo.display_name ?? ipo.name}
          </Text>
          <View style={styles.sub}>
            {marker ? (
              <View style={[styles.marker, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="reader-outline" size={10} color={colors.brand} />
                <Text variant="caption" color="brand" weight="bold" style={{ fontSize: 10, lineHeight: 12 }}>
                  INSIGHT
                </Text>
              </View>
            ) : null}
            <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {boardLabel(ipo.board, ipo.sub_type)}
              {state ? ` · ${state}` : ""} · {dates}
            </Text>
          </View>
        </View>
        <PressableScale onPress={onStar} hitSlop={12} scaleTo={0.85} accessibilityRole="button" accessibilityLabel={watched ? "Remove from watchlist" : "Add to watchlist"} style={styles.star}>
          <Ionicons name={watched ? "star" : "star-outline"} size={20} color={watched ? colors.primary : colors.textFaint} />
        </PressableScale>
      </View>

      <View style={styles.metrics}>
        {ipo.status === "listed" ? (
          <>
            <Meta label="Issue price" value={inr(ipo.issue_price)} />
            <Meta label="Listed at" value={inr(ipo.listing_price)} />
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text variant="caption" color="textFaint">
                Listing gain
              </Text>
              <GainText value={ipo.listing_gain_percent} variant="numSm" />
            </View>
          </>
        ) : (
          <>
            <Meta label="Price band" value={ipo.price_band ? `₹${ipo.price_band}` : "—"} />
            <Meta label="Min. invest" value={inr(retailMinimumAmount(ipo))} />
            <Meta label="Lot" value={ipo.lot_size ? `${ipo.lot_size} sh` : "—"} align="right" />
          </>
        )}
      </View>

      {marker?.headline ? (
        <View style={[styles.insightLine, { borderLeftColor: markerTone.fg }]}>
          <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1, fontStyle: "italic" }}>
            {marker.headline}
          </Text>
        </View>
      ) : null}

      <View style={styles.bottom}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <View style={[styles.dot, { backgroundColor: status.fg }]} />
          <Text variant="caption" color={status.fg} numberOfLines={1} style={{ flexShrink: 1 }}>
            {statusLabel(ipo)}
            {ipo.status !== "upcoming" && ipo.status !== "listed" && ipo.sub_total !== null ? (
              <Text variant="caption" color="textMuted" numeric>
                {"  ·  "}
                {times(ipo.sub_total)} subscribed
              </Text>
            ) : null}
          </Text>
        </View>
        {ipo.status === "listed" ? (
          ipo.cmp !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text variant="caption" color="textMuted" numeric>
                CMP {inr(ipo.cmp)}
              </Text>
              <GainText value={ipo.current_gain_percent} variant="numSm" />
            </View>
          ) : null
        ) : (
          <GmpChip gmp={ipo.gmp} gmpPercent={ipo.gmp_percent} size="sm" />
        )}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  sub: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  star: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  metrics: { flexDirection: "row", gap: 12, marginTop: 12, paddingLeft: 54 },
  bottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, paddingLeft: 54 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  marker: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, height: 16, borderRadius: 4 },
  insightLine: { marginTop: 10, marginLeft: 54, paddingLeft: 8, borderLeftWidth: 2 },
});
