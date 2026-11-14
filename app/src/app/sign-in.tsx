// Email + password: sign in, create account, reset password, or (with ?link=1) upgrade a guest account.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Button, Card, Screen, Text } from "@/components/ui";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { authErrorMessage, useAuth } from "@/lib/auth/store";
import { useTheme } from "@/lib/theme/ThemeProvider";

type Mode = "signin" | "signup" | "reset";

export default function SignInScreen() {
  const { colors, spacing, radius, fonts } = useTheme();
  const params = useLocalSearchParams<{ link?: string; mode?: string }>();
  const linking = params.link === "1";
  const [mode, setMode] = useState<Mode>(params.mode === "signup" || linking ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);

  const auth = useAuth();

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (mode === "reset" || password.length >= 8);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "reset") {
        await auth.sendPasswordReset(email);
        setSent("reset");
      } else if (mode === "signup") {
        const hasSession = linking ? await auth.linkEmail(email, password, name) : await auth.signUpWithEmail(email, password, name);
        if (hasSession) router.replace("/");
        else setSent("confirm");
      } else {
        await auth.signInWithEmail(email, password);
        router.replace("/");
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = [styles.input, { borderColor: colors.borderStrong, borderRadius: radius.md, color: colors.text, fontFamily: fonts.regular, backgroundColor: colors.surface }];

  if (sent) {
    return (
      <Screen>
        <PageHeader title={sent === "confirm" ? "Check your inbox" : "Reset link sent"} />
        <View style={{ paddingHorizontal: spacing.lg, gap: 14 }}>
          <Ionicons name="mail-unread-outline" size={40} color={colors.brand} />
          <Text variant="h2">{sent === "confirm" ? `We emailed ${email.trim()}` : `We emailed a reset link to ${email.trim()}`}</Text>
          <Text variant="body" color="textMuted">
            {sent === "confirm"
              ? "Open the link in that email on this phone to confirm your account. It opens straight back into the app."
              : "Open the link on this phone to choose a new password."}
          </Text>
          <Button title="Back to sign in" variant="secondary" onPress={() => { setSent(null); setMode("signin"); }} />
          {linking ? <Button title="Continue as guest for now" variant="ghost" onPress={() => router.replace("/")} /> : null}
        </View>
      </Screen>
    );
  }

  const title = mode === "reset" ? "Reset password" : mode === "signup" ? (linking ? "Create your account" : "Create account") : "Sign in";
  const subtitle = linking ? "Your watchlist, PANs and settings stay exactly as they are." : mode === "signup" ? "Your watchlist and alerts follow you to any phone." : "Welcome back.";

  return (
    <Screen>
      <PageHeader title={title} subtitle={subtitle} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 12 }}>
            {mode === "signup" ? (
              <View style={{ gap: 6 }}>
                <Text variant="caption" color="textMuted">
                  Your name
                </Text>
                <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.textFaint} autoCapitalize="words" autoComplete="name" style={inputStyle} />
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Text variant="caption" color="textMuted">
                Email
              </Text>
              <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textFaint} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" style={inputStyle} />
            </View>
            {mode !== "reset" ? (
              <View style={{ gap: 6 }}>
                <Text variant="caption" color="textMuted">
                  Password {mode === "signup" ? "(8+ characters)" : ""}
                </Text>
                <View>
                  <TextInput value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor={colors.textFaint} secureTextEntry={!showPw} autoCapitalize="none" autoComplete={mode === "signup" ? "new-password" : "current-password"} textContentType={mode === "signup" ? "newPassword" : "password"} style={[inputStyle, { paddingRight: 44 }]} onSubmitEditing={submit} />
                  <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8} style={styles.eye} accessibilityRole="button" accessibilityLabel={showPw ? "Hide password" : "Show password"}>
                    <Ionicons name={showPw ? "eye-off-outline" : "eye-outline"} size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            ) : null}
            {error ? (
              <Text variant="caption" color="loss">
                {error}
              </Text>
            ) : null}
            <Button title={mode === "reset" ? "Send reset link" : mode === "signup" ? "Create account" : "Sign in"} size="lg" fullWidth loading={busy} disabled={!valid} onPress={submit} />
            {mode === "signin" ? (
              <Pressable onPress={() => setMode("reset")} hitSlop={6} style={{ alignSelf: "flex-start" }}>
                <Text variant="label" color="brand">
                  Forgot password?
                </Text>
              </Pressable>
            ) : null}
          </Card>

          {!linking ? (
            <View style={styles.switchRow}>
              <Text variant="bodySm" color="textMuted">
                {mode === "signin" ? "New here?" : "Already have an account?"}
              </Text>
              <Pressable onPress={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }} hitSlop={6}>
                <Text variant="label" color="brand">
                  {mode === "signin" ? "Create account" : "Sign in"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: { height: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  eye: { position: "absolute", right: 12, top: 0, height: 48, justifyContent: "center" },
  switchRow: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center" },
});
