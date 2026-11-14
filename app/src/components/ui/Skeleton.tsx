import React, { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { useTheme } from "@/lib/theme/ThemeProvider";

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder block. */
export function Skeleton({ width = "100%", height = 14, radius = 6, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }, animated, style]} />;
}

/** Skeleton shaped like an IPO list row. */
export function IpoCardSkeleton() {
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
      <View style={styles.top}>
        <Skeleton width={42} height={42} radius={10} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={14} />
          <Skeleton width="40%" height={11} />
        </View>
      </View>
      <View style={[styles.top, { marginTop: 14, paddingLeft: 54 }]}>
        <Skeleton width="26%" height={12} />
        <Skeleton width="26%" height={12} />
        <Skeleton width="20%" height={12} />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <IpoCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
});
