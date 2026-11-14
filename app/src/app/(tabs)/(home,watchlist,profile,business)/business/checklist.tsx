// SME IPO listing checklist — 6 phases, 32 steps. Ticks are saved on the phone and, when there is a session,
// to the account (public.checklist_progress) so they follow the user to another device.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Card, PressableScale, Screen, Text } from "@/components/ui";
import { decideOnOpen, parseLocal, sameDone, type Done } from "@/features/business/checklistSync";
import { ScoreBar } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { CHECKLIST, checklistKey, checklistProgress } from "@/features/business/tools";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { useAuth } from "@/lib/auth/store";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme/ThemeProvider";

const STORAGE_KEY = "ipobell.business.checklist.v1";
const SAVE_DELAY_MS = 1200;

type SyncState = "local" | "saving" | "saved" | "failed";

export default function ChecklistScreen() {
  const { colors, spacing, radius } = useTheme();
  const [done, setDone] = useState<Done>({});
  const [hydrated, setHydrated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sync, setSync] = useState<SyncState>("local");
  const userId = useAuth((s) => s.user?.id ?? null);
  const isGuest = useAuth((s) => Boolean(s.user?.is_anonymous));
  const doneRef = useRef<Done>({});
  useEffect(() => {
    doneRef.current = done;
  }, [done]);

  // Open: read the phone's copy, then the account's copy, and decide which one to show (see decideOnOpen).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = parseLocal(await AsyncStorage.getItem(STORAGE_KEY).catch(() => null));
      let remote: unknown | null | undefined = undefined;
      if (userId) {
        const { data, error } = await supabase.from("checklist_progress").select("done").eq("user_id", userId).maybeSingle();
        if (!error) remote = data ? (data as { done: unknown }).done : null;
      }
      if (cancelled) return;
      const decision = decideOnOpen(local, remote);
      setDone(decision.done);
      setDirty(decision.push);
      if (remote !== undefined && !decision.push) setSync("saved");
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Every change is written to the phone at once.
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ done, dirty })).catch(() => undefined);
  }, [done, dirty, hydrated]);

  // ...and to the account shortly after the last tap. A failed save stays "dirty" and is retried on the next change or open.
  useEffect(() => {
    if (!hydrated || !dirty || !userId) return;
    const t = setTimeout(() => {
      const snapshot = done;
      setSync("saving");
      supabase
        .from("checklist_progress")
        .upsert({ user_id: userId, done: snapshot }, { onConflict: "user_id" })
        .then(({ error }) => {
          if (error) return setSync("failed");
          setSync("saved");
          setDirty((d) => (sameDone(snapshot, doneRef.current) ? false : d));
        });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [done, dirty, hydrated, userId]);

  const progress = useMemo(() => checklistProgress(done), [done]);
  const toggle = (k: string) => {
    setDone((d) => {
      const next = { ...d };
      if (next[k]) delete next[k];
      else next[k] = true;
      return next;
    });
    setDirty(true);
  };
  const savedNote = !userId
    ? "Tick items off as you go. Saved on this device."
    : sync === "failed"
      ? "Saved on this device. We could not reach your account; it will be retried."
      : isGuest
        ? "Tick items off as you go. Saved on this device. Sign in to keep your progress across devices."
        : "Tick items off as you go. Saved to your account, so it follows you to another device.";
  useEffect(() => {
    trackTool("checklist", "start");
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const p = checklistProgress(done);
    if (p.done === 0) return;
    const t = setTimeout(() => trackTool("checklist", "complete", { done: p.done, total: p.total, percent: p.percent }), 1500);
    return () => clearTimeout(t);
  }, [done, hydrated]);

  return (
    <Screen>
      <PageHeader title="SME IPO checklist" subtitle="Eligibility to post-listing, in order" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <Text variant="h3">Your progress</Text>
            <Text variant="numMd" numeric>
              {progress.done} / {progress.total}
            </Text>
          </View>
          <ScoreBar percent={progress.percent} height={10} />
          <Text variant="caption" color="textMuted">
            {savedNote}
          </Text>
        </Card>

        {CHECKLIST.map((phase, pi) => {
          const ph = progress.byPhase[pi];
          return (
            <View key={phase.key} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.phaseNo, { backgroundColor: ph.done === ph.total ? colors.gainSoft : colors.surfaceAlt }]}>
                  <Text variant="label" color={ph.done === ph.total ? "gain" : "textMuted"} numeric>
                    {pi + 1}
                  </Text>
                </View>
                <Text variant="h3" style={{ flex: 1 }}>
                  {phase.title}
                </Text>
                <Text variant="caption" color="textFaint" numeric>
                  {ph.done}/{ph.total}
                </Text>
              </View>
              <Card padding={0}>
                {phase.items.map((item, i) => {
                  const k = checklistKey(phase.key, i);
                  const checked = Boolean(done[k]);
                  return (
                    <PressableScale key={k} onPress={() => toggle(k)} accessibilityRole="checkbox" accessibilityState={{ checked }} scaleTo={0.995} style={[styles.item, i < phase.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <Ionicons name={checked ? "checkbox" : "square-outline"} size={22} color={checked ? colors.gain : colors.textFaint} />
                      <Text variant="bodySm" color={checked ? "textMuted" : "text"} style={[{ flex: 1 }, checked && { textDecorationLine: "line-through" }]}>
                        {item}
                      </Text>
                    </PressableScale>
                  );
                })}
              </Card>
            </View>
          );
        })}

        <LeadForm
          source="sme-ipo-checklist"
          title="Get the checklist by email"
          subtitle="We'll send the full checklist to work through with your team, and can walk you through the steps you haven't ticked."
          cta="Email me the checklist"
          message={`Requested the SME IPO Listing Checklist (self-assessed progress: ${progress.done}/${progress.total}).`}
          payload={{ Progress: `${progress.done}/${progress.total}`, ...Object.fromEntries(progress.byPhase.map((p) => [p.title, `${p.done}/${p.total} done`])) }}
        />
        <Text variant="caption" color="textFaint" style={{ borderRadius: radius.sm }}>
          Criteria and process steps change with SEBI and exchange circulars. Treat this as a map, not the regulation.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  phaseNo: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
});
