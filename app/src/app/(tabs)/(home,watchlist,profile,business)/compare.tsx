// Compare two or three IPOs side by side. Open with /compare?slugs=a,b to preselect.
// Figures are shown as reported; the screen does not rank the IPOs.
import { Ionicons } from "@expo/vector-icons";
import { useQueries } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Card, Disclaimer, EmptyState, PressableScale, Screen, Skeleton, Text } from "@/components/ui";
import { fetchFinancials, fetchIpo } from "@/features/ipos/api";
import { addSlug, buildComparison, MAX_COMPARE, MIN_COMPARE, parseSlugs, removeSlug, type CompareItem } from "@/features/ipos/compare";
import { CompanyLogo } from "@/features/ipos/components/IpoBits";
import { useIpoSearch } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track } from "@/lib/analytics";
import { qk } from "@/lib/query";
import { useTheme } from "@/lib/theme/ThemeProvider";

const LABEL_W = 132;
const COL_W = 148;

export default function CompareScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const params = useLocalSearchParams<{ slugs?: string }>();
  const [slugs, setSlugs] = useState<string[]>(() => parseSlugs(params.slugs));
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const ipoQueries = useQueries({ queries: slugs.map((slug) => ({ queryKey: qk.ipo(slug), queryFn: () => fetchIpo(slug), staleTime: 60 * 1000 })) });
  const ipos = ipoQueries.map((q) => q.data as Ipo | undefined);
  const finQueries = useQueries({
    queries: ipos.map((ipo, i) => ({ queryKey: qk.financials(ipo?.id ?? `pending-${slugs[i]}`), queryFn: () => fetchFinancials((ipo as Ipo).id), enabled: Boolean(ipo), staleTime: 60 * 60 * 1000 })),
  });

  const ready = slugs.length >= MIN_COMPARE && ipos.every(Boolean);
  const items: CompareItem[] = useMemo(() => (ready ? ipos.map((ipo, i) => ({ ipo: ipo as Ipo, financials: finQueries[i]?.data })) : []), [ready, ipos, finQueries]);
  const comparison = useMemo(() => (items.length ? buildComparison(items) : null), [items]);
  const failed = ipoQueries.some((q) => q.isError);

  const search = useIpoSearch(debounced);
  const canAdd = slugs.length < MAX_COMPARE;
  const results = (search.data ?? []).filter((r) => !slugs.includes(r.slug)).slice(0, 8);

  const add = (slug: string) => {
    const next = addSlug(slugs, slug);
    setSlugs(next);
    setText("");
    setDebounced("");
    if (next.length >= MIN_COMPARE) track("compare", { count: next.length, slugs: next.join(",") });
  };

  return (
    <Screen>
      <PageHeader title="Compare IPOs" subtitle={`Pick ${MIN_COMPARE} or ${MAX_COMPARE} to see them side by side`} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {slugs.length ? (
            <View style={styles.selected}>
              {slugs.map((slug, i) => {
                const ipo = ipos[i];
                return (
                  <View key={slug} style={[styles.pick, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }]}>
                    {ipo ? <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={24} /> : <Skeleton width={24} height={24} radius={6} />}
                    <Text variant="bodySm" numberOfLines={1} style={{ flex: 1 }}>
                      {ipo ? (ipo.display_name ?? ipo.name) : ipoQueries[i]?.isError ? "Could not load" : "Loading…"}
                    </Text>
                    <PressableScale onPress={() => setSlugs(removeSlug(slugs, slug))} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${ipo?.name ?? slug}`}>
                      <Ionicons name="close" size={18} color={colors.textFaint} />
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          ) : null}

          {canAdd ? (
            <View>
              <View style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.pill }]}>
                <Ionicons name="search-outline" size={18} color={colors.textFaint} />
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={slugs.length ? "Add another IPO" : "Search an IPO to compare"}
                  placeholderTextColor={colors.textFaint}
                  autoCorrect={false}
                  autoCapitalize="none"
                  style={[typography.body, { color: colors.text, flex: 1, paddingVertical: 0 }]}
                  accessibilityLabel="Search an IPO to add"
                />
              </View>
              {debounced.trim().length >= 2 ? (
                <Card padding={0} style={{ marginTop: 8 }}>
                  {search.isLoading ? (
                    <View style={{ padding: 14, gap: 10 }}>
                      <Skeleton />
                      <Skeleton width="70%" />
                    </View>
                  ) : results.length === 0 ? (
                    <Text variant="bodySm" color="textMuted" style={{ padding: 14 }}>
                      No IPO found with that name.
                    </Text>
                  ) : (
                    results.map((r, i) => (
                      <PressableScale key={r.id} onPress={() => add(r.slug)} accessibilityRole="button" accessibilityLabel={`Add ${r.name}`} style={[styles.result, i < results.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                        <CompanyLogo uri={r.logo_url} name={r.name} size={28} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="bodySm" numberOfLines={1}>
                            {r.display_name ?? r.name}
                          </Text>
                          <Text variant="caption" color="textFaint">
                            {r.board === "sme" ? "SME" : "Mainboard"} · {r.status}
                          </Text>
                        </View>
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                      </PressableScale>
                    ))
                  )}
                </Card>
              ) : null}
            </View>
          ) : (
            <Text variant="caption" color="textFaint">
              Remove one to compare a different IPO.
            </Text>
          )}
        </View>

        {slugs.length < MIN_COMPARE ? (
          <EmptyState icon="git-compare-outline" title={slugs.length ? "Add one more IPO" : "Choose IPOs to compare"} message="Issue size, price, P/E, revenue, profit, debt, GMP and subscription, side by side." />
        ) : failed ? (
          <EmptyState icon="cloud-offline-outline" title="Could not load one of the IPOs" message="Check your connection, or remove it and add it again." compact />
        ) : !comparison ? (
          <View style={{ padding: spacing.lg, gap: 14 }}>
            <Skeleton height={20} />
            <Skeleton height={20} />
            <Skeleton height={20} width="80%" />
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              <View>
                <View style={styles.tr}>
                  <View style={{ width: LABEL_W }} />
                  {items.map(({ ipo }) => (
                    <PressableScale key={ipo.id} onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: ipo.slug } })} accessibilityRole="button" accessibilityLabel={`Open ${ipo.name}`} style={{ width: COL_W, paddingBottom: 10, gap: 6 }}>
                      <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={32} />
                      <Text variant="title" numberOfLines={2}>
                        {ipo.display_name ?? ipo.name}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
                {comparison.sections.map((section) => (
                  <View key={section.title}>
                    <View style={[styles.sectionHead, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
                      <Text variant="overline" color="textMuted">
                        {section.title}
                      </Text>
                    </View>
                    {section.rows.map((row) => (
                      <View key={row.label} style={[styles.tr, styles.dataRow, { borderBottomColor: colors.border }]}>
                        <View style={{ width: LABEL_W, paddingRight: 8 }}>
                          <Text variant="caption" color="textMuted">
                            {row.label}
                          </Text>
                          {row.note ? (
                            <Text variant="caption" color="textFaint" style={{ fontSize: 10, lineHeight: 13 }}>
                              {row.note}
                            </Text>
                          ) : null}
                        </View>
                        {row.values.map((v, i) => (
                          <View key={i} style={{ width: COL_W, paddingRight: 8 }}>
                            <Text variant="numSm" numeric color={v === "—" ? "textFaint" : "text"}>
                              {v}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, paddingTop: 16, lineHeight: 17 }}>
              {comparison.unitsDiffer ? "These companies report their financials in different units, shown next to each figure. " : ""}
              Financials are for each company&apos;s latest full year where available, as reported in its offer document. A dash means the figure is not available.
            </Text>
            <Disclaimer compact />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  selected: { gap: 8 },
  pick: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth },
  input: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
  result: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  tr: { flexDirection: "row", alignItems: "flex-start" },
  dataRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionHead: { paddingHorizontal: 8, paddingVertical: 6, marginTop: 14 },
});
