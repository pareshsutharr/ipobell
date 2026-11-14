// Small presentational atoms shared by rows, lists and the detail screen (flat / minimal).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Text } from "@/components/ui/Text";
import type { Board, IpoListItem, IpoStatus } from "@/features/ipos/types";
import { daysUntil, initials, inr, pct, times } from "@/lib/format";
import { useSignedColor, useTheme } from "@/lib/theme/ThemeProvider";

export function statusTone(status: IpoStatus): ChipTone {
  switch (status) {
    case "open":
      return "gain";
    case "upcoming":
      return "info";
    case "closed":
      return "warning";
    case "listed":
      return "neutral";
  }
}

export function statusLabel(ipo: Pick<IpoListItem, "status" | "close_date" | "open_date" | "listing_date" | "dates_tba">): string {
  switch (ipo.status) {
    case "open": {
      const d = daysUntil(ipo.close_date);
      if (d === 0) return "Closes today";
      if (d === 1) return "Closes tomorrow";
      return "Open";
    }
    case "upcoming": {
      if (ipo.dates_tba) return "Dates TBA";
      const d = daysUntil(ipo.open_date);
      if (d === 0) return "Opens today";
      if (d === 1) return "Opens tomorrow";
      return "Upcoming";
    }
    case "closed": {
      const d = daysUntil(ipo.listing_date);
      if (d === 0) return "Lists today";
      return "Closed";
    }
    case "listed":
      return "Listed";
  }
}

/** Coloured dot + short status text. */
export function StatusBadge({ ipo, size = "md" }: { ipo: Pick<IpoListItem, "status" | "close_date" | "open_date" | "listing_date" | "dates_tba">; size?: "sm" | "md" }) {
  return <Chip label={statusLabel(ipo)} tone={statusTone(ipo.status)} dot size={size} />;
}

export function boardLabel(board: Board, subType?: string | null): string {
  if (board !== "sme") return "Mainboard";
  if (subType && /nse/i.test(subType)) return "NSE SME";
  if (subType && /bse/i.test(subType)) return "BSE SME";
  return "SME";
}

/** Plain grey board text (no pill). */
export function BoardTag({ board, subType, size = "sm" }: { board: Board; subType?: string | null; size?: "sm" | "md" }) {
  return (
    <Text variant={size === "sm" ? "caption" : "label"} color="textMuted">
      {boardLabel(board, subType)}
    </Text>
  );
}

export function CompanyLogo({ uri, name, size = 44 }: { uri: string | null | undefined; name: string; size?: number }) {
  const { colors } = useTheme();
  const r = Math.round(size * 0.22);
  return (
    <View style={[styles.logoWrap, { width: size, height: size, borderRadius: r, backgroundColor: colors.surface, borderColor: colors.border }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size - 8, height: size - 8 }} contentFit="contain" transition={150} cachePolicy="memory-disk" accessibilityLabel={`${name} logo`} />
      ) : (
        <Text variant="label" color="textMuted" weight="semibold">
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/** GMP as plain coloured text: "GMP ₹36 (2.2%)". */
export function GmpChip({ gmp, gmpPercent, size = "md" }: { gmp: number | null; gmpPercent: number | null; size?: "sm" | "md" }) {
  const { colors } = useTheme();
  if (gmp === null) {
    return (
      <Text variant={size === "sm" ? "caption" : "numSm"} color="textFaint">
        GMP —
      </Text>
    );
  }
  const color = gmp > 0 ? colors.gain : gmp < 0 ? colors.loss : colors.textMuted;
  return (
    <Text variant={size === "sm" ? "caption" : "numSm"} color={color} numeric>
      GMP {inr(gmp)}
      {gmpPercent !== null ? ` (${pct(gmpPercent, { sign: false, decimals: 1 })})` : ""}
    </Text>
  );
}

/** Signed percentage with a small triangle. */
export function GainText({ value, variant = "numMd", prefix }: { value: number | null; variant?: "numSm" | "numMd" | "numLg"; prefix?: string }) {
  const color = useSignedColor()(value);
  if (value === null) {
    return (
      <Text variant={variant} color="textFaint">
        —
      </Text>
    );
  }
  return (
    <View style={styles.gainRow}>
      {prefix ? (
        <Text variant="caption" color="textFaint">
          {prefix}
        </Text>
      ) : null}
      <Ionicons name={value > 0 ? "caret-up" : value < 0 ? "caret-down" : "remove"} size={variant === "numLg" ? 14 : 11} color={color} />
      <Text variant={variant} color={color} numeric>
        {pct(Math.abs(value), { sign: false })}
      </Text>
    </View>
  );
}

/** Thin subscription bar with a 1x marker. */
export function SubscriptionMeter({ total, retail, nii, qib, compact }: { total: number | null; retail?: number | null; nii?: number | null; qib?: number | null; compact?: boolean }) {
  const { colors } = useTheme();
  if (total === null) return null;
  const cap = total <= 1 ? 1 : total <= 10 ? 10 : total <= 50 ? 50 : 200;
  const w = Math.max(2, Math.min(100, (total / cap) * 100));
  const color = total >= 1 ? colors.gain : colors.textMuted;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.meterRow}>
        <Text variant="caption" color="textMuted">
          Subscribed
        </Text>
        <Text variant="numSm" color={color} numeric>
          {times(total)}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.fill, { width: `${w}%`, backgroundColor: color }]} />
        {cap > 1 ? <View style={[styles.marker, { left: `${(1 / cap) * 100}%`, backgroundColor: colors.textFaint }]} /> : null}
      </View>
      {!compact && (retail !== undefined || nii !== undefined || qib !== undefined) ? (
        <View style={styles.breakdown}>
          {[
            ["Retail", retail],
            ["NII", nii],
            ["QIB", qib],
          ].map(([label, v]) => (
            <View key={label as string} style={styles.breakdownItem}>
              <Text variant="caption" color="textFaint">
                {label as string}
              </Text>
              <Text variant="numSm" color={typeof v === "number" && v >= 1 ? colors.text : colors.textMuted} numeric>
                {times(v as number | null)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  logoWrap: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  gainRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  meterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  track: { height: 4, borderRadius: 2, overflow: "hidden", position: "relative" },
  fill: { height: 4, borderRadius: 2 },
  marker: { position: "absolute", top: 0, bottom: 0, width: 2, borderRadius: 1, opacity: 0.6 },
  breakdown: { flexDirection: "row", gap: 16, marginTop: 2 },
  breakdownItem: { flexDirection: "row", alignItems: "center", gap: 5 },
});
