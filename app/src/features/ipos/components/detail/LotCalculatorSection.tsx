import React from "react";
import { StyleSheet, View } from "react-native";

import { KeyValueRow, Section, Text } from "@/components/ui";
import type { Ipo } from "@/features/ipos/types";
import { compactNumber, inr } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

const SHARE_LABELS: Record<string, string> = { qib: "QIB", nii: "NII", retail: "Retail", employee: "Employee", shareholder: "Shareholder", anchor: "Anchor" };

export function LotCalculatorSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const lots = ipo.lot_calculator ?? [];
  const reservation = ipo.reservation ?? [];
  const shares = Object.entries(ipo.shares_offered ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!lots.length && !reservation.length && !shares.length) return null;

  return (
    <View>
      {lots.length ? (
        <Section title="Lot calculator" subtitle={ipo.price_max ? `At cap price ₹${ipo.price_max}` : undefined}>
          <View style={[styles.row, styles.head, { borderBottomColor: colors.border }]}>
            <Text variant="caption" color="textMuted" style={{ flex: 1.4 }}>
              Application
            </Text>
            <Text variant="caption" color="textMuted" style={styles.col} align="right">
              Lots
            </Text>
            <Text variant="caption" color="textMuted" style={styles.col} align="right">
              Shares
            </Text>
            <Text variant="caption" color="textMuted" style={styles.colWide} align="right">
              Amount
            </Text>
          </View>
          {lots.map((t, i) => {
            const hl = /retail/i.test(t.label) && /min/i.test(t.label);
            return (
              <View key={t.label + i} style={[styles.row, i < lots.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Text variant="bodySm" weight={hl ? "semibold" : undefined} style={{ flex: 1.4 }} numberOfLines={2}>
                  {t.label}
                </Text>
                <Text variant="numSm" numeric style={styles.col} align="right">
                  {t.lots}
                </Text>
                <Text variant="numSm" numeric style={styles.col} align="right">
                  {compactNumber(t.shares)}
                </Text>
                <Text variant="numSm" numeric style={styles.colWide} align="right" weight={hl ? "semibold" : undefined}>
                  {inr(t.amount)}
                </Text>
              </View>
            );
          })}
        </Section>
      ) : null}

      {reservation.length || shares.length ? (
        <Section title="Reservation">
          {reservation.map((r, i) => (
            <KeyValueRow key={r.category + i} label={r.category} value={r.reservation} last={i === reservation.length - 1 && shares.length === 0} />
          ))}
          {shares.map(([k, v], i) => (
            <KeyValueRow key={k} label={`${SHARE_LABELS[k] ?? k} shares offered`} value={typeof v === "number" ? compactNumber(v) : String(v)} last={i === shares.length - 1} />
          ))}
          {ipo.employee_discount ? (
            <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>
              Employee discount: {ipo.employee_discount}
            </Text>
          ) : null}
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 6 },
  head: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  col: { width: 44 },
  colWide: { width: 84 },
});
