// "Apply through your broker": brokers A to Z. Tapping one opens its app if installed, otherwise its website.
// A broker app that is on the phone is shown with its own icon (read from the phone); the rest show initials.
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Card, PressableScale, Screen, Text } from "@/components/ui";
import { installedIcon, launchBroker } from "@/features/ipos/brokerOpen";
import { BROKERS, BROKERS_NOTE, BROKERS_TITLE, monogram, type Broker } from "@/features/ipos/brokers";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

async function loadIcons(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    BROKERS.map(async (b) => {
      const icon = await installedIcon(b);
      if (icon) out[b.id] = icon;
    }),
  );
  return out;
}

export default function BrokersScreen() {
  const { colors, spacing, radius } = useTheme();
  const params = useLocalSearchParams<{ name?: string; slug?: string }>();
  const ipoName = typeof params.name === "string" && params.name.trim() ? params.name.trim().slice(0, 80) : null;
  const { data: icons } = useQuery({ queryKey: ["broker-icons"], queryFn: loadIcons, staleTime: 5 * 60 * 1000, retry: 0 });
  const [failed, setFailed] = useState<string | null>(null);

  const open = async (b: Broker) => {
    setFailed(null);
    const how = await launchBroker(b);
    // Recorded as an external link so it appears in the admin panel's existing "links tapped" report.
    track("external_link", { label: `Broker: ${b.name}`, host: new URL(b.webUrl).host.replace(/^www\./, ""), opened: how, slug: typeof params.slug === "string" ? params.slug : undefined });
    if (how === "failed") setFailed(`${b.name} could not be opened. Please open their app or website yourself.`);
  };

  return (
    <Screen>
      <PageHeader title={BROKERS_TITLE} subtitle={ipoName ? `To apply for ${ipoName}` : "Opens your broker's app or website"} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.lg }}>
        {failed ? (
          <Card variant="alt">
            <Text variant="bodySm" color="loss">
              {failed}
            </Text>
          </Card>
        ) : null}
        <View style={styles.grid}>
          {BROKERS.map((b) => {
            const icon = icons?.[b.id];
            return (
              <PressableScale key={b.id} onPress={() => void open(b)} accessibilityRole="link" accessibilityLabel={`Open ${b.name}`} testID={`broker-${b.id}`} style={[styles.tile, { borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface }]}>
                {icon ? (
                  <Image source={{ uri: icon }} style={[styles.logo, { borderRadius: radius.md }]} contentFit="contain" accessibilityIgnoresInvertColors />
                ) : (
                  <View style={[styles.logo, { borderRadius: radius.md, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
                    <Text variant="title" color="textMuted">
                      {monogram(b.name)}
                    </Text>
                  </View>
                )}
                <Text variant="label" align="center" numberOfLines={2}>
                  {b.name}
                </Text>
                <View style={styles.how}>
                  <Ionicons name={icon ? "phone-portrait-outline" : "globe-outline"} size={12} color={colors.textFaint} />
                  <Text variant="caption" color="textFaint">
                    {icon ? "Opens the app" : "Opens the website"}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
        <Text variant="caption" color="textFaint" style={{ lineHeight: 17 }}>
          {BROKERS_NOTE}
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "31%", flexGrow: 1, minWidth: 100, alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 8, borderWidth: StyleSheet.hairlineWidth },
  logo: { width: 52, height: 52 },
  how: { flexDirection: "row", alignItems: "center", gap: 4 },
});
