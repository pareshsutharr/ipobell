// Landing route for beipoready://auth/callback (OAuth code, email confirmation, password reset).
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button, Screen, Text } from "@/components/ui";
import { authErrorMessage, useAuth } from "@/lib/auth/store";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function AuthCallbackScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const url = Linking.useLinkingURL();
  const handleAuthUrl = useAuth((s) => s.handleAuthUrl);
  const session = useAuth((s) => s.session);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        if (params.error_description || params.error) {
          setError(String(params.error_description ?? params.error));
          return;
        }
        // Prefer the real incoming URL; fall back to rebuilding it from the route params.
        const incoming = url && /auth\/callback/.test(url) ? url : Linking.createURL("auth/callback", { queryParams: params });
        const ok = await handleAuthUrl(incoming);
        if (ok || session) router.replace("/");
        else setError("The link has expired or was already used.");
      } catch (e) {
        // A second exchange of the same code (browser + deep link both fired) is harmless when we already have a session.
        if (session) router.replace("/");
        else setError(authErrorMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: 16 }}>
        {error ? (
          <>
            <Text variant="h2" align="center">
              Couldn&apos;t finish signing in
            </Text>
            <Text variant="body" color="textMuted" align="center">
              {error}
            </Text>
            <Button title="Back to start" onPress={() => router.replace("/welcome")} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.brand} />
            <Text variant="bodySm" color="textMuted">
              Signing you in…
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
