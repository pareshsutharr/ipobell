import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { IconButton } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  /** Hide the back button (for tab roots). */
  noBack?: boolean;
}

/** Simple page header: back button, title, optional right slot. */
export function PageHeader({ title, subtitle, right, onBack, noBack }: Props) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>
      {!noBack ? <IconButton icon="arrow-back" accessibilityLabel="Go back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
