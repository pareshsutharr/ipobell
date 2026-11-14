import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, ScrollView, StyleSheet, Switch, View } from "react-native";

import { Button, Card, Disclaimer, ErrorState, FilterChip, Screen, Section, Skeleton, Text } from "@/components/ui";
import type { NotificationPreferences } from "@/features/ipos/types";
import { BOARD_OPTIONS, FILTER_SECTORS, filterSummary, hasFilters, NO_FILTERS, presetOf, readFilters, SIZE_PRESETS, toggleSector, type NotificationFilters } from "@/features/notifications/filters";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { track } from "@/lib/analytics";
import { useNotificationPreferences, useUpdateNotificationPreferences, useUserId } from "@/lib/auth/hooks";
import { getPushPermissionStatus, registerDeviceForPush, requestPushPermission } from "@/lib/notifications/push";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme/ThemeProvider";

type PrefKey = Exclude<keyof Omit<NotificationPreferences, "user_id">, keyof NotificationFilters>;

const GROUPS: { title: string; items: { key: PrefKey; title: string; body: string }[] }[] = [
  {
    title: "Calendar",
    items: [
      { key: "new_ipo", title: "New IPO announced", body: "When a new Mainboard or SME issue is added." },
      { key: "opens_today", title: "Opens today", body: "Morning reminder on the opening day with price band and lot size." },
      { key: "closes_today", title: "Closes today", body: "Last-day reminder with subscription so far." },
      { key: "closing_soon", title: "Closing in 2 hours", body: "Afternoon nudge before the 5 PM cut-off." },
    ],
  },
  {
    title: "After bidding",
    items: [
      { key: "allotment", title: "Allotment", body: "Evening-before and same-day reminders with the registrar link." },
      { key: "refund_demat", title: "Refund & demat credit", body: "When refunds are processed and shares hit your demat." },
      { key: "listing", title: "Listing", body: "Listing-day reminder and the listing result (price and gain)." },
    ],
  },
  {
    title: "Market signals",
    items: [
      { key: "subscription_milestone", title: "Subscription milestones", body: "Retail / NII / QIB crosses 1x, 2x, 5x, 10x…" },
      { key: "gmp_change", title: "GMP change", body: "Meaningful grey-market moves — always limited to your watchlist." },
    ],
  },
];

function PrefRow({ title, body, value, onChange, last }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {body}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.surfaceElevated }} thumbColor="#FFFFFF" accessibilityLabel={title} />
    </View>
  );
}

export default function NotificationsScreen() {
  const { colors, spacing } = useTheme();
  const userId = useUserId();
  const { data: prefs, isLoading, isError, refetch } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [perm, setPerm] = useState<"granted" | "denied" | "undetermined" | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const sendTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (userId) await registerDeviceForPush(userId, { force: true });
      const { data, error } = await supabase.functions.invoke("test-push", { method: "POST" });
      if (error) throw error;
      const r = data as { ok: boolean; fcmConfigured?: boolean; devices?: number; reason?: string; success?: number; failure?: number; errors?: string[] };
      if (r.ok) setTestResult({ ok: true, message: `Sent to ${r.success} device${r.success === 1 ? "" : "s"}. Check your notification shade.` });
      else if (r.fcmConfigured === false) setTestResult({ ok: false, message: "Server is missing the Firebase service-account key (FCM_SERVICE_ACCOUNT_JSON)." });
      else if (!r.devices) setTestResult({ ok: false, message: "This device isn't registered yet. Push tokens are only issued on real devices, not simulators." });
      else setTestResult({ ok: false, message: r.errors?.[0] ?? r.reason ?? "Delivery failed." });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }, [userId]);

  const refreshPerm = useCallback(() => {
    getPushPermissionStatus().then(setPerm).catch(() => setPerm(null));
  }, []);
  useFocusEffect(refreshPerm);

  const onRequest = async () => {
    const ok = await requestPushPermission();
    if (ok && userId) registerDeviceForPush(userId, { force: true }).catch(() => undefined);
    refreshPerm();
  };

  const set = (key: PrefKey, value: boolean) => {
    track("notification_pref", { key, value });
    update.mutate({ [key]: value });
  };

  const filters = readFilters(prefs);
  const sizePreset = presetOf(filters);
  const setFilters = (patch: Partial<NotificationFilters>) => {
    const next = { ...filters, ...patch };
    track("notification_pref", { key: "filters", value: filterSummary(next) });
    update.mutate(patch);
  };

  return (
    <Screen>
      <PageHeader title="Notifications" subtitle="Pick exactly what you want to hear about" />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          {perm === "granted" ? (
            <Card variant="alt" padding={12}>
              <View style={styles.permRow}>
                <Ionicons name="checkmark-circle" size={20} color={colors.gain} />
                <Text variant="bodySm" color="textMuted" style={{ flex: 1 }}>
                  Push notifications are enabled on this device.
                </Text>
                <Button title={testing ? "Sending…" : "Send test"} size="sm" variant="secondary" icon="paper-plane-outline" loading={testing} onPress={sendTest} />
              </View>
              {testResult ? (
                <Text variant="caption" color={testResult.ok ? "gain" : "warning"} style={{ marginTop: 8 }}>
                  {testResult.message}
                </Text>
              ) : null}
            </Card>
          ) : perm === "denied" ? (
            <Card variant="primary">
              <View style={styles.permRow}>
                <Ionicons name="notifications-off-outline" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">Notifications are blocked</Text>
                  <Text variant="bodySm" color="textMuted">
                    Allow notifications for Be IPO Ready in system settings to receive alerts.
                  </Text>
                </View>
              </View>
              <Button title="Open settings" size="sm" icon="settings-outline" style={{ marginTop: 12 }} onPress={() => Linking.openSettings().catch(() => undefined)} />
            </Card>
          ) : perm === "undetermined" ? (
            <Card variant="primary">
              <View style={styles.permRow}>
                <Ionicons name="notifications-outline" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="title">Turn on alerts</Text>
                  <Text variant="bodySm" color="textMuted">
                    Get reminded on open, close, allotment and listing days.
                  </Text>
                </View>
              </View>
              <Button title="Enable notifications" size="sm" icon="notifications" style={{ marginTop: 12 }} onPress={onRequest} />
            </Card>
          ) : null}
        </View>

        {isLoading ? (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.xl, gap: 12 }}>
            <Skeleton height={72} radius={16} />
            <Skeleton height={220} radius={16} />
            <Skeleton height={180} radius={16} />
          </View>
        ) : isError || !prefs ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <>
            <Section title="Scope">
              <Card padding={0}>
                <View style={{ paddingHorizontal: 14 }}>
                  <PrefRow title="Only watchlist IPOs" body="When on, every alert below is sent only for IPOs you've starred. GMP alerts are always watchlist-only." value={prefs.only_watchlist} onChange={(v) => set("only_watchlist", v)} last />
                </View>
              </Card>
            </Section>
            <Section title="Which IPOs" subtitle={filterSummary(filters)}>
              <Card style={{ gap: 14 }}>
                <View style={{ gap: 8 }}>
                  <Text variant="label" color="textMuted">
                    Board
                  </Text>
                  <View style={styles.chips}>
                    {BOARD_OPTIONS.map((o) => (
                      <FilterChip key={o.label} label={o.label} selected={filters.filter_board === o.value} onPress={() => setFilters({ filter_board: o.value })} />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text variant="label" color="textMuted">
                    Issue size
                  </Text>
                  <View style={styles.chips}>
                    {SIZE_PRESETS.map((p) => (
                      <FilterChip key={p.key} label={p.label} selected={sizePreset?.key === p.key} onPress={() => setFilters({ filter_min_issue_cr: p.min, filter_max_issue_cr: p.max })} />
                    ))}
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <Text variant="label" color="textMuted">
                    Sector {filters.filter_sectors ? `(${filters.filter_sectors.length} chosen)` : "(all)"}
                  </Text>
                  <View style={styles.chips}>
                    {FILTER_SECTORS.map((s) => (
                      <FilterChip key={s} label={s} selected={Boolean(filters.filter_sectors?.includes(s))} onPress={() => setFilters({ filter_sectors: toggleSector(filters.filter_sectors, s) })} />
                    ))}
                  </View>
                </View>
                <Text variant="caption" color="textFaint" style={{ lineHeight: 17 }}>
                  IPOs on your watchlist always reach you. If we have not entered an IPO&apos;s sector yet, or its size is not announced, it is still sent so you do not miss it.
                </Text>
                {hasFilters(filters) ? <Button title="Clear filters" size="sm" variant="secondary" onPress={() => setFilters(NO_FILTERS)} /> : null}
              </Card>
            </Section>
            {GROUPS.map((g) => (
              <Section key={g.title} title={g.title}>
                <Card padding={0}>
                  <View style={{ paddingHorizontal: 14 }}>
                    {g.items.map((it, i) => (
                      <PrefRow key={it.key} title={it.title} body={it.body} value={Boolean(prefs[it.key])} onChange={(v) => set(it.key, v)} last={i === g.items.length - 1} />
                    ))}
                  </View>
                </Card>
              </Section>
            ))}
            {update.isError ? (
              <Text variant="caption" color="loss" align="center" style={{ marginTop: 12 }}>
                Couldn&apos;t save — check your connection.
              </Text>
            ) : null}
          </>
        )}
        <View style={{ marginTop: spacing.xl }}>
          <Disclaimer compact />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  permRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
