import React from "react";
import { StyleSheet, View } from "react-native";

import { Section, Stat, Text } from "@/components/ui";
import { useAnchors } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { crore, pct } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function AnchorsSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const { data } = useAnchors(ipo.anchor_total_count ? ipo.id : undefined);
  if (!ipo.anchor_total_count) return null;

  const rows = data ?? [];
  const visible = rows.slice(0, 15);
  const maxPct = Math.max(1, ...rows.map((r) => r.pct_allocated ?? 0));

  return (
    <Section title="Anchor investors" subtitle="Allotted a day before the issue opened">
      <View style={styles.summaries}>
        <View style={{ flex: 1 }}>
          <Stat label="Anchors" value={String(ipo.anchor_total_count)} />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Anchor book" value={crore(ipo.anchor_total_cr)} />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Mutual funds" value={ipo.anchor_mf_count !== null ? String(ipo.anchor_mf_count) : "—"} align="right" />
        </View>
      </View>
      {visible.length ? (
        <View style={{ marginTop: 8 }}>
          {visible.map((a, i) => (
            <View key={a.id} style={[styles.anchor, i < visible.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <View style={styles.rowTop}>
                <Text variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                  {a.name}
                </Text>
                <Text variant="numSm" numeric>
                  {crore(a.amount_cr)}
                </Text>
              </View>
              <View style={styles.rowBottom}>
                <Text variant="caption" color="textFaint" numberOfLines={1} style={{ flex: 1 }}>
                  {a.group_entity ?? ""}
                </Text>
                <Text variant="caption" color="textFaint" numeric>
                  {pct(a.pct_allocated, { sign: false, decimals: 1 })} of book
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
                <View style={[styles.fill, { width: `${Math.max(2, ((a.pct_allocated ?? 0) / maxPct) * 100)}%`, backgroundColor: colors.textFaint }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  summaries: { flexDirection: "row", gap: 12, marginBottom: 8 },
  anchor: { paddingVertical: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2, marginBottom: 6 },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
  lock: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
});
