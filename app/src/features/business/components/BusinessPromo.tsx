// Small "own a business?" card shown under the IPO list — the hand-off from the investor side of the
// app to the advisory side. Dismissible per device.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { PressableScale, Text } from "@/components/ui";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const KEY = "ipobell.business.promo.dismissed.v1";

export function BusinessPromo() {
  const { spacing, radius } = useTheme();
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setHidden(v === "1"))
      .catch(() => setHidden(false));
  }, []);
  if (hidden !== false) return null;
  return (
    <View style={{ paddingHorizontal: spacing.lg }}>
      <PressableScale onPress={() => router.navigate("/business")} accessibilityRole="button" style={[styles.card, { borderRadius: radius.md, backgroundColor: palette.navy900 }]}>
        <View style={[styles.icon, { borderRadius: radius.md }]}>
          <Ionicons name="business-outline" size={20} color={palette.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title" color={palette.white}>
            Own a business? See if it&apos;s IPO-ready.
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.7)" style={{ marginTop: 2 }}>
            Free readiness score, eligibility check and issue size calculator from Be IPO Ready&apos;s SME IPO advisors.
          </Text>
        </View>
        <PressableScale
          onPress={() => {
            setHidden(true);
            AsyncStorage.setItem(KEY, "1").catch(() => undefined);
          }}
          hitSlop={8}
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          style={styles.close}
        >
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </PressableScale>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  close: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
