import { Ionicons } from "@expo/vector-icons";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePerspective } from "@/features/perspective/store";
import { useAuth } from "@/lib/auth/store";
import { useTheme } from "@/lib/theme/ThemeProvider";

// Content height of the tab bar (icon + label). The system navigation bar inset is added on top, so the bar
// is never covered by Android's 3-button navigation (≈48dp) or the gesture pill (≈16–24dp), nor the iPhone home bar.
const TAB_BAR_CONTENT_HEIGHT = Platform.OS === "android" ? 58 : 50;

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const authStatus = useAuth((s) => s.status);
  const session = useAuth((s) => s.session);
  const hydrated = usePerspective((s) => s.hydrated);
  const role = usePerspective((s) => s.role);

  if (authStatus === "loading" || !hydrated) return null;
  if (!session) return <Redirect href="/welcome" />;
  if (!role) return <Redirect href="/choose-role" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandDeep,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginBottom: Platform.OS === "android" ? 4 : 0 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: "IPOs", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "pulse" : "pulse-outline"} size={23} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="(watchlist)"
        options={{ title: "Watchlist", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "star" : "star-outline"} size={23} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="(business)"
        options={{ title: "Get Listed", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "business" : "business-outline"} size={23} color={String(color)} /> }}
      />
      <Tabs.Screen
        name="(profile)"
        options={{ title: "Profile", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={23} color={String(color)} /> }}
      />
    </Tabs>
  );
}
