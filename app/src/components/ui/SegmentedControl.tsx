import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

/** Text tabs with a sliding underline (Groww-style). Same API as before. */
export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useSharedValue(0);
  const segW = width / Math.max(1, options.length);

  useEffect(() => {
    x.set(withTiming(index * segW, { duration: 220 }));
  }, [index, segW, x]);

  const underline = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={[styles.track, { borderBottomColor: colors.border }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={styles.segment} accessibilityRole="tab" accessibilityState={{ selected }}>
            <Text variant="label" color={selected ? colors.text : colors.textMuted} weight={selected ? "semibold" : "medium"}>
              {o.label}
            </Text>
            {typeof o.count === "number" && o.count > 0 ? (
              <Text variant="caption" color={selected ? colors.text : colors.textFaint} numeric>
                {o.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {width > 0 ? <Animated.View style={[styles.underline, { width: segW, backgroundColor: colors.text }, underline]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", height: 44, borderBottomWidth: StyleSheet.hairlineWidth, position: "relative" },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  underline: { position: "absolute", bottom: -StyleSheet.hairlineWidth, left: 0, height: 2, borderRadius: 1 },
});
