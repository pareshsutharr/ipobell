// Compare my company — the owner's latest-year figures against listed IPOs in the same sector.
// Shows where each figure sits against the peers' middle half. Positions, not judgements.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, Chip, PressableScale, Screen, Text } from "@/components/ui";
import { Field, NumberField, OptionList } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { compareCompany, formatMetric, MIN_PEERS, positionLabel, type CompanyInput, type MetricComparison } from "@/features/business/peers";
import { useBusinessRules } from "@/features/business/useBusinessRules";
import { usePeers } from "@/features/business/usePeers";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { dateShort } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

const FIELDS: { key: keyof CompanyInput; label: string; hint?: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "ebitda", label: "EBITDA", hint: "Operating profit before interest, tax, depreciation." },
  { key: "pat", label: "Profit after tax (PAT)" },
  { key: "debt", label: "Total debt" },
  { key: "netWorth", label: "Net worth", hint: "Share capital plus reserves." },
];

function tone(m: MetricComparison): "neutral" | "info" {
  return m.position === null ? "neutral" : "info";
}

export default function PeersScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ sector?: string }>();
  const rules = useBusinessRules();
  const sectors = rules.issueSize.sectorPe.map((s) => s.sector);
  const [sector, setSector] = useState<string | null>(params.sector && sectors.includes(params.sector) ? params.sector : null);
  const [showSectors, setShowSectors] = useState(!sector);
  const [texts, setTexts] = useState<Record<keyof CompanyInput, string>>({ revenue: "", ebitda: "", pat: "", debt: "", netWorth: "" });
  const [input, setInput] = useState<CompanyInput>({ revenue: null, ebitda: null, pat: null, debt: null, netWorth: null });
  const peers = usePeers(sector);
  const rows = useMemo(() => compareCompany(input, peers.data), [input, peers.data]);
  const entered = Object.values(input).filter((v) => v !== null).length;
  const peerCount = peers.data?.length ?? 0;

  useEffect(() => {
    trackTool("peers", "start");
  }, []);
  useEffect(() => {
    if (!sector || entered < 2) return;
    const t = setTimeout(() => trackTool("peers", "complete", { sector, peers: peerCount, entered }), 1500);
    return () => clearTimeout(t);
  }, [sector, entered, peerCount]);

  return (
    <Screen>
      <PageHeader title="Compare my company" subtitle="Your numbers against listed peers" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Industry sector" hint="Peers are the IPOs our team has tagged with this sector." required>
          {showSectors || !sector ? (
            <OptionList options={sectors.map((s) => ({ value: s, label: s }))} value={sector} onChange={(v) => { setSector(v); setShowSectors(false); }} compact />
          ) : (
            <Button title={sector} iconRight="chevron-down" variant="secondary" onPress={() => setShowSectors(true)} />
          )}
        </Field>

        {sector ? (
          <>
            <Card variant="alt" style={{ gap: 4 }}>
              <Text variant="title">
                {peers.isLoading ? "Looking up listed peers…" : peerCount === 0 ? "No listed peers yet" : `${peerCount} listed ${peerCount === 1 ? "peer" : "peers"} in ${sector}`}
              </Text>
              <Text variant="caption" color="textMuted">
                {peerCount === 0 && !peers.isLoading
                  ? "We have not tagged any IPO with this sector yet. You can still enter your figures; the comparison will fill in as our team adds peers."
                  : peerCount < MIN_PEERS
                    ? `At least ${MIN_PEERS} peers with a figure are needed before we say where you sit.`
                    : "Peer figures are for each company's latest full financial year, in ₹ crore, as reported in its offer document."}
              </Text>
            </Card>

            <View style={{ gap: spacing.md }}>
              <Text variant="h3">Your latest full year (₹ crore)</Text>
              {FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <NumberField value={texts[f.key]} onChange={(t, n) => { setTexts((x) => ({ ...x, [f.key]: t })); setInput((x) => ({ ...x, [f.key]: n })); }} placeholder="e.g. 25" allowNegative={f.key === "pat" || f.key === "ebitda"} />
                </Field>
              ))}
            </View>

            {entered > 0 ? (
              <Card padding={0}>
                {rows.map((m, i) => (
                  <View key={m.key} style={[styles.metric, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                    <View style={styles.metricHead}>
                      <Text variant="title" style={{ flex: 1 }}>
                        {m.label}
                      </Text>
                      <Chip label={positionLabel(m)} tone={tone(m)} size="sm" variant="soft" />
                    </View>
                    <View style={styles.metricRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="caption" color="textFaint">
                          You
                        </Text>
                        <Text variant="numMd" numeric>
                          {formatMetric(m.yours, m.unit)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="caption" color="textFaint">
                          Typical peer (median)
                        </Text>
                        <Text variant="numMd" numeric color={m.peers.median === null ? "textFaint" : "text"}>
                          {formatMetric(m.peers.median, m.unit)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, alignItems: "flex-end" }}>
                        <Text variant="caption" color="textFaint">
                          Middle half
                        </Text>
                        <Text variant="numSm" numeric color={m.peers.low === null ? "textFaint" : "text"}>
                          {m.peers.n >= MIN_PEERS ? `${formatMetric(m.peers.low, m.unit)} – ${formatMetric(m.peers.high, m.unit)}` : "—"}
                        </Text>
                      </View>
                    </View>
                    {m.lowerIsLighter && m.position ? (
                      <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>
                        {m.position === "below" ? "Less debt for each rupee of equity than most peers." : m.position === "above" ? "More debt for each rupee of equity than most peers." : "Similar debt for each rupee of equity."}
                      </Text>
                    ) : null}
                    {m.key === "ebitda_margin" ? (
                      <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
                        Peers do not report EBITDA in our data, so only your figure is shown.
                      </Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            ) : null}

            {peerCount > 0 ? (
              <View style={{ gap: 8 }}>
                <Text variant="h3">The peers</Text>
                <Card padding={0}>
                  {(peers.data ?? []).slice(0, 12).map((p, i, arr) => (
                    <PressableScale key={p.slug} onPress={() => router.push({ pathname: "/ipo/[slug]", params: { slug: p.slug } })} accessibilityRole="button" style={[styles.peer, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="bodySm" numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text variant="caption" color="textFaint" numberOfLines={1}>
                          {p.board === "sme" ? "SME" : "Mainboard"}
                          {p.listingDate ? ` · listed ${dateShort(p.listingDate)}` : ` · ${p.status}`}
                          {p.revenue !== null ? ` · revenue ₹${p.revenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr` : ""}
                        </Text>
                      </View>
                      <Text variant="caption" color="textMuted" numeric>
                        {p.pe !== null ? `P/E ${p.pe}×` : ""}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
                    </PressableScale>
                  ))}
                </Card>
                {peerCount > 12 ? (
                  <Text variant="caption" color="textFaint">
                    Showing the 12 most recent of {peerCount}. The figures above use all of them.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <LeadForm
              source="business-hub"
              title="Walk through this with an advisor"
              subtitle="We compare you with the right listed peers, not just the sector, and show what would move your numbers before an IPO."
              cta="Request a call"
              message={`Compare my company | ${sector} | ${peerCount} peers | Revenue ₹${input.revenue ?? "n/a"} Cr, PAT ₹${input.pat ?? "n/a"} Cr, Debt ₹${input.debt ?? "n/a"} Cr`}
              payload={{ Tool: "Compare my company", Industry: sector, "Peers found": peerCount, "Revenue (₹ Cr)": input.revenue ?? "not given", "EBITDA (₹ Cr)": input.ebitda ?? "not given", "PAT (₹ Cr)": input.pat ?? "not given", "Debt (₹ Cr)": input.debt ?? "not given", "Net worth (₹ Cr)": input.netWorth ?? "not given" }}
            />
          </>
        ) : null}

        <Card variant="plain" padding={0} style={{ gap: 6 }}>
          <Text variant="caption" color="textFaint">
            How it works: for each figure we take the listed IPOs in your sector and find the middle half (25th to 75th percentile). “Above most peers” means above that band, “below” means under it. A position is not a judgement: a smaller company can be the better business. Your figures stay on this phone unless you send them to our team.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metric: { paddingHorizontal: 16, paddingVertical: 14 },
  metricHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  metricRow: { flexDirection: "row", gap: 12 },
  peer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
