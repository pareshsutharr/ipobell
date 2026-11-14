// All published case studies.
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";

import { Card, EmptyState, ListSkeleton, PressableScale, Screen, Text } from "@/components/ui";
import { caseStudyMeta, useCaseStudies } from "@/features/business/caseStudies";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function CaseStudiesScreen() {
  const { spacing } = useTheme();
  const { cases, loading } = useCaseStudies();
  return (
    <Screen>
      <PageHeader title="Case studies" subtitle="Companies that listed, and what changed" />
      {loading ? (
        <ListSkeleton count={4} />
      ) : cases.length === 0 ? (
        <EmptyState icon="book-outline" title="No case studies yet" message="Our team is writing them. Check back soon." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md }} showsVerticalScrollIndicator={false}>
          {cases.map((c) => (
            <PressableScale key={c.id} onPress={() => router.push({ pathname: "/business/case-studies/[slug]", params: { slug: c.slug } })} accessibilityRole="button" accessibilityLabel={`Case study: ${c.title}`} scaleTo={0.99}>
              <Card variant="alt" padding={0} style={{ overflow: "hidden" }}>
                {c.heroImageUrl ? <Image source={{ uri: c.heroImageUrl }} style={{ width: "100%", height: 140 }} contentFit="cover" cachePolicy="memory-disk" /> : null}
                <View style={{ padding: 16, gap: 6 }}>
                  {caseStudyMeta(c) ? (
                    <Text variant="overline" color="textFaint">
                      {caseStudyMeta(c)}
                    </Text>
                  ) : null}
                  <Text variant="h3">{c.title}</Text>
                  <Text variant="bodySm" color="textMuted" numberOfLines={3}>
                    {c.summary}
                  </Text>
                </View>
              </Card>
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
