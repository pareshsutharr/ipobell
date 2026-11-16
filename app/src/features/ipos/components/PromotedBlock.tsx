// The "Promoted" block on the home screen: its own titled block, every card tagged, and a line saying what
// promoted means. Shown only while the `promoted_ipos` feature switch is on (held for legal review) and an
// IPO is flagged by a super admin. The ordinary lists below it are not changed. See features/ipos/promoted.ts.
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui";
import { useFeatureSwitches } from "@/features/flags/useFeatureSwitches";
import { IpoCard } from "@/features/ipos/components/IpoCard";
import { parsePromoted, PROMOTED_LABEL, PROMOTED_NOTE, promotedBlock } from "@/features/ipos/promoted";
import type { IpoListItem } from "@/features/ipos/types";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme/ThemeProvider";

async function fetchPromoted(): Promise<string[]> {
  const { data, error } = await supabase.rpc("promoted_ipos");
  if (error) return []; // not set up yet, or offline: show nothing
  return parsePromoted(data);
}

export function PromotedBlock({ lists, onWatchlistLimit }: { lists: (IpoListItem[] | undefined)[]; onWatchlistLimit: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const switches = useFeatureSwitches();
  const { data: ids } = useQuery({ queryKey: ["promoted-ipos"], queryFn: fetchPromoted, enabled: switches.promotedIpos, staleTime: 10 * 60 * 1000, retry: 0 });
  const items = promotedBlock(switches.promotedIpos, ids, lists);
  if (!items.length) return null;

  return (
    <View style={[styles.block, { marginHorizontal: spacing.lg, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }]} accessibilityLabel={`${PROMOTED_LABEL}. ${PROMOTED_NOTE}`}>
      <View style={styles.head}>
        <View style={[styles.tag, { backgroundColor: colors.text, borderRadius: radius.sm }]}>
          <Text variant="caption" weight="semibold" color={colors.background}>{PROMOTED_LABEL}</Text>
        </View>
        <Text variant="caption" color="textMuted" style={{ flex: 1, lineHeight: 16 }}>{PROMOTED_NOTE}</Text>
      </View>
      {items.map((ipo, index) => (
        <View key={ipo.id}>
          <View style={styles.cardTag}>
            <Text variant="caption" weight="semibold" color="textMuted">{PROMOTED_LABEL}</Text>
          </View>
          <IpoCard ipo={ipo} index={index} onWatchlistLimit={onWatchlistLimit} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderWidth: 1, paddingTop: 12, paddingBottom: 4, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  tag: { paddingHorizontal: 8, height: 22, justifyContent: "center" },
  cardTag: { paddingHorizontal: 16, paddingTop: 6 },
});
