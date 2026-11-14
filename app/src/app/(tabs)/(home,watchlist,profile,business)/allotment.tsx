// "Allotment" tab — save PANs, attach them to IPO applications, and let the server check the registrar.
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, SectionList, StyleSheet, View } from "react-native";

import { Button, Card, Disclaimer, EmptyState, ErrorState, IconButton, ListSkeleton, PressableScale, Screen, Section, Text } from "@/components/ui";
import { findRegistrar } from "@/features/allotment/registrars";
import { isAutoCheckable, type ApplicationStatus, type IpoApplication } from "@/features/applications/api";
import { useApplications, useApplicationsRealtime, useDeleteApplication, usePans } from "@/features/applications/hooks";
import { maskPan } from "@/features/applications/pan";
import { boardLabel, CompanyLogo } from "@/features/ipos/components/IpoBits";
import type { Registrar } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { useUserId } from "@/lib/auth/hooks";
import { dateShort, daysUntil, timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

function registrarUrl(r: Registrar | null | undefined): string | null {
  if (r?.status_page) return r.status_page;
  if (r?.website) return r.website;
  return findRegistrar(r?.driver ?? r?.name)?.url ?? null;
}

function registrarShort(r: Registrar | null | undefined): string {
  return findRegistrar(r?.driver ?? r?.name)?.short ?? r?.name ?? "Registrar";
}


interface Group {
  key: string;
  ipo: NonNullable<IpoApplication["ipo"]>;
  data: IpoApplication[];
}

function statusView(a: IpoApplication, colors: ReturnType<typeof useTheme>["colors"]): { text: string; color: string; sub?: string } {
  const allot = a.ipo?.allotment_date ?? null;
  const d = daysUntil(allot);
  switch (a.status as ApplicationStatus) {
    case "allotted":
      return { text: a.shares_allotted ? `Allotted · ${a.shares_allotted} shares` : "Allotted", color: colors.gain, sub: a.last_checked_at ? `Checked ${timeAgo(a.last_checked_at)}` : undefined };
    case "partial":
      return { text: a.shares_allotted ? `Partially allotted · ${a.shares_allotted} shares` : "Partially allotted", color: colors.warning, sub: a.last_checked_at ? `Checked ${timeAgo(a.last_checked_at)}` : undefined };
    case "not_allotted":
      return { text: "Not allotted", color: colors.loss, sub: a.last_checked_at ? `Checked ${timeAgo(a.last_checked_at)}` : undefined };
    case "not_found":
      return { text: "No record yet", color: colors.textMuted, sub: "We'll keep checking" };
    case "manual":
      return { text: `Check on ${registrarShort(a.ipo?.registrar)}`, color: colors.brand, sub: "Tap to open with your PAN copied" };
    case "error":
      return { text: "Retry", color: colors.warning, sub: a.last_error ? a.last_error.slice(0, 60) : "Last check failed" };
    default:
      if (!isAutoCheckable(a.ipo?.registrar)) return { text: `Check on ${registrarShort(a.ipo?.registrar)}`, color: colors.brand, sub: "Manual check only for this registrar" };
      if (d !== null && d > 0) return { text: `Checking from ${dateShort(allot)}`, color: colors.textMuted };
      return { text: "Checking…", color: colors.textMuted, sub: a.last_checked_at ? `Last ${timeAgo(a.last_checked_at)}` : "Starts on allotment day" };
  }
}

export default function MyIposScreen() {
  const { colors, spacing } = useTheme();
  const userId = useUserId();
  const pans = usePans();
  const apps = useApplications();
  const refetchApps = apps.refetch;
  // refresh when returning from the in-app checker (refetch is referentially stable → no loop)
  useFocusEffect(
    useCallback(() => {
      void refetchApps();
    }, [refetchApps]),
  );
  useApplicationsRealtime(userId);
  const remove = useDeleteApplication();
  const [helpOpen, setHelpOpen] = useState(false);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of apps.data ?? []) {
      if (!a.ipo) continue;
      const g = map.get(a.ipo.id) ?? { key: a.ipo.id, ipo: a.ipo, data: [] };
      g.data.push(a);
      map.set(a.ipo.id, g);
    }
    // soonest allotment first
    return [...map.values()].sort((x, y) => (x.ipo.allotment_date ?? "9999").localeCompare(y.ipo.allotment_date ?? "9999"));
  }, [apps.data]);

  const panLabel = useCallback(
    (panId: string) => {
      const p = pans.data?.find((x) => x.id === panId);
      return p ? `${p.label} · ${maskPan(p.pan_last4)}` : "PAN";
    },
    [pans.data],
  );

  // Assisted check: registrar page inside the app with IPO + PAN prefilled; the user only solves the CAPTCHA.
  const openRegistrar = useCallback(async (a: IpoApplication) => {
    const url = registrarUrl(a.ipo?.registrar);
    if (!url) {
      Alert.alert("Registrar page unavailable", "The registrar hasn't published a status page for this IPO yet.");
      return;
    }
    router.push({ pathname: "/applications/check", params: { application_id: a.id } });
  }, []);



  const onRowPress = useCallback(
    (a: IpoApplication) => {
      void openRegistrar(a);
    },
    [openRegistrar],
  );

  const noPans = pans.isSuccess && (pans.data?.length ?? 0) === 0;
  const loading = (apps.isLoading && !apps.data) || (pans.isLoading && !pans.data);

  const header = (
    <View>
      {noPans ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
          <Card variant="alt">
            <Text variant="title">Save your PAN once</Text>
            <Text variant="bodySm" color="textMuted" style={{ marginTop: 4 }}>
              Add the PANs you apply with. On allotment day we check the registrar for you and notify you the moment a result is out.
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Button title="Add PAN" size="sm" variant="dark" icon="key-outline" onPress={() => router.push("/applications/pans")} />
              <Button title="How it works" size="sm" variant="secondary" onPress={() => setHelpOpen(true)} />
            </View>
          </Card>
        </View>
      ) : null}
      {!noPans && groups.length === 0 && !loading ? (
        <EmptyState icon="ribbon-outline" title="No applications yet" message="Add the IPOs you applied for and we'll track allotment for every PAN." actionLabel="Add application" onAction={() => router.push("/applications/add")} />
      ) : null}
    </View>
  );

  const footer = (
    <View>

      <Section title="How it works">
        <PressableScale onPress={() => setHelpOpen((v) => !v)} style={styles.helpHeader} accessibilityRole="button" accessibilityState={{ expanded: helpOpen }}>
          <Text variant="title" style={{ flex: 1 }}>
            Automatic checks and manual lookups
          </Text>
          <Ionicons name={helpOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textFaint} />
        </PressableScale>
        {helpOpen ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            {[
              ["Automatic", "For IPOs handled by MUFG Intime (Link Intime), Bigshare and Maashitla we query the registrar's public status service with your PAN from allotment day, every 20 minutes, until a result is found."],
              ["Manual", "KFintech and a few smaller registrars use a CAPTCHA, so we open their page and copy your PAN to the clipboard for you."],
              ["Application number", "Optional. Found in the ASBA / UPI mandate confirmation from your bank or broker."],
              ["Privacy", "PANs are stored encrypted and only used for these lookups. Remove them any time from Saved PANs."],
            ].map(([title, body]) => (
              <View key={title} style={{ gap: 2 }}>
                <Text variant="label">{title}</Text>
                <Text variant="bodySm" color="textMuted">
                  {body}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        {"Allotment results come from the registrar's public status service and may lag the official basis of allotment."}
      </Text>
      <Disclaimer compact />
    </View>
  );

  return (
    <Screen>
      <PageHeader
        title="Allotment"
        subtitle="Check IPO allotment with your PAN"
        right={
          <View style={{ flexDirection: "row" }}>
            <IconButton icon="key-outline" accessibilityLabel="Saved PANs" onPress={() => router.push("/applications/pans")} />
            <IconButton icon="add" size={26} accessibilityLabel="Add application" onPress={() => router.push("/applications/add")} />
          </View>
        }
      />
      {loading ? (
        <ListSkeleton count={4} />
      ) : apps.isError && !apps.data ? (
        <ErrorState onRetry={() => void apps.refetch()} />
      ) : (
        <SectionList
          sections={groups}
          keyExtractor={(a) => a.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          refreshControl={<RefreshControl refreshing={apps.isRefetching} onRefresh={() => void apps.refetch()} tintColor={colors.textMuted} />}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderSectionHeader={({ section }) => {
            const ipo = (section as Group).ipo;
            const reg = registrarShort(ipo.registrar);
            return (
              <PressableScale
                onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: ipo.slug } })}
                style={[styles.groupHeader, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}
                accessibilityRole="button"
              >
                <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="title" numberOfLines={1}>
                    {ipo.display_name ?? ipo.name}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {boardLabel(ipo.board, ipo.sub_type)} · Allotment {dateShort(ipo.allotment_date)} · Listing {dateShort(ipo.listing_date)} · {reg}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </PressableScale>
            );
          }}
          renderItem={({ item }) => {
            const s = statusView(item, colors);
            return (
              <PressableScale onPress={() => onRowPress(item)} style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]} accessibilityRole="button">
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" numberOfLines={1}>
                    {panLabel(item.pan_id)}
                  </Text>
                  {item.application_no ? (
                    <Text variant="caption" color="textFaint" numberOfLines={1}>
                      App no. {item.application_no}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: "55%" }}>
                  <Text variant="label" color={s.color} numberOfLines={1} align="right">
                    {s.text}
                  </Text>
                  {s.sub ? (
                    <Text variant="caption" color="textFaint" numberOfLines={1} align="right">
                      {s.sub}
                    </Text>
                  ) : null}
                </View>
                <IconButton
                  icon="trash-outline"
                  size={18}
                  color={colors.textFaint}
                  accessibilityLabel="Remove application"
                  style={{ width: 32, height: 32 }}
                  onPress={() =>
                    Alert.alert("Remove application?", `${panLabel(item.pan_id)} · ${item.ipo?.display_name ?? item.ipo?.name ?? ""}`, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Remove", style: "destructive", onPress: () => remove.mutate(item.id) },
                    ])
                  }
                />
              </PressableScale>
            );
          }}
          renderSectionFooter={() => <View style={{ height: spacing.md }} />}
        />
      )}
    </Screen>
  );
}


const styles = StyleSheet.create({
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 68, borderBottomWidth: StyleSheet.hairlineWidth },
  grid: { gap: 0 },
  registrar: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  helpHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
});
