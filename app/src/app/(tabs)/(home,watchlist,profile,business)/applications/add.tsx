// Add application: pick an IPO, pick PANs (or add one inline), optional application number / lots.
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Button, Divider, EmptyState, ErrorState, IconButton, ListSkeleton, PressableScale, Screen, Text } from "@/components/ui";
import { InvalidPanError, isAutoCheckable, PanLimitError } from "@/features/applications/api";
import { FREE_PAN_LIMIT, useAddApplication, useAddPan, usePans } from "@/features/applications/hooks";
import { isValidPan, maskPan, normalizePan, PAN_CONSENT_TEXT, panInputHint } from "@/features/applications/pan";
import { fetchIpos } from "@/features/ipos/api";
import { boardLabel, CompanyLogo } from "@/features/ipos/components/IpoBits";
import type { IpoListItem } from "@/features/ipos/types";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { dateShort, daysUntil } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

async function fetchCandidates(): Promise<IpoListItem[]> {
  const [open, closed, upcoming] = await Promise.all([fetchIpos("open", { limit: 60 }), fetchIpos("closed", { limit: 60 }), fetchIpos("upcoming", { limit: 60 })]);
  const soon = upcoming.filter((i) => {
    const d = daysUntil(i.open_date);
    return d !== null && d <= 7;
  });
  const recentListed = await fetchIpos("listed", { limit: 20 });
  const listedRecent = recentListed.filter((i) => (daysUntil(i.listing_date) ?? -99) >= -3);
  return [...open, ...closed, ...soon, ...listedRecent];
}

export default function AddApplicationScreen() {
  const { colors, spacing, radius, fonts } = useTheme();
  const params = useLocalSearchParams<{ slug?: string }>();
  const pans = usePans();
  const addPan = useAddPan();
  const addApp = useAddApplication();

  const [search, setSearch] = useState("");
  const [ipo, setIpo] = useState<IpoListItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewPan, setShowNewPan] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPan, setNewPan] = useState("");
  const [appNo, setAppNo] = useState("");
  const [lots, setLots] = useState("");
  const [saving, setSaving] = useState(false);

  const candidates = useQuery({ queryKey: ["application-candidates"], queryFn: fetchCandidates, staleTime: 5 * 60 * 1000 });

  // Derived state (set during render, React's recommended pattern): preselect from ?slug= once candidates load.
  const [appliedSlug, setAppliedSlug] = useState<string | null>(null);
  if (params.slug && candidates.data && appliedSlug !== params.slug) {
    setAppliedSlug(params.slug);
    const hit = candidates.data.find((i) => i.slug === params.slug);
    if (hit && !ipo) setIpo(hit);
  }

  // Preselect the only saved PAN once.
  const [autoSelected, setAutoSelected] = useState(false);
  if (!autoSelected && pans.data && pans.data.length === 1) {
    setAutoSelected(true);
    if (selected.size === 0) setSelected(new Set([pans.data[0].id]));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = candidates.data ?? [];
    const seen = new Set<string>();
    return list.filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return !q || i.name.toLowerCase().includes(q) || (i.display_name ?? "").toLowerCase().includes(q);
    });
  }, [candidates.data, search]);

  const togglePan = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onAddPan = useCallback(async () => {
    const label = newLabel.trim() || `PAN ${(pans.data?.length ?? 0) + 1}`;
    if (!isValidPan(newPan)) {
      Alert.alert("Invalid PAN", "PAN must be 5 letters, 4 digits and 1 letter, e.g. ABCDE1234F.");
      return;
    }
    try {
      const row = await addPan.mutateAsync({ label, pan: normalizePan(newPan) });
      setSelected((prev) => new Set(prev).add(row.id));
      setNewLabel("");
      setNewPan("");
      setShowNewPan(false);
    } catch (e) {
      if (e instanceof PanLimitError) {
        Alert.alert("PAN limit reached", e.message);
      } else if (e instanceof InvalidPanError) Alert.alert("Invalid PAN", e.message);
      else Alert.alert("Couldn't save PAN", e instanceof Error ? e.message : String(e));
    }
  }, [addPan, newLabel, newPan, pans.data?.length]);

  const onSave = useCallback(async () => {
    if (!ipo || selected.size === 0) return;
    setSaving(true);
    const lotsNum = lots.trim() ? Number(lots) : null;
    let failed = 0;
    for (const panId of selected) {
      try {
        await addApp.mutateAsync({ ipoId: ipo.id, panId, applicationNo: appNo.trim() || null, lots: Number.isFinite(lotsNum as number) ? lotsNum : null });
      } catch {
        failed++;
      }
    }
    setSaving(false);
    if (failed === selected.size) {
      Alert.alert("Couldn't save", "Please check your connection and try again.");
      return;
    }
    const auto = isAutoCheckable(ipo.registrar);
    Alert.alert(
      "Added",
      auto
        ? `We'll check ${ipo.display_name ?? ipo.name} on ${dateShort(ipo.allotment_date)} and notify you${selected.size > 1 ? " for each PAN" : ""}.`
        : `${ipo.registrar?.name ?? "This registrar"} needs a manual check. We'll remind you on ${dateShort(ipo.allotment_date)} and open the page with your PAN copied.`,
      [{ text: "OK", onPress: () => (router.canGoBack() ? router.back() : router.replace("/allotment")) }],
    );
  }, [ipo, selected, lots, appNo, addApp]);

  const inputStyle = [styles.input, { borderColor: colors.borderStrong, borderRadius: radius.md, color: colors.text, fontFamily: fonts.regular }];

  // ---------- Step 1: choose IPO ----------
  if (!ipo) {
    return (
      <Screen>
        <PageHeader title="Add application" subtitle="Which IPO did you apply for?" />
        <View style={[styles.searchWrap, { marginHorizontal: spacing.lg, borderColor: colors.borderStrong, borderRadius: radius.md }]}>
          <Ionicons name="search-outline" size={18} color={colors.textFaint} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search open & recent IPOs"
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text, fontFamily: fonts.regular }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? <IconButton icon="close-circle" size={18} color={colors.textFaint} accessibilityLabel="Clear" onPress={() => setSearch("")} /> : null}
        </View>
        {candidates.isLoading ? (
          <ListSkeleton count={5} />
        ) : candidates.isError ? (
          <ErrorState onRetry={() => void candidates.refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search-outline" title="No matching IPO" message="Only IPOs that are open, recently closed or listing in the last few days can be tracked." />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {filtered.map((i) => (
              <PressableScale key={i.id} onPress={() => setIpo(i)} style={[styles.ipoRow, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]} accessibilityRole="button">
                <CompanyLogo uri={i.logo_url} name={i.name} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="title" numberOfLines={1}>
                    {i.display_name ?? i.name}
                  </Text>
                  <Text variant="caption" color="textMuted" numberOfLines={1}>
                    {boardLabel(i.board, i.sub_type)} · Allotment {dateShort(i.allotment_date)}
                    {i.registrar?.name ? ` · ${isAutoCheckable(i.registrar) ? "Auto-check" : "Manual check"}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </PressableScale>
            ))}
          </ScrollView>
        )}
      </Screen>
    );
  }

  // ---------- Step 2: PANs + details ----------
  const panCount = pans.data?.length ?? 0;
  const canSave = selected.size > 0 && !saving;
  return (
    <Screen>
      <PageHeader title="Add application" subtitle={ipo.display_name ?? ipo.name} onBack={() => setIpo(null)} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={[styles.ipoRow, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
            <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title" numberOfLines={1}>
                {ipo.display_name ?? ipo.name}
              </Text>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                Allotment {dateShort(ipo.allotment_date)} · {ipo.registrar?.name ?? "Registrar TBA"}
              </Text>
            </View>
            <Button title="Change" size="sm" variant="ghost" onPress={() => setIpo(null)} />
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
            <Text variant="h3">Applied with</Text>
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              Select every PAN you used. We track each one separately.
            </Text>
          </View>

          <View style={{ marginTop: spacing.md }}>
            {(pans.data ?? []).map((p) => {
              const on = selected.has(p.id);
              return (
                <PressableScale key={p.id} onPress={() => togglePan(p.id)} style={[styles.panRow, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? colors.text : colors.textFaint} />
                  <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                    {p.label}
                  </Text>
                  <Text variant="numSm" color="textMuted" numeric>
                    {maskPan(p.pan_last4)}
                  </Text>
                </PressableScale>
              );
            })}

            {showNewPan ? (
              <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 10 }}>
                <TextInput value={newLabel} onChangeText={setNewLabel} placeholder="Label (e.g. Me, Dad, HUF)" placeholderTextColor={colors.textFaint} style={inputStyle} maxLength={40} />
                <TextInput
                  value={newPan}
                  onChangeText={(t) => setNewPan(normalizePan(t).slice(0, 10))}
                  placeholder="PAN · ABCDE1234F"
                  placeholderTextColor={colors.textFaint}
                  style={inputStyle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                />
                {panInputHint(newPan) ? (
                  <Text variant="caption" color={isValidPan(newPan) ? "gain" : "textMuted"}>
                    {panInputHint(newPan)}
                  </Text>
                ) : null}
                <Text variant="caption" color="textMuted" style={{ lineHeight: 17 }}>
                  {PAN_CONSENT_TEXT}
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button title="Save PAN" size="sm" variant="dark" loading={addPan.isPending} disabled={!isValidPan(newPan)} onPress={() => void onAddPan()} />
                  <Button title="Cancel" size="sm" variant="secondary" onPress={() => setShowNewPan(false)} />
                </View>
              </View>
            ) : (
              <PressableScale onPress={() => setShowNewPan(true)} style={[styles.panRow, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]} accessibilityRole="button">
                <Ionicons name="add-circle-outline" size={22} color={colors.brand} />
                <Text variant="body" color="brand" style={{ flex: 1 }}>
                  Add new PAN
                </Text>
                <Text variant="caption" color="textFaint">
                  {panCount}/{FREE_PAN_LIMIT}
                </Text>
              </PressableScale>
            )}
          </View>

          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: 10 }}>
            <Text variant="h3">Optional</Text>
            <TextInput value={appNo} onChangeText={setAppNo} placeholder="Application number" placeholderTextColor={colors.textFaint} style={inputStyle} autoCapitalize="characters" autoCorrect={false} />
            <TextInput value={lots} onChangeText={(t) => setLots(t.replace(/[^0-9]/g, ""))} placeholder="Lots applied" placeholderTextColor={colors.textFaint} style={inputStyle} keyboardType="number-pad" />
            <Text variant="caption" color="textFaint">
              Not required for the check; shown on your tracker for reference.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={[styles.footer, { paddingHorizontal: spacing.lg, borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Divider />
        <Button title={selected.size > 1 ? `Track ${selected.size} applications` : "Track application"} variant="dark" size="lg" fullWidth loading={saving} disabled={!canSave} onPress={() => void onSave()} style={{ marginTop: 12 }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingLeft: 12, borderWidth: 1, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 15, height: 44 },
  ipoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  panRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { height: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  footer: { paddingBottom: 12 },
});
