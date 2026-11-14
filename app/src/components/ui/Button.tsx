import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { PressableScale } from "@/components/ui/Card";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette as brand } from "@/lib/theme/tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gain" | "dark" | "gold";
type Size = "sm" | "md" | "lg";

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Override the label/icon colour, e.g. white for an outline button on a navy panel. */
  textColor?: string;
}

/** Flat rectangular button (radius 10). `primary` is brand navy (gold on dark), `dark` is the near-black CTA, `gold` is the accent fill. */
export function Button({ title, onPress, variant = "primary", size = "md", icon, iconRight, loading, disabled, fullWidth, style, testID, textColor }: ButtonProps) {
  const { colors, radius } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.brand, fg: colors.textOnBrand },
    gold: { bg: brand.gold, fg: brand.navy950 },
    dark: { bg: colors.text, fg: colors.background },
    secondary: { bg: "transparent", fg: colors.text, border: colors.borderStrong },
    ghost: { bg: "transparent", fg: colors.brand },
    danger: { bg: "transparent", fg: colors.loss, border: colors.loss + "66" },
    gain: { bg: colors.gainSoft, fg: colors.gain },
  };
  const p = textColor ? { ...palette[variant], fg: textColor } : palette[variant];
  const height = size === "sm" ? 34 : size === "lg" ? 52 : 44;
  const iconSize = size === "sm" ? 15 : 18;
  const isDisabled = disabled || loading;
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={[
        styles.base,
        { height, backgroundColor: p.bg, borderRadius: radius.md, borderWidth: p.border ? 1 : 0, borderColor: p.border, opacity: isDisabled ? 0.5 : 1, paddingHorizontal: size === "sm" ? 12 : 18 },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={iconSize} color={p.fg} /> : null}
          <Text variant={size === "sm" ? "label" : "title"} color={p.fg} weight="semibold" numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={iconSize} color={p.fg} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  color?: string;
  size?: number;
  active?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** Borderless icon button — just the glyph with a generous hit area. */
export function IconButton({ icon, onPress, color, size = 22, active, accessibilityLabel, style }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} scaleTo={0.9} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={8} style={[styles.iconBtn, style]}>
      <Ionicons name={icon} size={size} color={color ?? (active ? colors.primary : colors.text)} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
