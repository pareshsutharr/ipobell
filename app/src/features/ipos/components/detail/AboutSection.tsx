import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { KeyValueRow, Section, Text } from "@/components/ui";
import type { Ipo } from "@/features/ipos/types";
import { useTheme } from "@/lib/theme/ThemeProvider";

function BulletList({ items, icon, color }: { items: string[]; icon: "checkmark" | "alert"; color: string }) {
  return (
    <View style={{ gap: 12 }}>
      {items.map((t, i) => (
        <View key={i} style={styles.bullet}>
          <Ionicons name={icon} size={15} color={color} style={{ marginTop: 2, width: 16 }} />
          <Text variant="bodySm" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AboutSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const hasAbout = Boolean(ipo.about || ipo.description);
  const hasLists = ipo.strengths.length > 0 || ipo.risks.length > 0;
  const hasObjectives = ipo.objectives.length > 0 || Boolean(ipo.objectives_text);
  const hasPromoters = Boolean(ipo.promoters_text || ipo.pre_issue_holding || ipo.post_issue_holding);
  if (!hasAbout && !hasLists && !hasObjectives && !hasPromoters) return null;

  return (
    <View>
      {hasAbout ? (
        <Section title="About the company">
          {ipo.description ? (
            <Text variant="body" style={{ marginBottom: ipo.about ? 10 : 0 }}>
              {ipo.description}
            </Text>
          ) : null}
          {ipo.about ? (
            <>
              <Text variant="bodySm" color="textMuted" numberOfLines={expanded ? undefined : 6}>
                {ipo.about}
              </Text>
              {ipo.about.length > 320 ? (
                <Pressable onPress={() => setExpanded((e) => !e)} style={styles.more} accessibilityRole="button">
                  <Text variant="label" color="brand">
                    {expanded ? "Show less" : "Read more"}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {ipo.strengths.length ? (
        <Section title="Strengths">
          <BulletList items={ipo.strengths} icon="checkmark" color={colors.gain} />
        </Section>
      ) : null}

      {ipo.risks.length ? (
        <Section title="Risks">
          <BulletList items={ipo.risks} icon="alert" color={colors.loss} />
        </Section>
      ) : null}

      {hasObjectives ? (
        <Section title="Objects of the issue">
          {ipo.objectives.map((o, i) => (
            <View key={i} style={[styles.objective, i < ipo.objectives.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Text variant="caption" color="textFaint" numeric style={{ width: 18 }}>
                {i + 1}.
              </Text>
              <Text variant="bodySm" style={{ flex: 1 }}>
                {o.object}
              </Text>
              {o.amount ? (
                <Text variant="numSm" color="textMuted" numeric>
                  {o.amount}
                </Text>
              ) : null}
            </View>
          ))}
          {ipo.objectives_text ? (
            <Text variant="bodySm" color="textMuted" style={{ marginTop: ipo.objectives.length ? 10 : 0 }}>
              {ipo.objectives_text}
            </Text>
          ) : null}
        </Section>
      ) : null}

      {hasPromoters ? (
        <Section title="Promoters & holding">
          {ipo.promoters_text ? (
            <Text variant="bodySm" style={{ marginBottom: 6 }}>
              {ipo.promoters_text}
            </Text>
          ) : null}
          {ipo.pre_issue_holding ? <KeyValueRow label="Pre-issue promoter holding" value={ipo.pre_issue_holding} /> : null}
          {ipo.post_issue_holding ? <KeyValueRow label="Post-issue promoter holding" value={ipo.post_issue_holding} last /> : null}
          {ipo.holding_pattern_desc ? (
            <Text variant="caption" color="textFaint" style={{ marginTop: 8 }}>
              {ipo.holding_pattern_desc}
            </Text>
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  more: { marginTop: 8, alignSelf: "flex-start" },
  objective: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingVertical: 10 },
});
