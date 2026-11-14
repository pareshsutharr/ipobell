import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";

import Animated, { FadeIn } from "react-native-reanimated";

import { EmptyState, ErrorState, FilterChip, IconButton, ListSkeleton, Screen, Text } from "@/components/ui";
import { IpoCard } from "@/features/ipos/components/IpoCard";
import { useIpoSearch } from "@/features/ipos/hooks";
import { track } from "@/lib/analytics";
import type { IpoListItem } from "@/features/ipos/types";
import { useTheme } from "@/lib/theme/ThemeProvider";

type TextInputHandle = React.ComponentRef<typeof TextInput>;

const RECENT_KEY = "ipobell.recentSearches";
const RECENT_MAX = 8;

export default function SearchScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const inputRef = useRef<TextInputHandle>(null);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (v) setRecent(JSON.parse(v) as string[]);
      })
      .catch(() => undefined);
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const query = useIpoSearch(debounced);
  useEffect(() => {
    if (debounced.trim().length >= 2 && query.data) track("search", { query: debounced.trim(), results: query.data.length });
  }, [debounced, query.data]);

  const remember = useCallback(
    (term: string) => {
      const q = term.trim();
      if (q.length < 2) return;
      const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
      setRecent(next);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
    },
    [recent],
  );

  const clearRecent = () => {
    setRecent([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => undefined);
  };

  const renderItem = useCallback(({ item, index }: { item: IpoListItem; index: number }) => <IpoCard ipo={item} index={index} />, []);
  const active = debounced.trim().length >= 2;

  let body: React.ReactNode;
  if (!active) {
    body = (
      <Animated.View entering={FadeIn} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
        {recent.length ? (
          <>
            <View style={styles.recentHeader}>
              <Text variant="overline" color="textFaint">
                Recent
              </Text>
              <Pressable onPress={clearRecent} hitSlop={8}>
                <Text variant="caption" color="primary">
                  Clear
                </Text>
              </Pressable>
            </View>
            <View style={styles.chips}>
              {recent.map((r) => (
                <FilterChip key={r} label={r} icon="time-outline" onPress={() => setText(r)} />
              ))}
            </View>
          </>
        ) : (
          <EmptyState icon="search-outline" title="Search IPOs" message="Type a company name — Mainboard or SME, past or upcoming." />
        )}
      </Animated.View>
    );
  } else if (query.isLoading) {
    body = <ListSkeleton count={4} />;
  } else if (query.isError) {
    body = <ErrorState onRetry={() => query.refetch()} />;
  } else {
    body = (
      <FlatList
        data={query.data ?? []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: spacing.xxxl }}
        ListEmptyComponent={<EmptyState icon="search-outline" title={`No results for “${debounced.trim()}”`} message="Check the spelling or try a shorter name." />}
        initialNumToRender={8}
        onScrollBeginDrag={() => remember(debounced)}
      />
    );
  }

  return (
    <Screen>
      <View style={[styles.bar, { paddingHorizontal: spacing.lg }]}>
        <IconButton icon="arrow-back" accessibilityLabel="Back" onPress={() => router.back()} />
        <View style={[styles.input, { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: radius.pill }]}>
          <Ionicons name="search-outline" size={18} color={colors.textFaint} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => remember(text)}
            placeholder="Search by company name"
            placeholderTextColor={colors.textFaint}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[typography.body, { color: colors.text, flex: 1, paddingVertical: 0 }]}
            accessibilityLabel="Search IPOs"
          />
          {text ? (
            <Pressable onPress={() => setText("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1 }}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 12 },
  input: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth },
  recentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
