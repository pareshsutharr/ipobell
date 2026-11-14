// Slim navy strip under the home header in the Business view: your readiness score (or the invitation
// to take it) and a direct line to the advisors. The daily reminder that this app belongs to an advisory firm.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

import { PressableScale, Text } from "@/components/ui";
import { scoreReadiness, type ReadinessAnswers, type ReadinessResult } from "@/features/business/tools";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const READINESS_KEY = "ipobell.business.readiness.v1";

function useSavedReadiness(): ReadinessResult | null {
  const [result, setResult] = useState<ReadinessResult | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      AsyncStorage.getItem(READINESS_KEY)
        .then((raw) => {
          if (!alive || !raw) return;
          const saved = JSON.parse(raw) as { answers?: ReadinessAnswers };
          const answers = saved.answers ?? {};
          if (Object.values(answers).some((v) => v !== undefined)) setResult(scoreReadiness(answers));
          else setResult(null);
        })
        .catch(() => undefined);
      return () => {
        alive = false;
      };
    }, []),
  );
  return result;
}

export function BusinessStrip() {
  const { spacing, radius } = useTheme();
  const r = useSavedReadiness();
  const complete = r && r.answered === r.total;

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: 2 }}>
      <View style={[styles.strip, { borderRadius: radius.md, backgroundColor: palette.navy900 }]}>
        <PressableScale onPress={() => router.push("/business/readiness")} accessibilityRole="button" style={styles.main}>
          <View style={[styles.ring, { borderColor: complete ? palette.gold : "rgba(255,255,255,0.25)" }]}>
            {complete ? (
              <Text variant="numSm" color={palette.white} numeric style={{ fontSize: 12 }}>
                {r.percent}%
              </Text>
            ) : (
              <Ionicons name="speedometer-outline" size={16} color={palette.gold} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="label" color={palette.white} numberOfLines={2} style={{ lineHeight: 17 }}>
              {complete ? `IPO readiness: ${r.band.title}` : r ? "Finish your readiness check" : "Is your company IPO-ready?"}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.68)" numberOfLines={1}>
              {complete ? `${r.weakest[0] ? `Work on ${r.weakest[0].title.toLowerCase()}` : "Strong across the board"} · full report` : r ? `${r.answered} of ${r.total} answered · continue` : "20 questions · 8 min · free"}
            </Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => router.push("/business/book-call")} accessibilityRole="button" style={[styles.cta, { borderRadius: radius.sm }]}>
          <Ionicons name="call-outline" size={14} color={palette.navy950} />
          <Text variant="caption" color={palette.navy950} weight="bold">
            Talk
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  ring: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  cta: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#D4A440", paddingHorizontal: 10, height: 30 },
});
