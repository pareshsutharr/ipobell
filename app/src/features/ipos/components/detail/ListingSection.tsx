import React from "react";
import { StyleSheet, View } from "react-native";

import { KeyValueRow, Section, Stat, Text } from "@/components/ui";
import type { Ipo } from "@/features/ipos/types";
import { dateLong, inr, pct, timeAgo } from "@/lib/format";
import { useSignedColor } from "@/lib/theme/ThemeProvider";

export function ListingSection({ ipo }: { ipo: Ipo }) {
  const signed = useSignedColor();
  if (ipo.status !== "listed" || ipo.listing_price === null) return null;
  const listingGain = ipo.listing_gain_percent;
  const sinceListing = ipo.cmp !== null && ipo.listing_price ? ((ipo.cmp - ipo.listing_price) / ipo.listing_price) * 100 : null;
  const lotPnl = ipo.lot_size && ipo.issue_price !== null && ipo.listing_price !== null ? (ipo.listing_price - ipo.issue_price) * ipo.lot_size : null;

  return (
    <Section title="Listing performance" subtitle={`Listed ${dateLong(ipo.listing_date)}${ipo.listing_on ? ` on ${ipo.listing_on}` : ""}`}>
      <View style={styles.steps}>
        <View style={{ flex: 1 }}>
          <Stat label="Issue price" value={inr(ipo.issue_price)} />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Listing price" value={inr(ipo.listing_price)} valueColor={signed(listingGain)} />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Current" value={inr(ipo.cmp)} valueColor={signed(ipo.current_gain_percent)} align="right" />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <KeyValueRow label="Listing day gain" value={pct(listingGain)} valueColor={signed(listingGain)} />
        <KeyValueRow label="Gain per lot on listing" value={lotPnl !== null ? inr(lotPnl, { sign: true }) : "—"} valueColor={signed(lotPnl)} />
        <KeyValueRow label="Since listing" value={pct(sinceListing)} valueColor={signed(sinceListing)} />
        <KeyValueRow label="Current vs issue price" value={pct(ipo.current_gain_percent)} valueColor={signed(ipo.current_gain_percent)} last />
      </View>
      {ipo.cmp_updated_at ? (
        <Text variant="caption" color="textFaint" style={{ marginTop: 10 }}>
          Price updated {timeAgo(ipo.cmp_updated_at)}
        </Text>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: "row", gap: 12 },
});
