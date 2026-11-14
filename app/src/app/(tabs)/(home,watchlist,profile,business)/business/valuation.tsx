// Valuation range — two simple yardsticks side by side: the firm's sector multiple, and what listed peers in the
// same sector trade at. Arithmetic on reported figures, not a valuation.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button, Card, KeyValueRow, Screen, Text } from "@/components/ui";
import { Field, NumberField, OptionList } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { MIN_PEERS, valuationRange } from "@/features/business/peers";
import { useBusinessRules } from "@/features/business/useBusinessRules";
import { usePeers } from "@/features/business/usePeers";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { crore } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function ValuationScreen() {
  const { colors, spacing } = useTheme();
  const [patText, setPatText] = useState("");
  const [pat, setPat] = useState<number | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [showSectors, setShowSectors] = useState(true);
  const rules = useBusinessRules();
  const peers = usePeers(sector);
  const result = useMemo(() => valuationRange(pat, sector, rules.issueSize, peers.data), [pat, sector, rules.issueSize, peers.data]);

  useEffect(() => {
    trackTool("valuation", "start");
  }, []);
  useEffect(() => {
    if (!result?.byRule) return;
    const t = setTimeout(() => trackTool("valuation", "complete", { pat, sector, rule_low: result.byRule?.low, rule_high: result.byRule?.high, peer_low: result.byPeers?.low, peer_high: result.byPeers?.high, peers: result.peersWithPe }), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const band = `±${rules.issueSize.bandPct}%`;
  const headline = result?.overlap ?? (result?.byRule ? { low: result.byRule.low, high: result.byRule.high } : null);

  return (
    <Screen>
      <PageHeader title="Valuation range" subtitle="What could the company be worth?" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Latest annual profit after tax (PAT)" hint="For the most recently completed financial year." required>
          <NumberField value={patText} onChange={(t, n) => { setPatText(t); setPat(n); }} placeholder="e.g. 4.5" />
        </Field>

        <Field label="Industry sector" hint="Sets the sector multiple and which listed companies count as peers." required>
          {showSectors || !sector ? (
            <OptionList options={rules.issueSize.sectorPe.map((s) => ({ value: s.sector, label: s.sector, caption: `${s.pe}× P/E` }))} value={sector} onChange={(v) => { setSector(v); setShowSectors(false); }} compact />
          ) : (
            <Button title={sector} iconRight="chevron-down" variant="secondary" onPress={() => setShowSectors(true)} />
          )}
        </Field>

        {result && headline ? (
          <Animated.View entering={FadeInDown.springify().damping(16)} style={{ gap: spacing.lg }}>
            <Card variant="primary" style={{ gap: 6 }}>
              <Text variant="overline" color="textFaint">
                {result.overlap ? "Where both yardsticks agree" : "Indicative range"}
              </Text>
              <Text variant="display" numeric>
                {crore(headline.low)} – {crore(headline.high)}
              </Text>
              <Text variant="bodySm" color="textMuted">
                {result.overlap
                  ? "The sector multiple and the listed peers point to the same band."
                  : result.byPeers
                    ? "The sector multiple and the listed peers point to different bands; both are shown below."
                    : "From the sector multiple only. See below for the peer check."}
              </Text>
            </Card>

            {result.byRule ? (
              <Card padding={0} style={{ paddingHorizontal: 16 }}>
                <View style={styles.method}>
                  <Text variant="title">1. Sector multiple</Text>
                  <Text variant="caption" color="textMuted">
                    Profit × our sector P/E, {band}
                  </Text>
                </View>
                <KeyValueRow label="Range" value={`${crore(result.byRule.low)} – ${crore(result.byRule.high)}`} />
                <KeyValueRow label="P/E used" value={`${result.byRule.multipleLow}× – ${result.byRule.multipleHigh}×`} last />
              </Card>
            ) : null}

            <Card padding={0} style={{ paddingHorizontal: 16 }}>
              <View style={styles.method}>
                <Text variant="title">2. Listed peers</Text>
                <Text variant="caption" color="textMuted">
                  Profit × the P/E that the middle half of listed {sector} IPOs came at
                </Text>
              </View>
              {result.byPeers ? (
                <>
                  <KeyValueRow label="Range" value={`${crore(result.byPeers.low)} – ${crore(result.byPeers.high)}`} />
                  <KeyValueRow label="Peer P/E, middle half" value={`${result.byPeers.multipleLow}× – ${result.byPeers.multipleHigh}×`} />
                  <KeyValueRow label="Peers with a P/E" value={`${result.peersWithPe} of ${result.peerCount}`} last />
                </>
              ) : (
                <Text variant="bodySm" color="textMuted" style={{ paddingVertical: 14 }}>
                  {peers.isLoading
                    ? "Looking up listed peers…"
                    : result.peerCount === 0
                      ? "We have not tagged any listed IPO with this sector yet, so there is no peer check."
                      : `Only ${result.peersWithPe} listed ${result.peersWithPe === 1 ? "peer has" : "peers have"} a P/E. At least ${MIN_PEERS} are needed for a range.`}
                </Text>
              )}
            </Card>

            <Button title="See how you compare with these peers" icon="git-compare-outline" variant="dark" onPress={() => router.push({ pathname: "/business/peers", params: { sector: sector ?? "" } })} fullWidth />

            <LeadForm
              source="business-hub"
              title="Want a real valuation?"
              subtitle="A multiple is a starting point. Our valuation team looks at profit quality, growth, listed-peer pricing and the offer structure."
              cta="Discuss my valuation"
              message={`Valuation range tool | ${sector} | PAT ₹${pat} Cr | Sector multiple: ₹${result.byRule?.low ?? "n/a"}–₹${result.byRule?.high ?? "n/a"} Cr | Peers: ${result.byPeers ? `₹${result.byPeers.low}–₹${result.byPeers.high} Cr` : "not enough peers"}`}
              payload={{ Tool: "Valuation range", Industry: sector, "Latest PAT (₹ Cr)": pat, "Sector multiple range (₹ Cr)": result.byRule ? `${result.byRule.low}–${result.byRule.high}` : "n/a", "Peer range (₹ Cr)": result.byPeers ? `${result.byPeers.low}–${result.byPeers.high}` : "not enough peers", "Peers with P/E": `${result.peersWithPe} of ${result.peerCount}` }}
            />
          </Animated.View>
        ) : (
          <Card variant="alt" style={styles.empty}>
            <Ionicons name="pie-chart-outline" size={28} color={colors.textFaint} />
            <Text variant="bodySm" color="textMuted" align="center">
              {pat !== null && pat <= 0 ? "A profit multiple needs a profit. For a loss-making company our team uses other methods; book a call." : "Enter PAT and pick a sector to see an indicative range."}
            </Text>
          </Card>
        )}

        <Card variant="plain" padding={0} style={{ gap: 6 }}>
          <Text variant="caption" color="textFaint">
            How it works: two yardsticks. The first multiplies your profit by our sector P/E, {band}. The second multiplies it by the P/E at which the middle half of listed IPOs in the same sector came to market. Neither looks at growth, profit quality, debt or market mood. Directional estimate only, not a valuation and not advice.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 10, paddingVertical: 28 },
  method: { paddingTop: 14, paddingBottom: 6, gap: 2 },
});
