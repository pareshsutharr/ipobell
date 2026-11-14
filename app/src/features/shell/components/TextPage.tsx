import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { PressableScale, Screen, Text } from "@/components/ui";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { openExternal } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

export interface TextBlock {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface Props {
  title: string;
  subtitle?: string;
  blocks: TextBlock[];
  links?: { label: string; url: string }[];
  children?: React.ReactNode;
}

/** Long-form legal / about page. */
export function TextPage({ title, subtitle, blocks, links, children }: Props) {
  const { spacing, colors } = useTheme();
  return (
    <Screen>
      <PageHeader title={title} subtitle={subtitle} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }}>
        {children}
        {blocks.map((b, i) => (
          <View key={i} style={{ gap: 8 }}>
            {b.heading ? <Text variant="h3">{b.heading}</Text> : null}
            {b.paragraphs?.map((p, j) => (
              <Text key={j} variant="body" color="textMuted">
                {p}
              </Text>
            ))}
            {b.bullets?.map((p, j) => (
              <View key={j} style={styles.bullet}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <Text variant="body" color="textMuted" style={{ flex: 1 }}>
                  {p}
                </Text>
              </View>
            ))}
          </View>
        ))}
        {links?.length ? (
          <View style={{ gap: 8 }}>
            {links.map((l) => (
              <PressableScale key={l.url} onPress={() => openExternal(l.url, l.label)} accessibilityRole="link">
                <Text variant="label" color="primary">
                  {l.label} ↗
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
});
