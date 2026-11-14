// First screen for a signed-out install: brand, one promise, three ways in.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { Button, PressableScale, Screen, Text } from "@/components/ui";
import { BrandLogo } from "@/features/shell/components/Brand";
import { openExternal } from "@/lib/analytics";
import { authErrorMessage, useAuth } from "@/lib/auth/store";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "pulse-outline", text: "Every Mainboard and SME IPO with live GMP and subscription" },
  { icon: "ribbon-outline", text: "Allotment checked for your PANs, alerts for every date" },
  { icon: "business-outline", text: "How real companies got listed, and whether yours is ready" },
];

export default function WelcomeScreen() {
  const { colors, spacing, radius } = useTheme();
  const { width, height } = useWindowDimensions();
  const small = width < 360 || height < 700;
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const continueAsGuest = useAuth((s) => s.continueAsGuest);
  const [busy, setBusy] = useState<"google" | "guest" | null>(null);

  const onGoogle = async () => {
    setBusy("google");
    try {
      const r = await signInWithGoogle();
      if (r === "ok") router.replace("/");
    } catch (e) {
      Alert.alert("Couldn't sign in with Google", authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const onGuest = async () => {
    setBusy("guest");
    try {
      await continueAsGuest();
      router.replace("/");
    } catch (e) {
      Alert.alert("Couldn't continue", authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen edges={["top", "bottom"]} style={{ backgroundColor: palette.navy950 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.hero, { paddingHorizontal: spacing.xxl }]} showsVerticalScrollIndicator={false} bounces={false}>
        <Animated.View entering={FadeInDown.delay(60).duration(500)}>
          <BrandLogo height={34} onDark />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(180).duration(600)} style={{ marginTop: 40 }}>
          <Text variant="overline" color={palette.gold}>
            Be IPO Ready · Surat
          </Text>
          <Text variant="display" color={palette.white} style={{ marginTop: 12, fontSize: small ? 28 : 36, lineHeight: small ? 34 : 42 }}>
            India&apos;s IPOs, and the firm that takes companies public.
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.72)" style={{ marginTop: 14 }}>
            Track every issue as an investor. Learn how businesses like yours got listed as a promoter. One app, both sides of the bell.
          </Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(320).duration(600)} style={{ marginTop: small ? 18 : 28, gap: small ? 10 : 14, paddingBottom: 16 }}>
          {POINTS.map((p) => (
            <View key={p.text} style={styles.point}>
              <View style={[styles.pointIcon, { borderRadius: radius.sm }]}>
                <Ionicons name={p.icon} size={15} color={palette.gold} />
              </View>
              <Text variant="bodySm" color="rgba(255,255,255,0.86)" style={{ flex: 1 }}>
                {p.text}
              </Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      <Animated.View entering={FadeInUp.delay(380).duration(600)} style={[styles.sheet, { backgroundColor: colors.background, paddingHorizontal: spacing.xxl, borderTopLeftRadius: 28, borderTopRightRadius: 28 }]}>
        <View style={{ gap: 10 }}>
          <PressableScale onPress={onGoogle} disabled={busy !== null} accessibilityRole="button" style={[styles.google, { borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface, opacity: busy && busy !== "google" ? 0.6 : 1 }]}>
            <Ionicons name="logo-google" size={18} color={colors.text} />
            <Text variant="title" weight="semibold">
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </Text>
          </PressableScale>
          <Button title="Continue with email" icon="mail-outline" variant="primary" size="lg" fullWidth disabled={busy !== null} onPress={() => router.push("/sign-in")} />
          <Pressable onPress={onGuest} disabled={busy !== null} hitSlop={8} accessibilityRole="button" style={{ alignSelf: "center", paddingVertical: 10 }}>
            <Text variant="label" color="textMuted">
              {busy === "guest" ? "Setting up…" : "Skip for now"}
            </Text>
          </Pressable>
        </View>
        <Text variant="caption" color="textFaint" align="center" style={{ marginTop: 6, lineHeight: 17 }}>
          By continuing you agree to our{" "}
          <Text variant="caption" color="brand" onPress={() => openExternal(env.links.terms, "Terms")}>
            terms
          </Text>{" "}
          and{" "}
          <Text variant="caption" color="brand" onPress={() => openExternal(env.links.privacy, "Privacy policy")}>
            privacy policy
          </Text>
          . Information only, not investment advice.
        </Text>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexGrow: 1, justifyContent: "center", paddingTop: 16 },
  point: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  sheet: { paddingTop: 24, paddingBottom: 16 },
  google: { height: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1 },
});
