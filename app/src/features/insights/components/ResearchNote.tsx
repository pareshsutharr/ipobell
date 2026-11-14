// Investor view: a short card from the team's insight, with a one-tap switch to the full Business view.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Chip, PressableScale, Section, Text } from "@/components/ui";
import type { IpoInsight } from "@/features/insights/types";
import { imageUri } from "@/features/insights/hooks";
import { HOUSE_VIEW_DISCLAIMER, insightVitals, verdictMeta } from "@/features/insights/verdict";
import { usePerspective } from "@/features/perspective/store";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function ResearchNote({ insight }: { insight: IpoInsight }) {
  const { colors, radius } = useTheme();
  const setPerspective = usePerspective((s) => s.setPerspective);
  const verdict = verdictMeta(insight.verdict);
  const place = insightVitals(insight)[0]?.text;

  return (
    <Section title="Research note" subtitle="From the Be IPO Ready advisory team">
      <PressableScale onPress={() => setPerspective("business")} accessibilityRole="button" accessibilityLabel="Open the full business insight" style={[styles.card, { borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.surface }]}>
        {insight.hero_image_url ? <Image source={{ uri: imageUri(insight.hero_image_url, insight.updated_at) }} style={[styles.thumb, { borderRadius: radius.sm }]} contentFit="cover" cachePolicy="memory-disk" /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          {insight.headline ? (
            <Text variant="h3" numberOfLines={2}>
              {insight.headline}
            </Text>
          ) : null}
          {insight.summary ? (
            <Text variant="bodySm" color="textMuted" numberOfLines={3}>
              {insight.summary}
            </Text>
          ) : null}
          <View style={styles.meta}>
            {insight.verdict ? <Chip label={verdict.label} tone={verdict.tone} icon={verdict.icon} size="sm" variant="soft" /> : null}
            {place ? (
              <Text variant="caption" color="textFaint" numberOfLines={1}>
                {place}
              </Text>
            ) : null}
          </View>
          {insight.verdict ? (
            <Text variant="caption" color="textFaint">
              {HOUSE_VIEW_DISCLAIMER}
            </Text>
          ) : null}
          <View style={styles.link}>
            <Text variant="label" color="brand">
              Read the full story in Business view
            </Text>
            <Ionicons name="arrow-forward" size={14} color={colors.brand} />
          </View>
        </View>
      </PressableScale>
    </Section>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 76, height: 76 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  link: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
});
