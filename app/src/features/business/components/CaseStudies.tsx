// Case studies on the Get Listed tab: up to three cards, each opening the full story.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Card, PressableScale, Skeleton, Text } from "@/components/ui";
import { caseStudyMeta, useCaseStudies } from "@/features/business/caseStudies";
import { openExternal } from "@/lib/analytics";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";

const SHOWN = 3;

export function CaseStudies() {
  const { colors, radius } = useTheme();
  const { cases, loading } = useCaseStudies();
  if (loading) {
    return (
      <Card variant="alt" style={{ gap: 10 }}>
        <Skeleton width="30%" />
        <Skeleton width="60%" height={18} />
        <Skeleton />
      </Card>
    );
  }
  if (!cases.length) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Text variant="h3" style={{ flex: 1 }}>
          {cases.length === 1 ? "Case study" : "Case studies"}
        </Text>
        {cases.length > SHOWN ? (
          <PressableScale onPress={() => router.push("/business/case-studies")} accessibilityRole="button" hitSlop={8}>
            <Text variant="label" color="brand">
              See all {cases.length}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {cases.slice(0, SHOWN).map((c) => (
        <PressableScale key={c.id} onPress={() => router.push({ pathname: "/business/case-studies/[slug]", params: { slug: c.slug } })} accessibilityRole="button" accessibilityLabel={`Case study: ${c.title}`} scaleTo={0.99}>
          <Card variant="alt" padding={0} style={{ overflow: "hidden" }}>
            {c.heroImageUrl ? <Image source={{ uri: c.heroImageUrl }} style={[styles.hero, { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md }]} contentFit="cover" cachePolicy="memory-disk" /> : null}
            <View style={{ padding: 16, gap: 6 }}>
              {caseStudyMeta(c) ? (
                <Text variant="overline" color="textFaint">
                  {caseStudyMeta(c)}
                </Text>
              ) : null}
              <Text variant="h3">{c.title}</Text>
              <Text variant="bodySm" color="textMuted" numberOfLines={4}>
                {c.summary}
              </Text>
              <View style={styles.more}>
                <Text variant="label" color="brand">
                  Read the story
                </Text>
                <Ionicons name="arrow-forward" size={13} color={colors.brand} />
              </View>
            </View>
          </Card>
        </PressableScale>
      ))}
      <PressableScale onPress={() => openExternal(env.links.caseStudies, "Case studies")} accessibilityRole="link" style={styles.more}>
        <Text variant="label" color="textMuted">
          More on our website
        </Text>
        <Ionicons name="open-outline" size={13} color={colors.textMuted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center" },
  hero: { width: "100%", height: 140 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
});
