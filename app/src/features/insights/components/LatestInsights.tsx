// "Latest insights" — the newest staff-written stories, as a horizontal rail at the top of the Business
// view. Markers come from the public view; names/logos are joined client-side from the ipos table.
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Chip, PressableScale, Text } from "@/components/ui";
import { imageUri, useInsightMarkers } from "@/features/insights/hooks";
import { HOUSE_VIEW_DISCLAIMER_SHORT, verdictMeta } from "@/features/insights/verdict";
import { fetchIposByIds } from "@/features/ipos/api";
import { boardLabel, CompanyLogo } from "@/features/ipos/components/IpoBits";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const MAX = 8;
const CARD_W = 236;

export function LatestInsights() {
  const { spacing, radius, mode } = useTheme();
  const markers = useInsightMarkers();
  const latest = useMemo(() => (markers.data ?? []).slice(0, MAX), [markers.data]);
  const ids = useMemo(() => latest.map((m) => m.ipo_id), [latest]);
  const ipos = useQuery({
    queryKey: ["insight-ipos", ids.join(",")],
    queryFn: () => fetchIposByIds(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const byId = useMemo(() => new Map((ipos.data ?? []).map((i) => [i.id, i])), [ipos.data]);

  if (!latest.length || !ipos.data?.length) return null;

  return (
    <View style={{ paddingTop: 4 }}>
      <View style={[styles.head, { paddingHorizontal: spacing.lg }]}>
        <Ionicons name="diamond" size={12} color={palette.goldInk} />
        <Text variant="overline" color={mode === "dark" ? palette.gold : palette.goldInk}>
          Latest insights
        </Text>
        <Text variant="caption" color="textFaint" style={{ flex: 1 }}>
          · founder stories behind recent IPOs
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12, paddingTop: 10 }} snapToInterval={CARD_W + 12} decelerationRate="fast">
        {latest.map((m) => {
          const ipo = byId.get(m.ipo_id);
          if (!ipo) return null;
          const v = verdictMeta(m.verdict);
          return (
            <PressableScale
              key={m.ipo_id}
              onPress={() => {
                track("latest_insight_tap", { slug: ipo.slug, name: ipo.display_name ?? ipo.name });
                router.push({ pathname: "/ipo/[slug]", params: { slug: ipo.slug } });
              }}
              accessibilityRole="button"
              accessibilityLabel={`${ipo.name} insight`}
              style={[styles.card, { width: CARD_W, borderRadius: radius.lg, backgroundColor: palette.navy900 }]}
            >
              {m.hero_image_url ? (
                <Image source={{ uri: imageUri(m.hero_image_url, m.published_at) }} style={styles.hero} contentFit="cover" transition={200} cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.hero, styles.heroEmpty]}>
                  <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={48} />
                </View>
              )}
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1} style={{ flex: 1 }}>
                    {ipo.display_name ?? ipo.name} · {boardLabel(ipo.board, ipo.sub_type)}
                  </Text>
                </View>
                <Text variant="h3" color={palette.white} numberOfLines={3} style={{ marginTop: 4, fontSize: 17, lineHeight: 22 }}>
                  {m.headline ?? `How ${ipo.display_name ?? ipo.name} got listed`}
                </Text>
                <View style={[styles.row, { marginTop: 10, justifyContent: "space-between" }]}>
                  {m.verdict ? <Chip label={v.label} tone={v.tone} size="sm" variant="soft" /> : <View />}
                  <View style={styles.read}>
                    <Text variant="caption" color={palette.gold} weight="bold">
                      Read
                    </Text>
                    <Ionicons name="arrow-forward" size={12} color={palette.gold} />
                  </View>
                </View>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
      {latest.some((m) => m.verdict) ? (
        <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, marginTop: 8 }}>
          {HOUSE_VIEW_DISCLAIMER_SHORT}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: { overflow: "hidden" },
  hero: { width: "100%", height: 118 },
  heroEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  body: { padding: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  read: { flexDirection: "row", alignItems: "center", gap: 3 },
});
