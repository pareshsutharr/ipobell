// Profile tab — notifications, saved PANs, appearance, about Be IPO Ready, legal, delete my data.
import * as Application from "expo-application";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, PressableScale, Screen, Text } from "@/components/ui";
import { usePans } from "@/features/applications/hooks";
import { useWatchlist } from "@/features/watchlist/hooks";
import { BrandLogo } from "@/features/shell/components/Brand";
import { MenuRow } from "@/features/shell/components/MenuRow";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { ROLE_COPY, usePerspective } from "@/features/perspective/store";
import { useAuth } from "@/lib/auth/store";
import { useProfile } from "@/lib/auth/hooks";
import { openExternal } from "@/lib/analytics";
import { env } from "@/lib/env";
import { initials } from "@/lib/format";
import { useTheme, useThemePreference, type ThemePreference } from "@/lib/theme/ThemeProvider";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function ProfileScreen() {
  const { colors, spacing, radius } = useTheme();
  const { preference, setPreference } = useThemePreference();
  const pans = usePans();
  const watchlist = useWatchlist();
  const deleteAccount = useAuth((s) => s.deleteAccount);
  const signOut = useAuth((s) => s.signOut);
  const user = useAuth((s) => s.user);
  const profile = useProfile();
  const role = usePerspective((s) => s.role);
  const resetPerspective = usePerspective((s) => s.reset);
  const [deleting, setDeleting] = useState(false);
  const isGuest = !user || Boolean(user.is_anonymous) || !user.email;
  const displayName = profile.data?.display_name ?? (user?.user_metadata?.full_name as string | undefined) ?? null;

  const onSignOut = () => {
    Alert.alert("Sign out?", isGuest ? "This is a guest account. Signing out loses your watchlist and saved PANs on this phone unless you create an account first." : "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          await resetPerspective();
          router.replace("/welcome");
        },
      },
    ]);
  };

  const open = (url: string, label?: string) => openExternal(url, label);

  const onDelete = () => {
    Alert.alert("Delete my data?", "This removes your watchlist, saved PANs, applications and notification settings from our servers. The app will start fresh.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAccount();
            await resetPerspective();
            Alert.alert("Done", "Your data has been deleted.");
            router.replace("/welcome");
          } catch (e) {
            Alert.alert("Couldn't delete", e instanceof Error ? e.message : String(e));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <PageHeader title="Profile" noBack />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.lg }}>
        <Card style={{ gap: 14 }}>
          <View style={styles.account}>
            <View style={[styles.avatar, { backgroundColor: isGuest ? colors.surfaceAlt : colors.brand, borderRadius: radius.md }]}>
              <Text variant="h3" color={isGuest ? colors.textMuted : colors.textOnBrand}>
                {isGuest ? "?" : initials(displayName ?? user?.email ?? "U")}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>
                {isGuest ? "Guest account" : displayName ?? user?.email}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {isGuest ? "Create an account to keep your watchlist and PANs on any phone" : user?.email}
              </Text>
            </View>
          </View>
          <View style={[styles.roleRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textMuted">
                Using the app as
              </Text>
              <Text variant="title">{role ? ROLE_COPY[role].short : "Not set"}</Text>
            </View>
            <Button title="Change" variant="secondary" size="sm" onPress={() => router.push({ pathname: "/choose-role", params: { change: "1" } })} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {isGuest ? <Button title="Create account" icon="person-add-outline" size="sm" onPress={() => router.push({ pathname: "/sign-in", params: { link: "1" } })} /> : null}
            <Button title="Sign out" variant="secondary" size="sm" onPress={onSignOut} />
          </View>
        </Card>

        <Card padding={0}>
          <MenuRow icon="notifications-outline" title="Notifications" subtitle="Choose which IPO alerts you get · send a test" onPress={() => router.push("/notifications")} />
          <MenuRow icon="ribbon-outline" title="Check my IPO allotment" subtitle="Allotment status for your applications, refunds and demat credit" onPress={() => router.push("/allotment")} />
          <MenuRow icon="key-outline" title="Saved PANs" subtitle={pans.data?.length ? `${pans.data.length} saved` : "Add PANs to track allotment"} onPress={() => router.push("/applications/pans")} />
          <MenuRow icon="star-outline" title="Watchlist" subtitle={watchlist.data?.length ? `${watchlist.data.length} IPOs` : "No IPOs yet"} onPress={() => router.navigate("/watchlist")} />
          <MenuRow icon="business-outline" title="Own a business? Get listed" subtitle="IPO readiness score, eligibility, issue size & cost tools" tone="primary" onPress={() => router.navigate("/business")} last />
        </Card>

        <View>
          <Text variant="overline" color="textFaint" style={{ marginBottom: 8 }}>
            Appearance
          </Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => {
              const selected = preference === t.value;
              return (
                <PressableScale
                  key={t.value}
                  onPress={() => setPreference(t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.theme, { borderRadius: radius.md, borderColor: selected ? colors.text : colors.border, backgroundColor: selected ? colors.text : "transparent" }]}
                >
                  <Text variant="label" color={selected ? colors.background : colors.text}>
                    {t.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <View>
          <Text variant="overline" color="textFaint" style={{ marginBottom: 8 }}>
            About
          </Text>
          <Card>
            <BrandLogo height={34} />
            <Text variant="bodySm" color="textMuted" style={{ marginTop: 12 }}>
              {env.brand.name} is an SME IPO advisory firm from Surat. We help Indian businesses raise growth capital, become IPO-ready and list on NSE Emerge, BSE SME and the Main Board. This app tracks every Indian IPO with alerts for the dates that matter.
            </Text>
            <View style={{ marginTop: 12, gap: 8 }}>
              <PressableScale onPress={() => open(env.links.website, "Website")} accessibilityRole="link">
                <Text variant="label" color="brand">
                  beipoready.com
                </Text>
              </PressableScale>
              <PressableScale onPress={() => open(env.links.contact, "Contact us")} accessibilityRole="link">
                <Text variant="label" color="brand">
                  Contact us · {env.brand.phone}
                </Text>
              </PressableScale>
              <PressableScale onPress={() => router.push("/business/book-call")} accessibilityRole="button">
                <Text variant="label" color="brand">
                  Book an IPO readiness call
                </Text>
              </PressableScale>
            </View>
          </Card>
        </View>

        <Card padding={0}>
          <MenuRow icon="information-circle-outline" title="About this app" onPress={() => router.push("/about")} />
          <MenuRow icon="shield-checkmark-outline" title="Privacy policy" onPress={() => router.push("/legal/privacy")} />
          <MenuRow icon="alert-circle-outline" title="Disclaimer" onPress={() => router.push("/legal/disclaimer")} />
          <MenuRow icon="trash-outline" title={deleting ? "Deleting…" : "Delete my data"} tone="danger" onPress={onDelete} last />
        </Card>

        <View style={{ alignItems: "center", gap: 4, marginTop: 8 }}>
          <Text variant="caption" color="textFaint" numeric>
            Version {Application.nativeApplicationVersion ?? "1.0.0"} ({Application.nativeBuildVersion ?? "dev"})
          </Text>
          <PressableScale onPress={() => open(env.links.dataAttribution, "IPO Guru attribution")} accessibilityRole="link">
            <Text variant="caption" color="textFaint">
              Data by IPO Guru
            </Text>
          </PressableScale>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  themeRow: { flexDirection: "row", gap: 8 },
  theme: { flex: 1, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
