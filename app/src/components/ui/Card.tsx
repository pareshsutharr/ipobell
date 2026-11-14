import React from "react";
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useTheme } from "@/lib/theme/ThemeProvider";

interface CardProps extends ViewProps {
  /** surface = white with hairline border; alt = light grey fill; outline = border only; primary = light accent tint; plain = no border. */
  variant?: "surface" | "alt" | "outline" | "primary" | "plain";
  padding?: number;
}

/** Flat container. No shadows anywhere — hierarchy comes from spacing and hairlines. */
export function Card({ variant = "surface", padding, style, children, ...rest }: CardProps) {
  const { colors, radius, spacing } = useTheme();
  const bg = variant === "alt" ? colors.surfaceAlt : variant === "primary" ? colors.primarySoft : variant === "outline" || variant === "plain" ? "transparent" : colors.surface;
  const borderColor = variant === "primary" ? "transparent" : variant === "alt" || variant === "plain" ? "transparent" : colors.border;
  return (
    <View {...rest} style={[styles.card, { backgroundColor: bg, borderColor, borderRadius: radius.md, padding: padding ?? spacing.lg }, style]}>
      {children}
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}

/** Pressable with a quiet press feedback (slight dim + scale). */
export function PressableScale({ style, scaleTo = 0.985, onPressIn, onPressOut, children, ...rest }: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * pressed.get() }],
    opacity: 1 - 0.25 * pressed.get(),
  }));
  return (
    <AnimatedPressable
      {...rest}
      style={[animated, style]}
      onPressIn={(e) => {
        pressed.set(withTiming(1, { duration: 80 }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withTiming(0, { duration: 160 }));
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Hairline divider for list rows. */
export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});
