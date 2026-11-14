import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";

import { PressableScale } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tone?: "default" | "danger" | "primary";
  last?: boolean;
  external?: boolean;
}

/** Settings-style row: icon, title, optional subtitle, chevron / custom right slot. */
export function MenuRow({ icon, title, subtitle, onPress, right, tone = "default", last, external }: MenuRowProps) {
  const { colors } = useTheme();
  const fg = tone === "danger" ? colors.loss : tone === "primary" ? colors.primary : colors.text;
  const iconBg = tone === "danger" ? colors.lossSoft : tone === "primary" ? colors.primarySoft : colors.surfaceAlt;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.99}
      accessibilityRole={onPress ? "button" : undefined}
      style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={tone === "default" ? colors.textMuted : fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title" color={fg} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name={external ? "open-outline" : "chevron-forward"} size={18} color={colors.textFaint} /> : null)}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
