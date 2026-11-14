// Business Insight — the staff-written story behind an IPO, shown first in the Business view of the
// detail page. Hero image, headline, vitals, the house view, three long-form chapters, highlights,
// gallery, and what a promoter can take away (ending in the advisory call-to-action).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { Button, Chip, KeyValueRow, PressableScale, Text, useToneColors } from "@/components/ui";
import type { IpoInsight } from "@/features/insights/types";
import { imageUri } from "@/features/insights/hooks";
import { HOUSE_VIEW_DISCLAIMER, insightVitals, paragraphs, verdictMeta } from "@/features/insights/verdict";
import type { Ipo } from "@/features/ipos/types";
import { openExternal, track } from "@/lib/analytics";
import { dateLong } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

function youtubeId(url: string | null): string | null {
  const m = url?.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** YouTube's HD thumbnail when the video has one, falling back to the standard one (which every video has). */
function YouTubeThumb({ id, width, height, radius }: { id: string; width: number; height: number; radius: number }) {
  const [hd, setHd] = useState(true);
  return (
    <Image
      source={{ uri: `https://img.youtube.com/vi/${id}/${hd ? "maxresdefault" : "hqdefault"}.jpg` }}
      style={{ width, height, borderRadius: radius, backgroundColor: palette.navy950 }}
      contentFit="cover"
      transition={200}
      cachePolicy="memory-disk"
      onError={() => setHd(false)}
    />
  );
}

function Chapter({ title, kicker, text, open: initiallyOpen }: { title: string; kicker: string; text: string | null; open?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(Boolean(initiallyOpen));
  const paras = paragraphs(text);
  if (!paras.length) return null;
  const shown = open ? paras : paras.slice(0, 1);
  const truncated = !open && (paras.length > 1 || paras[0].length > 360);
  return (
    <View style={[styles.chapter, { borderTopColor: colors.border }]}>
      <Text variant="overline" color="primary">
        {kicker}
      </Text>
      <Text variant="h2" style={{ marginTop: 4 }}>
        {title}
      </Text>
      <View style={{ gap: 10, marginTop: 10 }}>
        {shown.map((p, i) => (
          <Text key={i} variant="body" color="textMuted" numberOfLines={!open && i === 0 && paras.length === 1 ? 7 : undefined} style={{ lineHeight: 23 }}>
            {p}
          </Text>
        ))}
      </View>
      {truncated || open ? (
        <Pressable onPress={() => setOpen((v) => !v)} style={{ alignSelf: "flex-start", marginTop: 8 }} accessibilityRole="button">
          <Text variant="label" color="brand">
            {open ? "Show less" : "Keep reading"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function InsightSection({ insight, ipo }: { insight: IpoInsight; ipo: Ipo }) {
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();
  const verdict = verdictMeta(insight.verdict);
  const verdictColors = useToneColors(verdict.tone);
  const vitals = insightVitals(insight);
  const heroW = width - spacing.lg * 2;
  useEffect(() => {
    track("insight_view", { slug: ipo.slug, ipo_id: insight.ipo_id, verdict: insight.verdict, name: ipo.display_name ?? ipo.name });
  }, [insight.ipo_id, insight.verdict, ipo.slug, ipo.display_name, ipo.name]);

  return (
    <View style={{ borderBottomWidth: 6, borderBottomColor: colors.surfaceAlt }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <View style={styles.byline}>
          <View style={[styles.mark, { backgroundColor: palette.navy900 }]}>
            <Text style={{ fontSize: 11, color: palette.gold }}>B</Text>
          </View>
          <Text variant="overline" color="brand">
            Business insight
          </Text>
          <Text variant="caption" color="textFaint">
            · by the Be IPO Ready team
          </Text>
        </View>

        {insight.hero_image_url ? (
          <Image source={{ uri: imageUri(insight.hero_image_url, insight.updated_at) }} style={{ width: heroW, height: Math.round(heroW * 0.56), borderRadius: radius.lg, marginTop: 14 }} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityLabel={`${ipo.name} — insight image`} />
        ) : null}

        {insight.headline ? (
          <Text variant="display" style={{ marginTop: 16, fontSize: 28, lineHeight: 34 }}>
            {insight.headline}
          </Text>
        ) : null}
        {insight.summary ? (
          <Text variant="body" color="textMuted" style={{ marginTop: 10, lineHeight: 23 }}>
            {insight.summary}
          </Text>
        ) : null}

        {vitals.length ? (
          <View style={styles.vitals}>
            {vitals.map((v) => (
              <View key={v.text} style={[styles.vital, { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm }]}>
                <Ionicons name={v.icon} size={13} color={colors.textMuted} />
                <Text variant="caption" color="text">
                  {v.text}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {insight.verdict ? (
          <View style={[styles.verdict, { borderRadius: radius.md, backgroundColor: verdictColors.bg, borderColor: verdictColors.fg + "33" }]}>
            <View style={styles.verdictHead}>
              <Ionicons name={verdict.icon} size={18} color={verdictColors.fg} />
              <Text variant="overline" color={verdictColors.fg}>
                Our view · {verdict.label}
              </Text>
            </View>
            {insight.verdict_note ? (
              <Text variant="bodySm" style={{ marginTop: 8, lineHeight: 20 }}>
                {insight.verdict_note}
              </Text>
            ) : null}
            <Text variant="caption" color="textFaint" style={{ marginTop: 8 }}>
              {HOUSE_VIEW_DISCLAIMER}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: spacing.lg }}>
        <Chapter kicker="The company" title={`What ${ipo.display_name ?? ipo.name} does`} text={insight.company_story} open />
        <Chapter kicker="The founders" title="The journey behind the business" text={insight.founder_story} />
        <Chapter kicker="The road to listing" title="From private company to the exchange" text={insight.listing_journey} />
        <Chapter kicker="Lessons" title="What this IPO teaches" text={insight.lessons} />
      </View>

      {insight.highlights.length ? (
        <View style={[styles.block, { paddingHorizontal: spacing.lg, borderTopColor: colors.border }]}>
          <Text variant="overline" color="primary">
            At a glance
          </Text>
          <View style={{ marginTop: 6 }}>
            {insight.highlights.map((h, i) => (
              <KeyValueRow key={`${h.label}-${i}`} label={h.label} value={h.value} last={i === insight.highlights.length - 1} numeric={/\d/.test(h.value)} />
            ))}
          </View>
        </View>
      ) : null}

      {insight.gallery.length ? (
        <View style={[styles.block, { borderTopColor: colors.border }]}>
          <Text variant="overline" color="primary" style={{ paddingHorizontal: spacing.lg }}>
            Inside the business
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 10, paddingTop: 10 }}>
            {insight.gallery.map((g, i) => (
              <View key={`${g.url}-${i}`} style={{ width: 240 }}>
                <Image source={{ uri: imageUri(g.url, insight.updated_at) }} style={{ width: 240, height: 160, borderRadius: radius.md }} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityLabel={g.caption ?? `${ipo.name} photo ${i + 1}`} />
                {g.caption ? (
                  <Text variant="caption" color="textMuted" style={{ marginTop: 6 }} numberOfLines={2}>
                    {g.caption}
                  </Text>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {insight.video_url ? (
        <View style={[styles.block, { paddingHorizontal: spacing.lg, borderTopColor: colors.border }]}>
          <Text variant="overline" color="primary">
            Watch
          </Text>
          <PressableScale onPress={() => openExternal(insight.video_url!, "insight_video")} accessibilityRole="link" accessibilityLabel="Watch the video on YouTube" style={[styles.video, { borderRadius: radius.md, backgroundColor: palette.navy900 }]}>
            {youtubeId(insight.video_url) ? (
              <YouTubeThumb id={youtubeId(insight.video_url)!} width={heroW} height={Math.round(heroW * 0.5625)} radius={radius.md} />
            ) : (
              <View style={{ width: heroW, height: 120 }} />
            )}
            <View style={styles.playWrap} pointerEvents="none">
              <View style={styles.play}>
                <Ionicons name="play" size={22} color={palette.navy900} style={{ marginLeft: 3 }} />
              </View>
            </View>
            <View style={styles.videoCaption}>
              <Ionicons name="logo-youtube" size={15} color={palette.white} />
              <Text variant="caption" color={palette.white}>
                {youtubeId(insight.video_url) ? "Opens in YouTube" : "Watch the video"}
              </Text>
            </View>
          </PressableScale>
        </View>
      ) : null}

      <View style={[styles.takeaways, { marginHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: palette.navy900 }]}>
        <Text variant="overline" color={palette.gold}>
          What this means for your company
        </Text>
        {insight.takeaways.length ? (
          <View style={{ gap: 10, marginTop: 12 }}>
            {insight.takeaways.map((t, i) => (
              <View key={i} style={styles.takeaway}>
                <View style={[styles.num, { borderColor: "rgba(255,255,255,0.25)" }]}>
                  <Text variant="caption" color={palette.gold} numeric>
                    {i + 1}
                  </Text>
                </View>
                <Text variant="bodySm" color="rgba(255,255,255,0.9)" style={{ flex: 1, lineHeight: 20 }}>
                  {t}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="bodySm" color="rgba(255,255,255,0.85)" style={{ marginTop: 10 }}>
            Every listed SME started where you are. Find out how far your company is from the bell.
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Button title="Check my readiness" icon="speedometer-outline" variant="gold" textColor={palette.white} onPress={() => router.push("/business/readiness")} />
          <Button title="Talk to an advisor" variant="secondary" textColor={palette.white} style={{ borderColor: "rgba(255,255,255,0.55)" }} onPress={() => router.push("/business/book-call")} />
        </View>
      </View>

      <View style={[styles.footer, { paddingHorizontal: spacing.lg }]}>
        <Chip label={ipo.board === "sme" ? "SME IPO" : "Mainboard IPO"} tone={ipo.board === "sme" ? "sme" : "mainboard"} size="sm" variant="soft" />
        <Text variant="caption" color="textFaint">
          {insight.published_at ? `Published ${dateLong(insight.published_at.slice(0, 10))}` : ""}
        </Text>
      </View>
    </View>
  );
}

/** Business view, but no insight written yet: keep the promoter angle alive without pretending. */
export function InsightEmpty({ ipo }: { ipo: Ipo }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, borderBottomWidth: 6, borderBottomColor: colors.surfaceAlt }}>
      <PressableScale onPress={() => router.navigate("/business")} accessibilityRole="button" style={[styles.empty, { borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={[styles.mark, { backgroundColor: colors.brandSoft, width: 34, height: 34, borderRadius: 10 }]}>
          <Ionicons name="business-outline" size={17} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">Insight for {ipo.display_name ?? ipo.name} is being written</Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 3 }}>
            Our team adds founder stories and listing journeys as issues come up. Meanwhile, see how your own company measures up.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  byline: { flexDirection: "row", alignItems: "center", gap: 8 },
  mark: { width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  vitals: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  vital: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, height: 28 },
  verdict: { marginTop: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  chapter: { paddingTop: 18, paddingBottom: 14, marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
  block: { paddingTop: 18, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  video: { marginTop: 10, overflow: "hidden" },
  playWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  play: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  videoCaption: { position: "absolute", left: 12, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(10,17,32,0.7)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  takeaways: { padding: 18, marginTop: 10 },
  takeaway: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  num: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  empty: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth },
});
