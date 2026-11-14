// Growth analysis for the Business view: revenue and profit CAGR over the company's full financial years,
// the year-by-year figures behind them, and one plain sentence. Computed from the reported financials
// (features/ipos/growth.ts); nothing is estimated.
import React from "react";
import { StyleSheet, View } from "react-native";

import { Section, Stat, Text } from "@/components/ui";
import { analyseGrowth, cagrNote, growthSentence, yoy, type Cagr } from "@/features/ipos/growth";
import { useFinancials } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { pct } from "@/lib/format";
import { useSignedColor, useTheme } from "@/lib/theme/ThemeProvider";

const amount = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

function CagrStat({ label, c, what }: { label: string; c: Cagr; what: "revenue" | "profit" }) {
  const signed = useSignedColor();
  const note = cagrNote(c, what);
  return (
    <View style={{ flex: 1 }}>
      <Stat label={label} value={c.value === null ? "—" : `${pct(c.value, { sign: true, decimals: 1 })} a year`} valueColor={c.value === null ? undefined : signed(c.value)} sub={note ?? `Over ${c.years} ${c.years === 1 ? "year" : "years"}`} />
    </View>
  );
}

export function GrowthSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const signed = useSignedColor();
  const { data: rows } = useFinancials(ipo.id);
  const a = analyseGrowth(rows);
  // One full year or none: there is no growth to describe, and the financials table below already shows the figures.
  if (a.points.length < 2) return null;
  const sentence = growthSentence(a);
  const unit = (ipo.financials?.unit ?? "₹ crore").replace(/^Rs\.?\s*/i, "₹ ");

  return (
    <Section title="Growth analysis" subtitle={a.span ? `Full financial years, ${a.span}` : "Full financial years"}>
      <View style={styles.stats}>
        <CagrStat label="Revenue growth" c={a.revenue} what="revenue" />
        <CagrStat label="Profit growth" c={a.profit} what="profit" />
      </View>
      {sentence ? (
        <Text variant="bodySm" style={{ marginTop: 14, lineHeight: 20 }}>
          {sentence}
        </Text>
      ) : null}

      <View style={[styles.table, { borderTopColor: colors.border }]}>
        <View style={styles.tr}>
          <Text variant="caption" color="textFaint" style={styles.yearCol}>
            Year
          </Text>
          <Text variant="caption" color="textFaint" style={styles.numCol}>
            Revenue
          </Text>
          <Text variant="caption" color="textFaint" style={styles.numCol}>
            Profit
          </Text>
          <Text variant="caption" color="textFaint" style={styles.numCol}>
            Margin
          </Text>
        </View>
        {a.points.map((p, i) => {
          const prev = i > 0 ? a.points[i - 1] : null;
          const rev = prev ? yoy(prev.revenue, p.revenue) : null;
          const prof = prev ? yoy(prev.profit, p.profit) : null;
          return (
            <View key={`${p.period}-${i}`} style={[styles.tr, styles.dataRow, { borderTopColor: colors.border }]}>
              <Text variant="bodySm" style={styles.yearCol}>
                {p.year ? `FY${String(p.year % 100).padStart(2, "0")}` : p.period}
              </Text>
              <View style={styles.numCol}>
                <Text variant="numSm" numeric>
                  {amount(p.revenue)}
                </Text>
                {rev !== null ? (
                  <Text variant="caption" color={signed(rev)} numeric>
                    {pct(rev, { sign: true, decimals: 1 })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.numCol}>
                <Text variant="numSm" numeric color={p.profit !== null && p.profit < 0 ? colors.loss : colors.text}>
                  {amount(p.profit)}
                </Text>
                {prof !== null ? (
                  <Text variant="caption" color={signed(prof)} numeric>
                    {pct(prof, { sign: true, decimals: 1 })}
                  </Text>
                ) : null}
              </View>
              <Text variant="numSm" numeric style={styles.numCol}>
                {p.margin === null ? "—" : `${p.margin}%`}
              </Text>
            </View>
          );
        })}
      </View>
      <Text variant="caption" color="textFaint" style={{ marginTop: 10, lineHeight: 17 }}>
        {`Figures in ${unit}, as reported in the offer document. Growth is the compound yearly rate between the first and last full year; part-year results are left out. Past growth says nothing certain about the future.`}
      </Text>
    </Section>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 12 },
  table: { marginTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  tr: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  dataRow: { borderTopWidth: StyleSheet.hairlineWidth },
  yearCol: { width: 56 },
  numCol: { flex: 1, alignItems: "flex-end", textAlign: "right" },
});
