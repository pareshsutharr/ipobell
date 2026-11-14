import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets, type Edge } from "react-native-safe-area-context";

import { useTheme } from "@/lib/theme/ThemeProvider";

interface ScreenProps extends ViewProps {
  edges?: Edge[];
  padded?: boolean;
}

/** Full-bleed themed background with safe-area padding on the requested edges. */
export function Screen({ edges = ["top"], padded = false, style, children, ...rest }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[
        styles.root,
        { backgroundColor: colors.background },
        edges.includes("top") && { paddingTop: insets.top },
        edges.includes("bottom") && { paddingBottom: insets.bottom },
        padded && { paddingHorizontal: spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
