// The two "main menus" in the home header: Investor | Business. A sliding pill. The Business side is
// the premium one: gold thumb with navy type when active, gold type with a small diamond when idle.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { usePerspective, type Perspective } from "@/features/perspective/store";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const OPTIONS: { value: Perspective; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "investor", label: "Investor", icon: "trending-up-outline" },
  { value: "business", label: "Business", icon: "diamond-outline" },
];

export function PerspectiveSwitch({ compact }: { compact?: boolean }) {
  const { colors, radius, mode } = useTheme();
  const perspective = usePerspective((s) => s.perspective);
  const setPerspective = usePerspective((s) => s.setPerspective);
  const [width, setWidth] = useState(0);
  const business = perspective === "business";
  const index = business ? 1 : 0;
  const x = useSharedValue(0);
  const gold = useSharedValue(business ? 1 : 0);
  const segW = width / 2;

  useEffect(() => {
    x.set(withSpring(index * segW, { damping: 20, stiffness: 240 }));
    gold.set(withTiming(business ? 1 : 0, { duration: 220 }));
  }, [index, segW, x, business, gold]);

  const investorThumb = mode === "dark" ? colors.surfaceElevated : colors.brand;
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    backgroundColor: gold.get() > 0.5 ? palette.gold : investorThumb,
  }));

  return (
    <View
      style={[styles.track, { borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, height: compact ? 36 : 40, borderColor: business ? "rgba(212,164,64,0.45)" : "transparent" }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 6)}
      accessibilityRole="tablist"
    >
      {width > 0 ? <Animated.View style={[styles.thumb, { width: segW, borderRadius: radius.pill }, thumb]} /> : null}
      {OPTIONS.map((o) => {
        const selected = o.value === perspective;
        const isBiz = o.value === "business";
        const fg = selected ? (isBiz ? palette.navy950 : mode === "dark" ? colors.text : colors.textOnBrand) : isBiz ? (mode === "dark" ? palette.gold : palette.goldInk) : colors.textMuted;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!selected) {
                Haptics.selectionAsync().catch(() => undefined);
                track("perspective_switch", { to: o.value });
                setPerspective(o.value);
              }
            }}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Ionicons name={selected && isBiz ? "diamond" : o.icon} size={14} color={fg} />
            <Text variant="label" color={fg} weight={selected || isBiz ? "bold" : "semibold"} style={isBiz ? { letterSpacing: 0.2 } : undefined}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 3, position: "relative", borderWidth: 1 },
  thumb: { position: "absolute", top: 3, bottom: 3, left: 3 },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
