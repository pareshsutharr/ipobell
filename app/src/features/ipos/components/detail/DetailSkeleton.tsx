import React from "react";
import { StyleSheet, View } from "react-native";

import { Skeleton } from "@/components/ui";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function DetailSkeleton() {
  const { spacing, colors } = useTheme();
  return (
    <View>
      <View style={{ padding: spacing.lg }}>
        <View style={styles.row}>
          <Skeleton width={44} height={44} radius={10} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="75%" height={18} />
            <Skeleton width="50%" height={12} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: 22 }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={10} />
            <Skeleton width="70%" height={16} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={10} />
            <Skeleton width="70%" height={16} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: 16 }]}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={10} />
            <Skeleton width="70%" height={16} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={10} />
            <Skeleton width="70%" height={16} />
          </View>
        </View>
      </View>
      <View style={{ height: 6, backgroundColor: colors.surfaceAlt }} />
      <View style={{ padding: spacing.lg, gap: 14 }}>
        <Skeleton width="35%" height={16} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="70%" height={12} />
        <Skeleton width="50%" height={12} />
      </View>
      <View style={{ height: 6, backgroundColor: colors.surfaceAlt }} />
      <View style={{ padding: spacing.lg, gap: 12 }}>
        <Skeleton width="35%" height={16} />
        <Skeleton height={4} />
        <Skeleton height={4} />
        <Skeleton height={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
