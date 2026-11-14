// Issue cost estimator — every line item as a share of issue size, plus the stage-wise payment schedule.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Card, Screen, Text } from "@/components/ui";
import { Field, NumberField, ScoreBar } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { calcIssueCost, formatCrLakh } from "@/features/business/tools";
import { useBusinessRules } from "@/features/business/useBusinessRules";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function IssueCostScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ size?: string }>();
  const initial = params.size && Number(params.size) > 0 ? params.size : "";
  const [sizeText, setSizeText] = useState(initial);
  const [size, setSize] = useState<number | null>(initial ? Number(initial) : null);
  const rules = useBusinessRules();
  const result = useMemo(() => (size !== null ? calcIssueCost(size, rules.issueCost) : null), [size, rules.issueCost]);
  useEffect(() => {
    trackTool("issue_cost", "start");
  }, []);
  useEffect(() => {
    if (!result || size === null) return;
    const t = setTimeout(() => trackTool("issue_cost", "complete", { issue_size_cr: size, total_cr: result.totalCr }), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  return (
    <Screen>
      <PageHeader title="Issue cost estimator" subtitle="What does an SME IPO cost?" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Planned issue size" hint="Not sure? Use the Issue Size Calculator first." required>
          <NumberField value={sizeText} onChange={(t, n) => { setSizeText(t); setSize(n); }} placeholder="e.g. 20" />
        </Field>

        {result ? (
          <Animated.View entering={FadeInDown.springify().damping(16)} style={{ gap: spacing.lg }}>
            <Card variant="primary" style={{ gap: 6 }}>
              <Text variant="overline" color="textFaint">
                Indicative total cost
              </Text>
              <Text variant="display" numeric>
                {formatCrLakh(result.totalCr)}
              </Text>
              <Text variant="bodySm" color="textMuted">
                About {result.totalPct.toFixed(0)}% of a {formatCrLakh(result.issueSizeCr)} issue. Issue expenses are normally met from the proceeds; selling shareholders bear their share.
              </Text>
            </Card>

            <View style={{ gap: 10 }}>
              <Text variant="overline" color="textFaint">
                Where the money goes
              </Text>
              <Card padding={0} style={{ paddingHorizontal: 14 }}>
                {result.items.map((it, i) => (
                  <View key={it.label} style={[styles.row, i < result.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodySm">{it.label}</Text>
                        {it.hint ? (
                          <Text variant="caption" color="textFaint">
                            {it.hint}
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text variant="numSm" numeric>
                          {formatCrLakh(it.amountCr)}
                        </Text>
                        <Text variant="caption" color="textFaint" numeric>
                          {it.pct.toFixed(2)}%
                        </Text>
                      </View>
                    </View>
                    <ScoreBar percent={(it.pct / result.totalPct) * 100} tone={i === 0 ? "primary" : "neutral"} height={4} />
                  </View>
                ))}
              </Card>
            </View>

            <View style={{ gap: 10 }}>
              <Text variant="overline" color="textFaint">
                When it is paid
              </Text>
              <Card padding={0} style={{ paddingHorizontal: 14 }}>
                {result.stages.map((s, i) => (
                  <View key={s.label} style={[styles.stage, i < result.stages.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <View style={[styles.dot, { backgroundColor: i === result.stages.length - 1 ? colors.primary : colors.borderStrong }]} />
                    <Text variant="bodySm" style={{ flex: 1 }}>
                      {s.label}
                    </Text>
                    <Text variant="numSm" numeric>
                      {formatCrLakh(s.amountCr)}
                    </Text>
                    <Text variant="caption" color="textFaint" numeric style={{ width: 44, textAlign: "right" }}>
                      {s.pct.toFixed(0)}%
                    </Text>
                  </View>
                ))}
              </Card>
              <Text variant="caption" color="textFaint">
                Roughly {result.stages[result.stages.length - 1].pct.toFixed(0)}% falls due on completion, so most of the cost comes out of the money you raise.
              </Text>
            </View>

            <LeadForm
              source="issue-cost-estimator"
              title="Get a line-by-line budget"
              subtitle="Costs vary with the intermediaries you choose, restructuring and audit needs, and marketing spend. We'll build a budget for your issue and show where to save."
              cta="Send me a cost budget"
              message={`Issue cost estimate requested for issue size ₹${size} Cr (indicative total ${formatCrLakh(result.totalCr)}).`}
              payload={{ "Planned issue size (₹ Cr)": size, "Estimated total cost": formatCrLakh(result.totalCr), "Estimated cost % of issue": `${result.totalPct.toFixed(2)}%` }}
            />
          </Animated.View>
        ) : (
          <Card variant="alt" style={styles.empty}>
            <Ionicons name="receipt-outline" size={28} color={colors.textFaint} />
            <Text variant="bodySm" color="textMuted" align="center">
              Enter a planned issue size to see the full cost breakdown.
            </Text>
          </Card>
        )}

        <Text variant="caption" color="textFaint">
          Three ways to control cost: complete audits and compliance early, compare lead manager proposals line by line, and size the issue to genuine business needs. Figures are a budgeting starting point, not a quote.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10, gap: 8 },
  stage: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { alignItems: "center", gap: 10, paddingVertical: 28 },
});
