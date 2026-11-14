// Issue size calculator — PAT × sector P/E (+ growth premium) → market cap band → 20–30% dilution.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Button, Card, KeyValueRow, Screen, Text } from "@/components/ui";
import { Field, NumberField, OptionList } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { calcIssueSize, SECTOR_PE } from "@/features/business/tools";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { crore } from "@/lib/format";
import { trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

export default function IssueSizeScreen() {
  const { colors, spacing } = useTheme();
  const [patText, setPatText] = useState("");
  const [pat, setPat] = useState<number | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [cagrText, setCagrText] = useState("");
  const [cagr, setCagr] = useState<number | null>(null);
  const [showSectors, setShowSectors] = useState(true);

  const result = useMemo(() => (pat !== null && sector ? calcIssueSize(pat, sector, cagr) : null), [pat, sector, cagr]);
  useEffect(() => {
    trackTool("issue_size", "start");
  }, []);
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => trackTool("issue_size", "complete", { pat, sector, cagr, pe: result.pe, issue_low: result.issueLow, issue_high: result.issueHigh, market_cap: result.marketCap }), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  const basePe = SECTOR_PE.find((s) => s.sector === sector)?.pe;

  return (
    <Screen>
      <PageHeader title="Issue size calculator" subtitle="How much could you raise?" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Field label="Latest annual profit after tax (PAT)" hint="For the most recently completed financial year." required>
          <NumberField value={patText} onChange={(t, n) => { setPatText(t); setPat(n); }} placeholder="e.g. 4.5" />
        </Field>

        <Field label="Industry sector" hint={basePe ? `Base sector P/E: ${basePe}×` : "Sets the starting valuation multiple."} required>
          {showSectors || !sector ? (
            <OptionList options={SECTOR_PE.map((s) => ({ value: s.sector, label: s.sector, caption: `${s.pe}× P/E` }))} value={sector} onChange={(v) => { setSector(v); setShowSectors(false); }} compact />
          ) : (
            <Button title={sector} iconRight="chevron-down" variant="secondary" onPress={() => setShowSectors(true)} />
          )}
        </Field>

        <Field label="3-year revenue CAGR (optional)" hint="Adds a growth premium: 10%+ → +5% · 20%+ → +15% · 30%+ → +25% on the multiple.">
          <NumberField value={cagrText} onChange={(t, n) => { setCagrText(t); setCagr(n); }} placeholder="e.g. 22" prefix="" suffix="%" allowNegative />
        </Field>

        {result ? (
          <Animated.View entering={FadeInDown.springify().damping(16)} style={{ gap: spacing.lg }}>
            <Card variant="primary" style={{ gap: 6 }}>
              <Text variant="overline" color="textFaint">
                Indicative issue size
              </Text>
              <Text variant="display" numeric>
                {crore(result.issueLow)} – {crore(result.issueHigh)}
              </Text>
              <Text variant="bodySm" color="textMuted">
                At {result.dilutionLow}–{result.dilutionHigh}% dilution of an estimated {crore(result.marketCapLow)} – {crore(result.marketCapHigh)} market capitalisation.
              </Text>
            </Card>
            <Card padding={0} style={{ paddingHorizontal: 16 }}>
              <KeyValueRow label="Sector P/E" value={`${result.basePe}×`} />
              <KeyValueRow label="Growth premium" value={result.premiumPct ? `+${result.premiumPct}%` : "none"} valueColor={result.premiumPct ? colors.gain : undefined} />
              <KeyValueRow label="Adjusted P/E" value={`${result.pe}×`} />
              <KeyValueRow label="PAT × P/E (market cap)" value={crore(result.marketCap)} />
              <KeyValueRow label="Valuation band" value="±10%" />
              <KeyValueRow label="Public float assumed" value="20–30%" last />
            </Card>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Estimate the cost of this issue" icon="receipt-outline" variant="dark" onPress={() => router.push({ pathname: "/business/issue-cost", params: { size: String(Math.round(((result.issueLow + result.issueHigh) / 2) * 10) / 10) } })} />
            </View>
            <LeadForm
              source="issue-size-calculator"
              title="Want a real valuation?"
              subtitle="Sector multiples are a starting point. Our valuation team benchmarks against recent SME listings in your sector and models the offer structure."
              cta="Discuss my valuation"
              message={`Issue Size Est: ₹${result.issueLow}–₹${result.issueHigh} Cr | Market Cap Est: ₹${result.marketCapLow}–₹${result.marketCapHigh} Cr | P/E ${result.pe}x | ${sector} | PAT ₹${pat} Cr | CAGR ${cagr ?? "n/a"}%`}
              payload={{ Industry: sector, "Latest PAT (₹ Cr)": pat, "Revenue CAGR (%)": cagr ?? "not given", "Sector P/E used": `${result.pe}x`, "Market cap estimate (₹ Cr)": `${result.marketCapLow}–${result.marketCapHigh}`, "Issue size estimate (₹ Cr)": `${result.issueLow}–${result.issueHigh}` }}
            />
          </Animated.View>
        ) : (
          <Card variant="alt" style={styles.empty}>
            <Ionicons name="calculator-outline" size={28} color={colors.textFaint} />
            <Text variant="bodySm" color="textMuted" align="center">
              Enter PAT and pick a sector to see an indicative market cap and issue size.
            </Text>
          </Card>
        )}

        <Card variant="plain" padding={0} style={{ gap: 6 }}>
          <Text variant="caption" color="textFaint">
            How it works: market cap ≈ PAT × sector P/E, lifted by a growth premium. Issue size assumes promoters dilute 20–30%, with a ±10% band on valuation. Actual pricing depends on three-year profit consistency, earnings quality, listed-peer valuations, market sentiment and anchor demand. Directional estimate only, not a valuation.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", gap: 10, paddingVertical: 28 },
});
