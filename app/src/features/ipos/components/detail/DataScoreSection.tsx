// Data score on the IPO page: four reported figures, the points each earns and the full table used.
// Shown only while the `data_score` feature switch is on (held for legal review). See features/ipos/dataScore.ts.
import React from "react";
import { StyleSheet, View } from "react-native";

import { Section, Text } from "@/components/ui";
import { useFeatureSwitches } from "@/features/flags/useFeatureSwitches";
import { computeDataScore, DATA_SCORE_LABEL, DATA_SCORE_NOTE, scoreInputs, scoreText } from "@/features/ipos/dataScore";
import { useFinancials } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function DataScoreSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const switches = useFeatureSwitches();
  const { data: rows } = useFinancials(ipo.id);
  if (!switches.dataScore) return null;
  const score = computeDataScore(scoreInputs(ipo, rows));
  // Nothing reported at all: the financials section already says so.
  if (score.available === 0) return null;

  return (
    <Section title={DATA_SCORE_LABEL} subtitle="Arithmetic on reported figures. Not a rating or a recommendation.">
      {score.enough ? (
        <View style={styles.total}>
          <Text variant="display" numeric>
            {scoreText(score)}
          </Text>
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {score.missing.length ? `points. Not specified: ${score.missing.join(", ")}, so the total is out of ${score.max}.` : "points, from the four figures below."}
          </Text>
        </View>
      ) : (
        <Text variant="bodySm" color="textMuted">
          No total is shown: fewer than three of the four figures are reported for this company.
        </Text>
      )}

      <View style={[styles.table, { borderTopColor: colors.border }]}>
        {score.parts.map((p) => (
          <View key={p.key} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={styles.rowHead}>
              <Text variant="title" style={{ flex: 1 }}>
                {p.title}
              </Text>
              <Text variant="title" numeric color={p.points === null ? "textFaint" : "text"}>
                {p.points === null ? "Not specified" : `${p.points} of ${p.max}`}
              </Text>
            </View>
            <Text variant="bodySm" color="textMuted" style={{ marginTop: 2 }}>
              {p.figure}: {p.valueText}
              {p.source ? ` (${p.source})` : ""}
            </Text>
            <Text variant="caption" color="textFaint" style={{ marginTop: 4, lineHeight: 16 }}>
              {p.bands}
            </Text>
          </View>
        ))}
      </View>

      <Text variant="caption" color="textFaint" style={{ marginTop: 12, lineHeight: 17 }}>
        {DATA_SCORE_NOTE}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  table: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: 12 },
});
