// Shown by expo-router when a screen throws while rendering (exported as `ErrorBoundary` from the root layout).
// Uses only plain React Native pieces: the theme, fonts or providers may be the thing that broke.
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { reportError } from "@/lib/errors";

export function ErrorScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    reportError(error, { kind: "render", fatal: true });
  }, [error]);

  return (
    <View style={styles.root} accessibilityRole="alert">
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>This screen could not be shown. The problem has been reported to our team. Please try again.</Text>
      <Pressable onPress={() => void retry()} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Try again">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {__DEV__ ? <Text style={styles.dev}>{error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#FBFAF7" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 20, color: "#0F2D52", textAlign: "center" },
  body: { fontFamily: "Poppins_400Regular", fontSize: 14, lineHeight: 21, color: "#4B5563", textAlign: "center", marginTop: 10, maxWidth: 320 },
  button: { marginTop: 22, backgroundColor: "#0F2D52", paddingHorizontal: 26, paddingVertical: 12, borderRadius: 12 },
  buttonText: { fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#FFFFFF" },
  dev: { fontFamily: "Poppins_400Regular", fontSize: 12, color: "#8A1F1F", textAlign: "center", marginTop: 18 },
});
