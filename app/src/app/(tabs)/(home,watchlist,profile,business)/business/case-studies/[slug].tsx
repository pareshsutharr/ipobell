// One case study: image, facts, the story, and a way to talk to the team.
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, EmptyState, ListSkeleton, Screen, Text } from "@/components/ui";
import { caseStudyMeta, caseStudyParagraphs, useCaseStudies } from "@/features/business/caseStudies";
import { LeadForm } from "@/features/business/components/LeadForm";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function CaseStudyScreen() {
  const { spacing, colors } = useTheme();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { cases, loading } = useCaseStudies();
  const c = cases.find((x) => x.slug === slug);
  useEffect(() => {
    if (c) track("case_study_view", { slug: c.slug, title: c.title });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id]);

  if (loading) {
    return (
      <Screen>
        <PageHeader title="Case study" />
        <ListSkeleton count={3} />
      </Screen>
    );
  }
  if (!c) {
    return (
      <Screen>
        <PageHeader title="Case study" />
        <EmptyState icon="book-outline" title="This case study is not available" message="It may have been taken down. See the others." actionLabel="All case studies" onAction={() => router.replace("/business/case-studies")} />
      </Screen>
    );
  }

  const paragraphs = caseStudyParagraphs(c.body);
  return (
    <Screen>
      <PageHeader title={c.title} subtitle={caseStudyMeta(c) || undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
        {c.heroImageUrl ? <Image source={{ uri: c.heroImageUrl }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" /> : null}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.lg }}>
          <Text variant="body" style={{ lineHeight: 24 }}>
            {c.summary}
          </Text>

          {c.highlights.length ? (
            <Card padding={0}>
              <View style={styles.grid}>
                {c.highlights.map((h, i) => (
                  <View key={`${h.label}-${i}`} style={[styles.cell, { borderColor: colors.border }]}>
                    <Text variant="caption" color="textFaint">
                      {h.label}
                    </Text>
                    <Text variant="title" style={{ marginTop: 2 }}>
                      {h.value}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {paragraphs.map((p, i) => (
            <Text key={i} variant="body" color="textMuted" style={{ lineHeight: 24 }}>
              {p}
            </Text>
          ))}

          <Button title="Check your own IPO readiness" icon="speedometer-outline" variant="dark" onPress={() => router.push("/business/readiness")} fullWidth />

          <LeadForm
            source="business-hub"
            title="Could this be your company?"
            subtitle="Tell us where the business is today and an advisor will walk you through what listing would take."
            cta="Request a call"
            message={`Read the case study: ${c.title}.`}
            payload={{ "Case study read": c.title }}
            showMessage
          />
          <Text variant="caption" color="textFaint" style={{ lineHeight: 17 }}>
            A case study describes what happened to one company. It is not a forecast for any other company and not investment advice.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { width: "100%", height: 200 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
