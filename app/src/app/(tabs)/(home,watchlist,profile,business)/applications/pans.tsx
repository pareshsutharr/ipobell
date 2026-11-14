// Saved PANs — add, rename, delete. PANs are stored encrypted; only the last 4 digits come back.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Button, Card, EmptyState, ErrorState, IconButton, ListSkeleton, PressableScale, Screen, Text } from "@/components/ui";
import { InvalidPanError, PanLimitError, type UserPan } from "@/features/applications/api";
import { FREE_PAN_LIMIT, useAddPan, useDeletePan, usePans, useRenamePan } from "@/features/applications/hooks";
import { isValidPan, maskPan, normalizePan, panInputHint } from "@/features/applications/pan";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { dateShort } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function SavedPansScreen() {
  const { colors, spacing, radius, fonts } = useTheme();
  const pans = usePans();
  const addPan = useAddPan();
  const renamePan = useRenamePan();
  const deletePan = useDeletePan();

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [pan, setPan] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const inputStyle = [styles.input, { borderColor: colors.borderStrong, borderRadius: radius.md, color: colors.text, fontFamily: fonts.regular }];
  const count = pans.data?.length ?? 0;
  const atLimit = count >= FREE_PAN_LIMIT;

  const onAdd = useCallback(async () => {
    if (!isValidPan(pan)) {
      Alert.alert("Invalid PAN", "PAN must be 5 letters, 4 digits and 1 letter, e.g. ABCDE1234F.");
      return;
    }
    try {
      await addPan.mutateAsync({ label: label.trim() || `PAN ${count + 1}`, pan: normalizePan(pan) });
      setLabel("");
      setPan("");
      setAdding(false);
    } catch (e) {
      if (e instanceof PanLimitError) {
        Alert.alert("PAN limit reached", e.message);
      } else if (e instanceof InvalidPanError) Alert.alert("Invalid PAN", e.message);
      else Alert.alert("Couldn't save PAN", e instanceof Error ? e.message : String(e));
    }
  }, [addPan, label, pan, count]);

  const startEdit = (p: UserPan) => {
    setEditingId(p.id);
    setEditLabel(p.label);
  };

  const commitEdit = useCallback(async () => {
    if (!editingId) return;
    const next = editLabel.trim();
    if (next) await renamePan.mutateAsync({ id: editingId, label: next }).catch((e) => Alert.alert("Couldn't rename", e instanceof Error ? e.message : String(e)));
    setEditingId(null);
  }, [editingId, editLabel, renamePan]);

  const confirmDelete = (p: UserPan) => {
    Alert.alert("Remove PAN?", `${p.label} (${maskPan(p.pan_last4)}) and any applications tracked with it will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => deletePan.mutate(p.id) },
    ]);
  };

  return (
    <Screen>
      <PageHeader title="Saved PANs" subtitle={`${count} of ${FREE_PAN_LIMIT} slots`} right={!adding ? <IconButton icon="add" size={26} accessibilityLabel="Add PAN" onPress={() => setAdding(true)} /> : undefined} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {adding ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            <Card variant="alt">
              <Text variant="title">New PAN</Text>
              <View style={{ gap: 10, marginTop: 12 }}>
                <TextInput value={label} onChangeText={setLabel} placeholder="Label (e.g. Me, Dad, HUF)" placeholderTextColor={colors.textFaint} style={inputStyle} maxLength={40} autoFocus />
                <TextInput
                  value={pan}
                  onChangeText={(t) => setPan(normalizePan(t).slice(0, 10))}
                  placeholder="PAN · ABCDE1234F"
                  placeholderTextColor={colors.textFaint}
                  style={inputStyle}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={10}
                />
                {panInputHint(pan) ? (
                  <Text variant="caption" color={isValidPan(pan) ? "gain" : "textMuted"}>
                    {panInputHint(pan)}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Button title="Save" size="sm" variant="dark" loading={addPan.isPending} disabled={!isValidPan(pan) || atLimit} onPress={() => void onAdd()} />
                  <Button title="Cancel" size="sm" variant="secondary" onPress={() => setAdding(false)} />
                </View>
                {atLimit ? (
                  <Text variant="caption" color="warning">
                    You can save up to {FREE_PAN_LIMIT} PANs. Remove one to add another.
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        ) : null}

        {pans.isLoading ? (
          <ListSkeleton count={3} />
        ) : pans.isError ? (
          <ErrorState onRetry={() => void pans.refetch()} />
        ) : count === 0 && !adding ? (
          <EmptyState icon="key-outline" title="No PANs saved" message="Save the PANs you apply with to track allotment automatically." actionLabel="Add PAN" onAction={() => setAdding(true)} />
        ) : (
          (pans.data ?? []).map((p) => (
            <View key={p.id} style={[styles.row, { paddingHorizontal: spacing.lg, borderBottomColor: colors.border }]}>
              <Ionicons name="key-outline" size={20} color={colors.textMuted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                {editingId === p.id ? (
                  <TextInput
                    value={editLabel}
                    onChangeText={setEditLabel}
                    onBlur={() => void commitEdit()}
                    onSubmitEditing={() => void commitEdit()}
                    autoFocus
                    maxLength={40}
                    returnKeyType="done"
                    style={[styles.inlineInput, { color: colors.text, fontFamily: fonts.medium, borderBottomColor: colors.borderStrong }]}
                  />
                ) : (
                  <Text variant="title" numberOfLines={1}>
                    {p.label}
                  </Text>
                )}
                <Text variant="caption" color="textMuted" numeric>
                  {maskPan(p.pan_last4)} · Added {dateShort(p.created_at.slice(0, 10))}
                </Text>
              </View>
              {editingId === p.id ? (
                <IconButton icon="checkmark" accessibilityLabel="Save label" onPress={() => void commitEdit()} />
              ) : (
                <>
                  <IconButton icon="pencil-outline" size={18} color={colors.textMuted} accessibilityLabel={`Rename ${p.label}`} onPress={() => startEdit(p)} />
                  <IconButton icon="trash-outline" size={18} color={colors.loss} accessibilityLabel={`Remove ${p.label}`} onPress={() => confirmDelete(p)} />
                </>
              )}
            </View>
          ))
        )}

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: 8 }}>
          <PressableScale onPress={() => router.push("/applications/add")} style={[styles.cta, { borderColor: colors.borderStrong, borderRadius: radius.md }]} accessibilityRole="button">
            <Ionicons name="ribbon-outline" size={18} color={colors.text} />
            <Text variant="label" style={{ flex: 1 }}>
              Track an IPO application
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
          </PressableScale>
          <Text variant="caption" color="textFaint">
            {"PANs are encrypted on our servers and used only to look up allotment status on the registrar's public service for IPOs you add. Remove a PAN any time."}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { height: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  inlineInput: { fontSize: 15, paddingVertical: 2, borderBottomWidth: 1 },
  cta: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderWidth: 1 },
});
