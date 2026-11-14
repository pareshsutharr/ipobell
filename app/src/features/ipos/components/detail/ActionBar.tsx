import { router } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Button, IconButton } from "@/components/ui";
import { openUrl, shareIpo } from "@/features/ipos/components/detail/helpers";
import type { Ipo } from "@/features/ipos/types";
import { track } from "@/lib/analytics";
import { daysUntil } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

/** Sticky bottom bar: one dark CTA + share. The tab bar below owns the safe-area inset. */
export function ActionBar({ ipo }: { ipo: Ipo }) {
  const { colors, spacing } = useTheme();
  const closed = ipo.close_date ? (daysUntil(ipo.close_date) ?? 1) <= 0 : false;
  const showAllotment = closed || ipo.status === "closed" || ipo.status === "listed";

  const checkAllotment = () => {
    const url = ipo.registrar?.status_page || ipo.registrar?.website;
    track("allotment_check", { slug: ipo.slug, name: ipo.display_name ?? ipo.name, registrar: ipo.registrar?.name ?? undefined });
    if (url) openUrl(url);
    else router.push("/allotment");
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>
      {showAllotment ? (
        <Button title="Check allotment status" variant="dark" onPress={checkAllotment} style={{ flex: 1 }} fullWidth />
      ) : (
        <Button title="Add to watchlist & get alerts" variant="dark" onPress={() => router.push("/notifications")} style={{ flex: 1 }} fullWidth />
      )}
      <IconButton icon="share-social-outline" accessibilityLabel="Share" onPress={() => shareIpo(ipo)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
