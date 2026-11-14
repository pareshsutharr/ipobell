import { router } from "expo-router";
import React from "react";
import { Alert, StyleSheet, View } from "react-native";

import { IconButton, Text } from "@/components/ui";
import { addToCalendar, shareIpo } from "@/features/ipos/components/detail/helpers";
import type { Ipo } from "@/features/ipos/types";
import { useIsWatched, useToggleWatchlist, WatchlistLimitError } from "@/features/watchlist/hooks";
import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

export function DetailHeader({ ipo, title }: { ipo: Ipo | undefined; title?: string }) {
  const { colors, spacing } = useTheme();
  const watched = useIsWatched(ipo?.id);
  const { toggle } = useToggleWatchlist();

  const onStar = () => {
    if (!ipo) return;
    track("watchlist", { action: watched ? "remove" : "add", slug: ipo.slug, name: ipo.display_name ?? ipo.name });
    toggle(ipo.id, watched).catch((e) => {
      if (e instanceof WatchlistLimitError) {
        Alert.alert("Watchlist full", e.message);
      } else {
        Alert.alert("Couldn't update watchlist", e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <View style={[styles.bar, { paddingHorizontal: spacing.xs, borderBottomColor: colors.border }]}>
      <IconButton icon="arrow-back" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
      <Text variant="title" numberOfLines={1} style={styles.title}>
        {title ?? ""}
      </Text>
      <View style={styles.actions}>
        <IconButton icon="calendar-outline" accessibilityLabel="Add to calendar" onPress={() => ipo && addToCalendar(ipo)} />
        <IconButton icon="share-social-outline" accessibilityLabel="Share" onPress={() => ipo && shareIpo(ipo)} />
        <IconButton
          icon={watched ? "star" : "star-outline"}
          active={watched}
          color={watched ? colors.primary : undefined}
          accessibilityLabel={watched ? "Remove from watchlist" : "Add to watchlist"}
          onPress={onStar}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 4, height: 52, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  actions: { flexDirection: "row" },
});
