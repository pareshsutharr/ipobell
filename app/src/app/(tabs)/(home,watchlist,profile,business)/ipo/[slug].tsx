import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";

import { ErrorState, Screen } from "@/components/ui";
import { InsightEmpty, InsightSection } from "@/features/insights/components/InsightSection";
import { ResearchNote } from "@/features/insights/components/ResearchNote";
import { useInsight } from "@/features/insights/hooks";
import { usePerspective } from "@/features/perspective/store";
import { AboutSection } from "@/features/ipos/components/detail/AboutSection";
import { ActionBar } from "@/features/ipos/components/detail/ActionBar";
import { AnchorsSection } from "@/features/ipos/components/detail/AnchorsSection";
import { DetailHeader } from "@/features/ipos/components/detail/DetailHeader";
import { DetailSkeleton } from "@/features/ipos/components/detail/DetailSkeleton";
import { DocumentsSection } from "@/features/ipos/components/detail/DocumentsSection";
import { DrhpSummarySection } from "@/features/ipos/components/detail/DrhpSummarySection";
import { FinancialsSection } from "@/features/ipos/components/detail/FinancialsSection";
import { GmpChartSection } from "@/features/ipos/components/detail/GmpChartSection";
import { GrowthSection } from "@/features/ipos/components/detail/GrowthSection";
import { HeroCard, IssueDetailsSection } from "@/features/ipos/components/detail/HeroCard";
import { IntermediariesSection } from "@/features/ipos/components/detail/IntermediariesSection";
import { ListingSection } from "@/features/ipos/components/detail/ListingSection";
import { LotCalculatorSection } from "@/features/ipos/components/detail/LotCalculatorSection";
import { SubscriptionSection } from "@/features/ipos/components/detail/SubscriptionSection";
import { TimelineSection } from "@/features/ipos/components/detail/TimelineSection";
import { useIpo, useIpoRealtime } from "@/features/ipos/hooks";
import { track } from "@/lib/analytics";
import { errorMessage } from "@/lib/supabase";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function IpoDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors } = useTheme();
  const { data: ipo, isLoading, isError, error, refetch } = useIpo(slug);
  const [refreshing, setRefreshing] = useState(false);
  useIpoRealtime(ipo?.id, slug);
  const business = usePerspective((s) => s.perspective) === "business";
  const insight = useInsight(ipo?.id);
  useEffect(() => {
    if (ipo) track("ipo_view", { slug: ipo.slug, name: ipo.display_name ?? ipo.name, board: ipo.board, status: ipo.status, ipo_id: ipo.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipo?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), insight.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, insight]);

  const showSubscription = Boolean(ipo && ipo.status !== "upcoming" && ipo.sub_total !== null);

  return (
    <Screen>
      <DetailHeader ipo={ipo} title={ipo?.display_name ?? ipo?.name} />
      {isLoading && !ipo ? (
        <DetailSkeleton />
      ) : isError || !ipo ? (
        <ErrorState message={error ? errorMessage(error) : undefined} onRetry={() => refetch()} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} colors={[colors.text]} />}
            showsVerticalScrollIndicator={false}
          >
            <HeroCard ipo={ipo} />
            {business ? insight.data ? <InsightSection insight={insight.data} ipo={ipo} /> : insight.isLoading ? null : <InsightEmpty ipo={ipo} /> : null}
            {business ? <GrowthSection ipo={ipo} /> : null}
            <TimelineSection ipo={ipo} />
            <DrhpSummarySection ipo={ipo} />
            {showSubscription ? <SubscriptionSection ipo={ipo} /> : null}
            <ListingSection ipo={ipo} />
            <GmpChartSection ipo={ipo} />
            <IssueDetailsSection ipo={ipo} />
            <LotCalculatorSection ipo={ipo} />
            <FinancialsSection ipo={ipo} />
            <AboutSection ipo={ipo} />
            {!business && insight.data?.show_to_investors ? <ResearchNote insight={insight.data} /> : null}
            <AnchorsSection ipo={ipo} />
            <IntermediariesSection ipo={ipo} />
            <DocumentsSection ipo={ipo} />
            <View style={{ height: 8 }} />
          </ScrollView>
          <ActionBar ipo={ipo} />
        </>
      )}
    </Screen>
  );
}
