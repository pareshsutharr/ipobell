import React from "react";
import { StyleSheet, View } from "react-native";

import { EmptyState, Section, Text } from "@/components/ui";
import type { Ipo } from "@/features/ipos/types";
import { dateLong, daysUntil, relativeDay } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface Step {
  key: string;
  label: string;
  date: string | null;
  hint?: string;
}

export function TimelineSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const steps: Step[] = [
    { key: "open", label: "Bidding opens", date: ipo.open_date, hint: "10:00 AM IST" },
    { key: "close", label: "Bidding closes", date: ipo.close_date, hint: "5:00 PM IST" },
    { key: "allotment", label: "Basis of allotment", date: ipo.allotment_date },
    { key: "refund", label: "Refund initiation", date: ipo.refund_date },
    { key: "demat", label: "Credit to demat", date: ipo.credit_to_demat_date },
    { key: "listing", label: "Listing day", date: ipo.listing_date, hint: ipo.listing_on ? `on ${ipo.listing_on}` : undefined },
  ].filter((s) => s.date);

  return (
    <Section title="Timeline" subtitle={ipo.dates_tba ? "Dates to be announced" : undefined}>
      {steps.length === 0 ? (
        <EmptyState compact icon="calendar-outline" title="Dates not announced" message="We'll alert you when the IPO dates are out." />
      ) : (
        steps.map((s, i) => {
          const d = daysUntil(s.date);
          const state = d === null ? "future" : d < 0 ? "done" : d === 0 ? "today" : "future";
          const last = i === steps.length - 1;
          return (
            <View key={s.key} style={styles.row}>
              <View style={styles.rail}>
                <View style={[styles.dot, { borderColor: state === "future" ? colors.borderStrong : colors.text, backgroundColor: state === "future" ? "transparent" : colors.text }]} />
                {!last ? <View style={[styles.line, { backgroundColor: colors.border }]} /> : null}
              </View>
              <View style={[styles.content, !last && { paddingBottom: 18 }]}>
                <View style={styles.contentTop}>
                  <Text variant="title" color={state === "future" ? colors.textMuted : colors.text} style={{ flex: 1 }}>
                    {s.label}
                  </Text>
                  <Text variant="caption" color={state === "today" ? colors.text : colors.textFaint} weight={state === "today" ? "semibold" : undefined}>
                    {relativeDay(s.date)}
                  </Text>
                </View>
                <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {dateLong(s.date)}
                  {s.hint ? ` · ${s.hint}` : ""}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 14 },
  rail: { alignItems: "center", width: 12, paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  line: { flex: 1, width: StyleSheet.hairlineWidth * 2, marginVertical: 4 },
  content: { flex: 1 },
  contentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
