// SME IPO listing checklist — 6 phases, 32 steps, ticks saved on the device.
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Card, PressableScale, Screen, Text } from "@/components/ui";
import { ScoreBar } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { CHECKLIST, checklistKey, checklistProgress } from "@/features/business/tools";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

const STORAGE_KEY = "ipobell.business.checklist.v1";

export default function ChecklistScreen() {
  const { colors, spacing, radius } = useTheme();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => raw && setDone(JSON.parse(raw) as Record<string, boolean>))
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(done)).catch(() => undefined);
  }, [done, hydrated]);

  const progress = useMemo(() => checklistProgress(done), [done]);
  const toggle = (k: string) => setDone((d) => ({ ...d, [k]: !d[k] }));
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
            Tick items off as you go. Saved on this device.
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
