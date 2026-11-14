import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Section, Skeleton, Text } from "@/components/ui";
import { useSubscription, useSubscriptionTrend } from "@/features/ipos/hooks";
import type { Ipo, SubscriptionRow } from "@/features/ipos/types";
import { compactNumber, dateShort, timeAgo, times } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

const ORDER = ["QIB", "NII", "RETAIL", "EMPLOYEE", "SHAREHOLDER", "ANCHOR", "TOTAL"];
const LABELS: Record<string, string> = {
  QIB: "QIB",
  NII: "NII (HNI)",
  RETAIL: "Retail",
  EMPLOYEE: "Employee",
  SHAREHOLDER: "Shareholder",
  ANCHOR: "Anchor",
  TOTAL: "Total",
};

function Live() {
  const { colors } = useTheme();
  return (
    <View style={styles.live}>
      <View style={[styles.liveDot, { backgroundColor: colors.gain }]} />
      <Text variant="caption" color={colors.gain}>
        Live
      </Text>
    </View>
  );
}

function Bar({ value, max }: { value: number | null; max: number }) {
  const { colors } = useTheme();
  const w = useSharedValue(0);
  const v = value ?? 0;
  useEffect(() => {
    w.set(withTiming(Math.max(v > 0 ? 1.5 : 0, Math.min(100, (v / max) * 100)), { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [v, max, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.get()}%` }));
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
      <Animated.View style={[styles.fill, { backgroundColor: v >= 1 ? colors.gain : colors.textFaint }, fill]} />
    </View>
  );
}

function CategoryRow({ row, max, subs, last }: { row: SubscriptionRow; max: number; subs?: SubscriptionRow[]; last?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const total = row.category_key === "TOTAL";
  const t = row.times_subscribed;
  const hasSubs = Boolean(subs && subs.length);
  const meta = [
    row.shares_offered !== null ? `Offered ${compactNumber(row.shares_offered)}` : null,
    row.shares_applied !== null ? `Bid ${compactNumber(row.shares_applied)}` : null,
    row.demand_crore !== null ? `₹${compactNumber(row.demand_crore)} Cr` : null,
  ].filter(Boolean);
  return (
    <View style={[styles.cat, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => hasSubs && setOpen((o) => !o)} disabled={!hasSubs} style={styles.catHead} accessibilityRole={hasSubs ? "button" : undefined}>
        <View style={styles.catLabel}>
          <Text variant={total ? "title" : "body"} color={colors.text}>
            {LABELS[row.category_key] ?? row.label ?? row.category_key}
          </Text>
          {hasSubs ? <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textFaint} /> : null}
        </View>
        <Text variant={total ? "numMd" : "numSm"} color={t !== null && t >= 1 ? colors.gain : colors.text} numeric>
          {times(t)}
        </Text>
      </Pressable>
      <Bar value={t} max={max} />
      {meta.length ? (
        <Text variant="caption" color="textFaint" style={{ marginTop: 6 }} numeric>
          {meta.join(" · ")}
        </Text>
      ) : null}
      {open && subs ? (
        <View style={styles.subs}>
          {subs.map((s) => (
            <View key={s.id} style={styles.subRow}>
              <Text variant="caption" color="textMuted" style={{ flex: 1 }} numberOfLines={1}>
                {s.label ?? s.category_key}
              </Text>
              <Text variant="caption" color="textFaint" numeric>
                {compactNumber(s.shares_applied)} sh
              </Text>
              <Text variant="numSm" color={s.times_subscribed !== null && s.times_subscribed >= 1 ? colors.gain : colors.text} numeric style={styles.subTimes}>
                {s.times_subscribed !== null ? times(s.times_subscribed) : "—"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function fallbackRows(ipo: Ipo): SubscriptionRow[] {
  const mk = (key: string, v: number | null): SubscriptionRow | null =>
    v === null
      ? null
      : {
          id: key,
          ipo_id: ipo.id,
          category_key: key,
          parent_key: "",
          label: LABELS[key],
          times_subscribed: v,
          shares_offered: null,
          shares_applied: null,
          applications: null,
          demand_crore: null,
          snapshot_time: ipo.sub_updated_at ?? ipo.updated_at,
        };
  return [mk("QIB", ipo.sub_qib), mk("NII", ipo.sub_nii), mk("RETAIL", ipo.sub_retail), mk("EMPLOYEE", ipo.sub_employee), mk("SHAREHOLDER", ipo.sub_shareholder), mk("TOTAL", ipo.sub_total)].filter(
    (r): r is SubscriptionRow => r !== null,
  );
}

export function SubscriptionSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const { data, isLoading } = useSubscription(ipo.id);
  const { data: trend } = useSubscriptionTrend(ipo.id);

  const { top, subsByParent } = useMemo(() => {
    const rows = data && data.length ? data : fallbackRows(ipo);
    const top = rows
      .filter((r) => r.parent_key === "" && r.times_subscribed !== null)
      .sort((a, b) => (ORDER.indexOf(a.category_key) === -1 ? 99 : ORDER.indexOf(a.category_key)) - (ORDER.indexOf(b.category_key) === -1 ? 99 : ORDER.indexOf(b.category_key)));
    const subsByParent = new Map<string, SubscriptionRow[]>();
    for (const r of rows) {
      if (r.parent_key && (r.times_subscribed !== null || r.shares_applied !== null)) {
        subsByParent.set(r.parent_key, [...(subsByParent.get(r.parent_key) ?? []), r]);
      }
    }
    return { top, subsByParent };
  }, [data, ipo]);

  const max = Math.max(1, ...top.map((r) => r.times_subscribed ?? 0));

  const dayWise = useMemo(() => {
    const totals = (trend ?? []).filter((r) => r.category_key === "TOTAL");
    const byDay = new Map<string, number>();
    for (const r of totals) {
      if (r.times_subscribed !== null) byDay.set(r.snapshot_time.slice(0, 10), r.times_subscribed);
    }
    return [...byDay.entries()].slice(-6);
  }, [trend]);

  const updated = data?.[0]?.snapshot_time ?? ipo.sub_updated_at;
  const applications = data?.find((r) => r.category_key === "TOTAL" && r.parent_key === "")?.applications ?? ipo.sub_applications;

  return (
    <Section
      title="Subscription"
      subtitle={updated ? `Updated ${timeAgo(updated)}${applications ? ` · ${compactNumber(applications)} applications` : ""}` : undefined}
      right={ipo.status === "open" ? <Live /> : undefined}
    >
      {isLoading && !top.length ? (
        <View style={{ gap: 14 }}>
          <Skeleton height={12} width="60%" />
          <Skeleton height={4} />
          <Skeleton height={12} width="40%" />
          <Skeleton height={4} />
        </View>
      ) : (
        top.map((row, i) => (
          <CategoryRow key={row.id} row={row} max={max} last={i === top.length - 1} subs={row.category_key === "NII" || row.category_key === "QIB" ? subsByParent.get(row.category_key) : undefined} />
        ))
      )}
      {dayWise.length > 1 ? (
        <View style={{ marginTop: 16 }}>
          <Text variant="caption" color="textMuted" style={{ marginBottom: 8 }}>
            Day-wise total
          </Text>
          <View style={styles.trendRow}>
            {dayWise.map(([day, v], i) => {
              const maxV = Math.max(...dayWise.map(([, x]) => x), 1);
              return (
                <View key={day} style={styles.trendCol}>
                  <Text variant="caption" color="textMuted" numeric>
                    {times(v)}
                  </Text>
                  <View style={[styles.trendBarWrap, { backgroundColor: colors.surfaceAlt }]}>
                    <View style={[styles.trendBar, { height: `${Math.max(6, (v / maxV) * 100)}%`, backgroundColor: i === dayWise.length - 1 ? colors.text : colors.textFaint }]} />
                  </View>
                  <Text variant="caption" color="textFaint">
                    {dateShort(day)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  cat: { paddingVertical: 12 },
  catHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  catLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  track: { height: 3, borderRadius: 2, overflow: "hidden" },
  fill: { height: 3, borderRadius: 2 },
  subs: { marginTop: 10, paddingLeft: 12, gap: 8 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  subTimes: { minWidth: 52, textAlign: "right" },
  trendRow: { flexDirection: "row", gap: 8, height: 84, alignItems: "flex-end" },
  trendCol: { flex: 1, alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" },
  trendBarWrap: { flex: 1, width: "100%", borderRadius: 3, justifyContent: "flex-end", overflow: "hidden" },
  trendBar: { width: "100%", borderRadius: 3 },
});
