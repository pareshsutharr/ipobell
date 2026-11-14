// In-app registrar check: the registrar's own status page inside the app with IPO + PAN prefilled.
// Flow: page loads → we read the result if we can → user taps Done → popup Allotted / Partial / Not allotted → saved.
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { Button, Screen, Text } from "@/components/ui";
import { fetchApplications, revealPan, type IpoApplication } from "@/features/applications/api";
import { type AssistedMessage, buildInjectedScript } from "@/features/applications/assistedCheck";
import { copyToClipboard } from "@/features/applications/clipboard";
import { useRecordManualResult } from "@/features/applications/hooks";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { useTheme } from "@/lib/theme/ThemeProvider";

type WebViewModule = typeof import("react-native-webview");

let WebViewMod: WebViewModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebViewMod = require("react-native-webview") as WebViewModule;
} catch {
  WebViewMod = null;
}

type Outcome = "allotted" | "partial" | "not_allotted";
type Detected = { status: Outcome | "not_found"; shares: number | null; applied: number | null };

export default function AssistedCheckScreen() {
  const { application_id: applicationId } = useLocalSearchParams<{ application_id: string }>();
  const { colors } = useTheme();
  const record = useRecordManualResult();
  const [app, setApp] = useState<IpoApplication | null>(null);
  const [pan, setPan] = useState<string | null>(null);
  const [hint, setHint] = useState("Loading the registrar page…");
  const [detected, setDetected] = useState<Detected | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webRef = useRef<InstanceType<WebViewModule["WebView"]> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const apps = await fetchApplications();
        const found = apps.find((a) => a.id === applicationId) ?? null;
        if (!found) throw new Error("Application not found");
        const p = await revealPan(found.pan_id);
        if (!alive) return;
        setApp(found);
        setPan(p);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [applicationId]);

  const url = app?.ipo?.registrar?.status_page || app?.ipo?.registrar?.website || null;
  const ipoName = app?.ipo?.display_name ?? app?.ipo?.name ?? "";
  const registrarName = app?.ipo?.registrar?.name ?? "Registrar";
  const injected = useMemo(() => (pan ? buildInjectedScript({ pan, ipoName }) : ""), [pan, ipoName]);

  const onMessage = useCallback((raw: string) => {
    let msg: AssistedMessage;
    try {
      msg = JSON.parse(raw) as AssistedMessage;
    } catch {
      return;
    }
    if (msg.kind === "prefilled" && msg.note) setHint(msg.note);
    if (msg.kind === "result" && msg.status) {
      const shares = msg.shares ?? null;
      const applied = msg.applied ?? null;
      const status: Detected["status"] =
        msg.status === "allotted" && shares !== null && applied !== null && shares > 0 && shares < applied ? "partial" : msg.status;
      setDetected({ status, shares, applied });
    }
  }, []);

  const save = useCallback(
    (status: Outcome) => {
      if (!app) return;
      const shares = status === "not_allotted" ? 0 : detected?.shares ?? null;
      record.mutate(
        { applicationId: app.id, status, shares, note: detected ? `page: ${detected.status} ${detected.shares ?? ""}/${detected.applied ?? ""}` : "user marked" },
        {
          onSuccess: () => router.back(),
          onError: (e) => Alert.alert("Couldn't save", e instanceof Error ? e.message : String(e)),
        },
      );
    },
    [app, detected, record],
  );

  const onDone = useCallback(() => {
    const suggestion =
      detected?.status === "allotted"
        ? `Page shows: Allotted${detected.shares ? ` · ${detected.shares} shares` : ""}`
        : detected?.status === "partial"
          ? `Page shows: Partially allotted · ${detected.shares} of ${detected.applied}`
          : detected?.status === "not_allotted"
            ? "Page shows: Not allotted"
            : detected?.status === "not_found"
              ? "Page shows: no record yet"
              : "What did the registrar page show?";
    Alert.alert("Mark this application", suggestion, [
      { text: "Allotted", onPress: () => save("allotted") },
      { text: "Partially allotted", onPress: () => save("partial") },
      { text: "Not allotted", style: "destructive", onPress: () => save("not_allotted") },
    ], { cancelable: true });
  }, [detected, save]);

  const detectedText =
    detected?.status === "allotted"
      ? `Allotted${detected.shares ? ` · ${detected.shares} shares` : ""}`
      : detected?.status === "partial"
        ? `Partially allotted · ${detected.shares} of ${detected.applied}`
        : detected?.status === "not_allotted"
          ? "Not allotted"
          : detected?.status === "not_found"
            ? "No record yet"
            : null;
  const detectedColor = detected?.status === "allotted" ? colors.gain : detected?.status === "partial" ? colors.warning : detected?.status === "not_allotted" ? colors.loss : colors.text;

  return (
    <Screen>
      <PageHeader title={registrarName} subtitle={ipoName || "Allotment status"} />
      {error ? (
        <View style={styles.center}>
          <Text variant="title" align="center">
            {error}
          </Text>
          <Button title="Go back" variant="secondary" style={{ marginTop: 16 }} onPress={() => router.back()} />
        </View>
      ) : !app || !pan ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : !url ? (
        <View style={styles.center}>
          <Text variant="title" align="center">
            {registrarName} has not published a status page for this IPO yet.
          </Text>
        </View>
      ) : !WebViewMod ? (
        <View style={styles.center}>
          <Text variant="body" color="textMuted" align="center">
            The in-app checker needs the full app build.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.banner, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
            <Text variant="label">
              PAN ••••{pan.slice(-4)} · {ipoName}
            </Text>
            {detectedText ? (
              <Text variant="label" color={detectedColor}>
                {detectedText} — tap Done to save
              </Text>
            ) : (
              <Text variant="caption" color="textMuted">
                {hint} When you can see the result, tap Done.
              </Text>
            )}
          </View>
          <WebViewMod.WebView
            ref={webRef}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: colors.background }}
            injectedJavaScript={injected}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            onNavigationStateChange={() => {
              webRef.current?.injectJavaScript(injected);
            }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            setSupportMultipleWindows={false}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.center}>
                <ActivityIndicator color={colors.textMuted} />
              </View>
            )}
          />
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <Button
              title={copied ? "PAN copied" : "Copy PAN"}
              variant="secondary"
              size="sm"
              icon={copied ? "checkmark" : "copy-outline"}
              onPress={async () => {
                setCopied(await copyToClipboard(pan));
                setTimeout(() => setCopied(false), 2000);
              }}
            />
            <Button title={record.isPending ? "Saving…" : "Done"} variant="dark" size="sm" style={{ flex: 1 }} loading={record.isPending} onPress={onDone} />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  banner: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  footer: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
});
