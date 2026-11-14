import React from "react";
import { StyleSheet, View } from "react-native";

import { KeyValueRow, Section, Stat, Text } from "@/components/ui";
import { boardLabel, CompanyLogo, GainText, GmpChip, StatusBadge } from "@/features/ipos/components/IpoBits";
import { retailMinimum } from "@/features/ipos/lots";
import type { Ipo } from "@/features/ipos/types";
import { crore, inr, timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

/** Flat hero: identity line, key numbers as a 2×2 grid, GMP / listing line. */
export function HeroCard({ ipo }: { ipo: Ipo }) {
  const { spacing } = useTheme();
  const listed = ipo.status === "listed" && ipo.listing_price !== null;
  const retailMin = retailMinimum(ipo);
  const identity = [boardLabel(ipo.board, ipo.sub_type), ipo.nse_symbol ?? null, ipo.bse_scrip_code ? `BSE ${ipo.bse_scrip_code}` : null, ipo.listing_on ? `Listing on ${ipo.listing_on}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl }}>
      <View style={styles.head}>
        <CompanyLogo uri={ipo.logo_url} name={ipo.name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h2" numberOfLines={2}>
            {ipo.display_name ?? ipo.name}
          </Text>
          <Text variant="caption" color="textMuted" style={{ marginTop: 3 }} numberOfLines={2}>
            {identity}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 10 }}>
        <StatusBadge ipo={ipo} size="sm" />
      </View>

      <View style={styles.grid}>
        <View style={styles.cell}>
          <Stat label="Price range" value={ipo.price_band ? `₹${ipo.price_band}` : "TBA"} />
        </View>
        <View style={styles.cell}>
          <Stat label="Min investment" value={inr(retailMin?.amount ?? null)} sub={retailMin ? `Retail, ${retailMin.lots} ${retailMin.lots === 1 ? "lot" : "lots"} · ${retailMin.shares} shares` : "Retail"} />
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <Stat label="Lot size" value={ipo.lot_size ? `${ipo.lot_size} shares` : "—"} />
        </View>
        <View style={styles.cell}>
          <Stat label="Issue size" value={crore(ipo.issue_size_cr)} sub={ipo.sale_type ?? undefined} />
        </View>
      </View>

      {listed ? (
        <View style={[styles.grid, { marginTop: 20 }]}>
          <View style={styles.cell}>
            <Text variant="caption" color="textMuted">
              Listed at
            </Text>
            <Text variant="numLg" numeric style={{ marginTop: 2 }}>
              {inr(ipo.listing_price)}
            </Text>
            <GainText value={ipo.listing_gain_percent} variant="numSm" prefix="vs issue" />
          </View>
          <View style={styles.cell}>
            <Text variant="caption" color="textMuted">
              Current price
            </Text>
            <Text variant="numLg" numeric style={{ marginTop: 2 }}>
              {inr(ipo.cmp)}
            </Text>
            <GainText value={ipo.current_gain_percent} variant="numSm" prefix="vs issue" />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 20 }}>
          <View style={styles.gmpRow}>
            <GmpChip gmp={ipo.gmp} gmpPercent={ipo.gmp_percent} />
            {ipo.gmp_expected_price !== null ? (
              <Text variant="caption" color="textMuted" numeric>
                Est. listing {inr(ipo.gmp_expected_price)}
              </Text>
            ) : null}
          </View>
          {ipo.gmp_updated_at || ipo.gmp_kostak || (ipo.gmp_subject_to_sauda && ipo.gmp_subject_to_sauda !== "0") ? (
            <Text variant="caption" color="textFaint" style={{ marginTop: 4 }}>
              {[
                ipo.gmp_updated_at ? `Updated ${timeAgo(ipo.gmp_updated_at)}` : null,
                ipo.gmp_kostak ? `Kostak ${ipo.gmp_kostak}` : null,
                ipo.gmp_subject_to_sauda && ipo.gmp_subject_to_sauda !== "0" ? `Subject to sauda ${ipo.gmp_subject_to_sauda.replace(/,+/g, " / ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Secondary issue facts as a plain key/value list. */
export function IssueDetailsSection({ ipo }: { ipo: Ipo }) {
  const rows: { label: string; value: string }[] = [
    ipo.issue_price !== null ? { label: "Issue price", value: inr(ipo.issue_price) } : null,
    ipo.face_value !== null ? { label: "Face value", value: inr(ipo.face_value) } : null,
    ipo.sale_type ? { label: "Issue type", value: ipo.sale_type } : null,
    ipo.listing_on ? { label: "Listing at", value: ipo.listing_on } : null,
    ipo.lot_size && ipo.price_max ? { label: "Retail lot value", value: inr(ipo.lot_size * ipo.price_max) } : null,
    ipo.employee_discount ? { label: "Employee discount", value: ipo.employee_discount } : null,
    ipo.registrar?.name ? { label: "Registrar", value: ipo.registrar.name } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);
  if (!rows.length) return null;
  return (
    <Section title="Issue details">
      {rows.map((r, i) => (
        <KeyValueRow key={r.label} label={r.label} value={r.value} last={i === rows.length - 1} numeric={/₹|\d/.test(r.value)} />
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: 12, alignItems: "center" },
  grid: { flexDirection: "row", gap: 12, marginTop: 18 },
  cell: { flex: 1 },
  gmpRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
});
