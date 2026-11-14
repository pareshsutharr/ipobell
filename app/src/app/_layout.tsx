import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold, useFonts } from "@expo-google-fonts/poppins";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack, useGlobalSearchParams, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useInsightsRealtime } from "@/features/insights/hooks";
import { usePerspective } from "@/features/perspective/store";
import { startAnalytics, trackScreen } from "@/lib/analytics";
import { useAuth } from "@/lib/auth/store";
import { usePushNotifications } from "@/lib/notifications/push";
import { PERSIST_MAX_AGE, queryClient, queryPersister } from "@/lib/query";
import { ThemeProvider, useTheme, useThemePreference } from "@/lib/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => undefined);
SplashScreen.setOptions({ fade: true, duration: 350 });

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  // If a font file fails to download (dev server unreachable, flaky network) we still show the app with the system font.
  const [fontsLoaded, fontError] = useFonts({ Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold, Poppins_800ExtraBold });
  const hydrateTheme = useThemePreference((s) => s.hydrate);
  const themeHydrated = useThemePreference((s) => s.hydrated);
  const authStatus = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);
  const hydratePerspective = usePerspective((s) => s.hydrate);
  const perspectiveHydrated = usePerspective((s) => s.hydrated);

  useEffect(() => {
    hydrateTheme();
    hydratePerspective();
    bootstrap();
    startAnalytics();
  }, [hydrateTheme, hydratePerspective, bootstrap]);

  const ready = (fontsLoaded || Boolean(fontError)) && themeHydrated && perspectiveHydrated && authStatus !== "loading";
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: queryPersister, maxAge: PERSIST_MAX_AGE, buster: "v1" }}>
          <ThemeProvider>
            <Shell />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Shell() {
  const { colors, mode } = useTheme();
  usePushNotifications();
  useInsightsRealtime();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  useEffect(() => {
    if (pathname) trackScreen(pathname, params as Record<string, unknown>);
  }, [pathname, params]);
  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ animation: "fade" }} />
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="choose-role" options={{ animation: "fade" }} />
        <Stack.Screen name="auth/callback" options={{ animation: "fade" }} />
      </Stack>
    </>
  );
}
