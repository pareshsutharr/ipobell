import { area, curveMonotoneX, line } from "d3-shape";
import React, { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { EmptyState, Section, Skeleton, Stat, Text } from "@/components/ui";
import { useGmpHistory } from "@/features/ipos/hooks";
import type { GmpPoint, Ipo } from "@/features/ipos/types";
import { dateShort, inr, pct } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

const H = 150;
const PAD = { top: 16, bottom: 18, left: 4, right: 4 };

export function GmpChartSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const { data, isLoading } = useGmpHistory(ipo.id);
  const [width, setWidth] = useState(0);

  const points = useMemo(() => (data ?? []).filter((p): p is GmpPoint & { gmp: number } => p.gmp !== null), [data]);

  const chart = useMemo(() => {
    if (points.length < 2 || width === 0) return null;
    const values = points.map((p) => p.gmp);
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;
    const coords = points.map((p, i) => [x(i), y(p.gmp)] as [number, number]);
    const linePath = line<[number, number]>().x((d) => d[0]).y((d) => d[1]).curve(curveMonotoneX)(coords) ?? "";
    const areaPath =
      area<[number, number]>()
        .x((d) => d[0])
        .y0(PAD.top + innerH)
        .y1((d) => d[1])
        .curve(curveMonotoneX)(coords) ?? "";
    const maxIdx = values.indexOf(max);
    const minIdx = values.indexOf(Math.min(...values));
    const zeroY = min < 0 ? y(0) : null;
    return { coords, linePath, areaPath, maxIdx, minIdx, zeroY, min, max };
  }, [points, width]);

  const first = points[0]?.gmp ?? null;
  const last = points[points.length - 1]?.gmp ?? ipo.gmp;
  const up = first !== null && last !== null ? last >= first : true;
  const color = up ? colors.gain : colors.loss;
  const high = chart ? points[chart.maxIdx] : null;
  const low = chart ? points[chart.minIdx] : null;
  const lastColor = last === null ? colors.text : last > 0 ? colors.gain : last < 0 ? colors.loss : colors.text;

  return (
    <Section title="GMP trend" subtitle="Grey market premium, one reading per day">
      {isLoading && points.length === 0 ? (
        <Skeleton height={H} radius={8} />
      ) : points.length < 2 ? (
        <EmptyState compact icon="analytics-outline" title="No GMP history yet" message="GMP history will appear as readings come in." />
      ) : (
        <View>
          <View style={styles.stats}>
            <View style={{ flex: 1 }}>
              <Stat label="Now" value={`${inr(last)}${ipo.gmp_percent !== null ? ` (${pct(ipo.gmp_percent, { sign: false, decimals: 1 })})` : ""}`} valueColor={lastColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Stat label="High" value={high ? inr(high.gmp) : "—"} sub={high ? dateShort(high.recorded_on) : undefined} />
            </View>
            <View style={{ flex: 1 }}>
              <Stat label="Low" value={low ? inr(low.gmp) : "—"} sub={low ? dateShort(low.recorded_on) : undefined} align="right" />
            </View>
          </View>
          <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: H, marginTop: 16 }}>
            {chart ? (
              <Svg width={width} height={H}>
                {[0.25, 0.5, 0.75].map((f) => (
                  <Line key={f} x1={PAD.left} x2={width - PAD.right} y1={PAD.top + (H - PAD.top - PAD.bottom) * f} y2={PAD.top + (H - PAD.top - PAD.bottom) * f} stroke={colors.chartGrid} strokeWidth={StyleSheet.hairlineWidth} />
                ))}
                {chart.zeroY !== null ? <Line x1={PAD.left} x2={width - PAD.right} y1={chart.zeroY} y2={chart.zeroY} stroke={colors.textFaint} strokeWidth={1} strokeDasharray="3 4" /> : null}
                <Path d={chart.areaPath} fill={color} fillOpacity={0.08} />
                <Path d={chart.linePath} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                <Circle cx={chart.coords[chart.coords.length - 1][0]} cy={chart.coords[chart.coords.length - 1][1]} r={4} fill={colors.surface} stroke={color} strokeWidth={2} />
              </Svg>
            ) : null}
            {chart ? (
              <>
                <Text variant="caption" color="textFaint" numeric style={[styles.floatLabel, { left: Math.max(0, Math.min(width - 48, chart.coords[chart.maxIdx][0] - 20)), top: Math.max(0, chart.coords[chart.maxIdx][1] - 16) }]}>
                  {inr(chart.max)}
                </Text>
                {chart.minIdx !== chart.maxIdx ? (
                  <Text variant="caption" color="textFaint" numeric style={[styles.floatLabel, { left: Math.max(0, Math.min(width - 48, chart.coords[chart.minIdx][0] - 20)), top: Math.min(H - PAD.bottom - 2, chart.coords[chart.minIdx][1] + 4) }]}>
                    {inr(points[chart.minIdx].gmp)}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
          <View style={styles.axis}>
            <Text variant="caption" color="textFaint">
              {dateShort(points[0].recorded_on)}
            </Text>
            <Text variant="caption" color="textFaint">
              {dateShort(points[points.length - 1].recorded_on)}
            </Text>
          </View>
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 12 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  floatLabel: { position: "absolute" },
});
