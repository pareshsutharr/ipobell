// "Who are you?" — one tap, saved to the profile, sets the default perspective.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { PressableScale, Screen, Text } from "@/components/ui";
import type { UserRole } from "@/features/ipos/types";
import { ROLE_COPY, usePerspective } from "@/features/perspective/store";
import { BrandLogo } from "@/features/shell/components/Brand";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track } from "@/lib/analytics";
import { useProfile, useUserId } from "@/lib/auth/hooks";
import { requestPushPermission } from "@/lib/notifications/push";
import { useTheme } from "@/lib/theme/ThemeProvider";

const OPTIONS: { role: UserRole; icon: keyof typeof Ionicons.glyphMap; points: string[] }[] = [
  { role: "investor", icon: "trending-up-outline", points: ["Open, upcoming and listed IPOs", "GMP and live subscription", "Allotment status for your PANs"] },
  { role: "business", icon: "business-outline", points: ["Founder stories behind each IPO", "Free readiness and eligibility checks", "Issue size and cost estimators"] },
];

export default function ChooseRoleScreen() {
  const { colors, spacing, radius } = useTheme();
  const params = useLocalSearchParams<{ change?: string }>();
  const changing = params.change === "1";
  const userId = useUserId();
  const profile = useProfile();
  const setRole = usePerspective((s) => s.setRole);
  const adoptRole = usePerspective((s) => s.adoptRole);
  const [busy, setBusy] = useState<UserRole | null>(null);

  // Role already chosen on another device → adopt it and move on.
  useEffect(() => {
    if (!changing && profile.data?.role) {
      adoptRole(profile.data.role);
      router.replace("/");
    }
  }, [changing, profile.data?.role, adoptRole]);

  const choose = async (role: UserRole) => {
    if (busy) return;
    setBusy(role);
    try {
      track("role_selected", { role, changing });
      await setRole(role, userId);
      if (!changing) {
        try {
          await requestPushPermission();
        } catch {
          // never block entry on the permission prompt
        }
      }
      router.replace("/");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={["top", "bottom"]}>
      {changing ? <PageHeader title="Change how you use the app" /> : null}
      <ScrollView contentContainerStyle={[styles.body, { paddingHorizontal: spacing.xl }]} showsVerticalScrollIndicator={false}>
        {!changing ? (
          <Animated.View entering={FadeInDown.duration(500)}>
            <BrandLogo height={28} />
            <Text variant="display" style={{ marginTop: 28 }}>
              How will you use Be IPO Ready?
            </Text>
            <Text variant="body" color="textMuted" style={{ marginTop: 10 }}>
              This sets your home screen. You can switch between the two views any time from the header.
            </Text>
          </Animated.View>
        ) : null}

        <View style={{ marginTop: changing ? 8 : 28, gap: 12 }}>
          {OPTIONS.map((o, i) => (
            <Animated.View key={o.role} entering={FadeInDown.delay(120 + i * 90).duration(500)}>
              <PressableScale
                onPress={() => choose(o.role)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={ROLE_COPY[o.role].title}
                style={[styles.card, { borderRadius: radius.lg, borderColor: colors.border, backgroundColor: colors.surface, opacity: busy && busy !== o.role ? 0.6 : 1 }]}
              >
                <View style={[styles.icon, { backgroundColor: o.role === "business" ? colors.brand : colors.primarySoft, borderRadius: radius.md }]}>
                  <Ionicons name={o.icon} size={22} color={o.role === "business" ? colors.textOnBrand : colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <View>
                    <Text variant="h2">{ROLE_COPY[o.role].title}</Text>
                    <Text variant="bodySm" color="textMuted" style={{ marginTop: 4 }}>
                      {ROLE_COPY[o.role].body}
                    </Text>
                  </View>
                  <View style={{ gap: 5 }}>
                    {o.points.map((p) => (
                      <View key={p} style={styles.point}>
                        <Ionicons name="checkmark" size={14} color={colors.gain} />
                        <Text variant="caption" color="textMuted">
                          {p}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Ionicons name={busy === o.role ? "hourglass-outline" : "chevron-forward"} size={18} color={colors.textFaint} />
              </PressableScale>
            </Animated.View>
          ))}
        </View>

        {!changing ? (
          <Text variant="caption" color="textFaint" style={{ marginTop: 20 }}>
            Business owners also see everything investors see. Investors can open the business view any time.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: "center", paddingTop: 16, paddingBottom: 24 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  point: { flexDirection: "row", alignItems: "center", gap: 6 },
});
