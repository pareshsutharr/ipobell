import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Disclaimer, PressableScale, Section, Text } from "@/components/ui";
import { openUrl } from "@/features/ipos/components/detail/helpers";
import { useDocuments } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { openExternal } from "@/lib/analytics";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";

const TITLES: Record<string, string> = {
  rhp: "Red Herring Prospectus (RHP)",
  drhp: "Draft Red Herring Prospectus (DRHP)",
  anchor: "Anchor investor allocation",
  boa: "Basis of allotment",
};

export function DocumentsSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const { data } = useDocuments(ipo.id);

  const docs = useMemo(() => {
    const map = new Map<string, { kind: string; title: string; url: string }>();
    for (const [kind, url] of Object.entries(ipo.documents ?? {})) {
      if (typeof url === "string" && /^https?:\/\//i.test(url)) map.set(kind, { kind, title: TITLES[kind] ?? kind.toUpperCase(), url });
    }
    for (const d of data ?? []) map.set(d.kind, { kind: d.kind, title: d.title, url: d.url });
    return [...map.values()];
  }, [ipo.documents, data]);

  const items = [...docs.map((d) => ({ key: d.kind, title: d.title, sub: d.url.replace(/^https?:\/\//, ""), url: d.url, icon: "document-text-outline" as const })), ...(ipo.web_url ? [{ key: "web", title: "Full details on IPO Guru", sub: "Source page with latest updates", url: ipo.web_url, icon: "globe-outline" as const }] : [])];

  return (
    <View>
      {items.length ? (
        <Section title="Documents & links">
          {items.map((d, i) => (
            <PressableScale key={d.key} onPress={() => openUrl(d.url)} accessibilityRole="link" style={[styles.row, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Ionicons name={d.icon} size={18} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySm">{d.title}</Text>
                <Text variant="caption" color="textFaint" numberOfLines={1}>
                  {d.sub}
                </Text>
              </View>
              <Ionicons name="open-outline" size={15} color={colors.textFaint} />
            </PressableScale>
          ))}
        </Section>
      ) : null}
      <View style={{ marginTop: 16, paddingBottom: 8 }}>
        <Disclaimer />
        <PressableScale onPress={() => openExternal(env.links.dataAttribution, "IPO Guru attribution")} style={styles.attribution} accessibilityRole="link">
          <Text variant="caption" color="textFaint">
            Data by{" "}
            <Text variant="caption" color="brand">
              IPO Guru
            </Text>
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  attribution: { alignSelf: "flex-start", paddingHorizontal: 16, paddingBottom: 12 },
});
