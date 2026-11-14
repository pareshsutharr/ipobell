import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { PressableScale } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";

export type ChipTone = "neutral" | "primary" | "gain" | "loss" | "info" | "warning" | "sme" | "mainboard";

interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: keyof typeof Ionicons.glyphMap;
  size?: "sm" | "md";
  dot?: boolean;
  /** `text` (default) is just coloured text with an optional dot; `soft` adds a light tinted background. */
  variant?: "text" | "soft";
  style?: StyleProp<ViewStyle>;
  numeric?: boolean;
}

export function useToneColors(tone: ChipTone) {
  const { colors } = useTheme();
  const map: Record<ChipTone, { fg: string; bg: string }> = {
    neutral: { fg: colors.textMuted, bg: colors.neutralSoft },
    primary: { fg: colors.primary, bg: colors.primarySoft },
    gain: { fg: colors.gain, bg: colors.gainSoft },
    loss: { fg: colors.loss, bg: colors.lossSoft },
    info: { fg: colors.info, bg: colors.infoSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    sme: { fg: colors.sme, bg: colors.smeSoft },
    mainboard: { fg: colors.mainboard, bg: colors.mainboardSoft },
  };
  return map[tone];
}

/** Minimal status/tag label. Flat by default — colour carries the meaning, not a pill. */
export function Chip({ label, tone = "neutral", icon, size = "md", dot, variant = "text", style, numeric }: ChipProps) {
  const { fg, bg } = useToneColors(tone);
  const { radius } = useTheme();
  const soft = variant === "soft";
  return (
    <View
      style={[
        styles.chip,
        soft && { backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: size === "sm" ? 6 : 8, height: size === "sm" ? 20 : 24 },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      {icon ? <Ionicons name={icon} size={size === "sm" ? 11 : 13} color={fg} /> : null}
      <Text variant={size === "sm" ? "caption" : "label"} color={fg} numeric={numeric} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

interface FilterChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
}

/** Outlined filter pill; selected state fills with the text colour (Groww-style). */
export function FilterChip({ label, selected, onPress, icon, count }: FilterChipProps) {
  const { colors, radius } = useTheme();
  const fg = selected ? colors.background : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      style={[styles.filter, { borderRadius: radius.pill, backgroundColor: selected ? colors.text : "transparent", borderColor: selected ? colors.text : colors.borderStrong }]}
    >
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
      {typeof count === "number" ? (
        <Text variant="caption" color={selected ? colors.background : colors.textFaint} numeric>
          {count}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderWidth: 1 },
});
