import React, { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Section, Stat, Text } from "@/components/ui";
import { useFinancials } from "@/features/ipos/hooks";
import type { Ipo } from "@/features/ipos/types";
import { useTheme } from "@/lib/theme/ThemeProvider";

const METRIC_W = 132;
const COL_W = 88;

function fmtCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function FinancialsSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const hasJson = Boolean(ipo.financials?.headers?.length && ipo.financials?.rows?.length);
  const { data: rows } = useFinancials(hasJson ? undefined : ipo.id);

  const table = useMemo(() => {
    if (hasJson) return { headers: ipo.financials.headers ?? [], rows: ipo.financials.rows ?? [], unit: ipo.financials.unit ?? "₹ crore" };
    if (!rows || !rows.length) return null;
    const metrics: { key: keyof (typeof rows)[number]; label: string }[] = [
      { key: "revenue", label: "Revenue" },
      { key: "total_income", label: "Total income" },
      { key: "profit", label: "Profit after tax" },
      { key: "net_worth", label: "Net worth" },
      { key: "total_assets", label: "Total assets" },
      { key: "total_borrowing", label: "Total borrowing" },
    ];
    return {
      headers: rows.map((r) => r.period),
      rows: metrics.filter((m) => rows.some((r) => r[m.key] !== null)).map((m) => ({ metric: m.label, data: rows.map((r) => r[m.key] as number | null) })),
      unit: "₹ crore",
    };
  }, [hasJson, ipo.financials, rows]);

  const kpis = ipo.kpis ?? [];
  if (!table && kpis.length === 0) return null;
  const unit = table ? table.unit.replace(/^Rs\.?\s*/i, "₹ ") : null;

  return (
    <Section title="Financials" subtitle={unit ? `Restated consolidated · ${unit}` : undefined}>
      {kpis.length ? (
        <View style={styles.kpis}>
          {kpis.map((k) => (
            <View key={k.key} style={styles.kpi}>
              <Stat label={k.label} value={k.value || "—"} />
            </View>
          ))}
        </View>
      ) : null}
      {table ? (
        <View style={[styles.tableRow, { marginTop: kpis.length ? 20 : 0, borderTopColor: colors.border }]}>
          <View style={[styles.metricCol, { borderRightColor: colors.border }]}>
            <View style={[styles.cell, styles.headCell, { borderBottomColor: colors.border }]}>
              <Text variant="caption" color="textMuted">
                Particulars
              </Text>
            </View>
            {table.rows.map((r, i) => (
              <View key={r.metric + i} style={[styles.cell, i < table.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Text variant="bodySm" numberOfLines={2}>
                  {r.metric}
                </Text>
              </View>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
            <View>
              <View style={[styles.cellRow, styles.headCell, { borderBottomColor: colors.border }]}>
                {table.headers.map((h) => (
                  <View key={h} style={[styles.cell, { width: COL_W }]}>
                    <Text variant="caption" color="textMuted" align="right" numberOfLines={1}>
                      {h}
                    </Text>
                  </View>
                ))}
              </View>
              {table.rows.map((r, i) => (
                <View key={r.metric + i} style={[styles.cellRow, i < table.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  {table.headers.map((h, j) => (
                    <View key={h} style={[styles.cell, { width: COL_W }]}>
                      <Text variant="numSm" numeric align="right">
                        {fmtCell(r.data?.[j])}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  kpis: { flexDirection: "row", flexWrap: "wrap", rowGap: 16 },
  kpi: { width: "50%", paddingRight: 12 },
  tableRow: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  metricCol: { width: METRIC_W, borderRightWidth: StyleSheet.hairlineWidth },
  cellRow: { flexDirection: "row" },
  cell: { height: 44, justifyContent: "center", paddingHorizontal: 10 },
  headCell: { height: 36, borderBottomWidth: StyleSheet.hairlineWidth },
});
