// Brand lockups for Be IPO Ready (beipoready.com).
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const LOGO_DARK_TEXT = require("../../../../assets/brand-logo.png");
const LOGO_LIGHT_TEXT = require("../../../../assets/brand-logo-light.png");
const LOGO_RATIO = 625 / 254;

/** Full "Be IPO Ready — Adding value before valuation" wordmark; picks the variant for the current theme. */
export function BrandLogo({ height = 40, style, onDark }: { height?: number; style?: StyleProp<ViewStyle>; onDark?: boolean }) {
  const { mode } = useTheme();
  const dark = onDark ?? mode === "dark";
  return (
    <View style={style}>
      <Image source={dark ? LOGO_LIGHT_TEXT : LOGO_DARK_TEXT} style={{ height, width: height * LOGO_RATIO }} contentFit="contain" accessibilityLabel="Be IPO Ready" />
    </View>
  );
}

/** The orange "IPO" disc from the logo, drawn natively so it stays crisp at any size. */
export function BrandMark({ size = 48, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const { fonts } = useTheme();
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.discOrange }, style]} accessibilityLabel="IPO">
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.38, lineHeight: size * 0.46, color: palette.white, letterSpacing: -size * 0.01 }}>IPO</Text>
    </View>
  );
}

/** Compact header lockup: disc + "Be IPO Ready" in brand navy (or gold on dark). */
export function BrandWordmark({ size = 30 }: { size?: number }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.8, lineHeight: size, color: colors.text }}>Be</Text>
      <BrandMark size={size} />
      <Text style={{ fontFamily: fonts.extrabold, fontSize: size * 0.8, lineHeight: size, color: colors.text }}>Ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
});
