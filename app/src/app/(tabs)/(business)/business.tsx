// "Get Listed" tab — the Be IPO Ready advisory tools for business owners, CFOs and promoters:
// readiness score, eligibility check, issue size & cost estimators, SME listing checklist, and a
// call-back form. Everything here is lead generation for the advisory business.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, PressableScale, Screen, Text } from "@/components/ui";
import { ToolCard } from "@/features/business/components/Fields";
import { CaseStudies } from "@/features/business/components/CaseStudies";
import { InterestCard } from "@/features/business/components/InterestCard";
import { LeadForm } from "@/features/business/components/LeadForm";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { openExternal } from "@/lib/analytics";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { palette } from "@/lib/theme/tokens";

const SERVICES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; url: string }[] = [
  { icon: "cash-outline", title: "Fundraising & growth capital", body: "Raise from the right investors on the right terms.", url: "https://beipoready.com/services/fund-raising" },
  { icon: "construct-outline", title: "Pre-IPO advisory", body: "Finances, governance and capital structure made listing-ready.", url: "https://beipoready.com/services/pre-ipo-advisory" },
  { icon: "trending-up-outline", title: "SME IPO advisory", body: "End-to-end listing on NSE Emerge, BSE SME or the Main Board.", url: env.links.smeAdvisory },
  { icon: "pie-chart-outline", title: "Valuation & restructuring", body: "Know what the company is worth and structure it to match.", url: "https://beipoready.com/services/valuation-corporate-restructuring" },
];

export default function BusinessScreen() {
  const { colors, spacing, radius } = useTheme();
  const open = (url: string, label?: string) => openExternal(url, label);

  return (
    <Screen>
      <PageHeader title="Get Listed" subtitle="For business owners, promoters & CFOs" noBack />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={[styles.hero, { borderRadius: radius.lg, backgroundColor: palette.navy900 }]}>
          <Text variant="overline" color={palette.gold}>
            SME IPO advisory · Surat
          </Text>
          <Text variant="h1" color={palette.white} style={{ marginTop: 8 }}>
            Thinking about taking your company public?
          </Text>
          <Text variant="bodySm" color="rgba(255,255,255,0.72)" style={{ marginTop: 10 }}>
            Find out in 10 minutes whether your business is IPO-ready, which exchange fits, how much you could raise and what it would cost. Then talk to the team that has done it.
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            <Button title="Check IPO readiness" icon="speedometer-outline" variant="gold" textColor={palette.white} onPress={() => router.push("/business/readiness")} />
            <Button title="Book a call" variant="secondary" textColor={palette.white} style={{ borderColor: "rgba(255,255,255,0.55)" }} onPress={() => router.push("/business/book-call")} />
          </View>
        </View>

        {/* Tools */}
        <View style={{ gap: 10 }}>
          <Text variant="overline" color="textFaint">
            Free tools
          </Text>
          <ToolCard icon="speedometer-outline" title="IPO Readiness Score" subtitle="20 questions across financials, governance, systems, market and promoters. Get a score and a timeline." meta="≈ 8 min · instant score" tone="primary" badge="Start here" onPress={() => router.push("/business/readiness")} />
          <ToolCard icon="git-compare-outline" title="Eligibility Check" subtitle="NSE Emerge vs BSE SME vs Main Board — see which criteria you meet today." meta="≈ 5 min" tone="sme" onPress={() => router.push("/business/eligibility")} />
          <ToolCard icon="calculator-outline" title="Issue Size Calculator" subtitle="How much could your company raise? PAT × sector multiple with a growth premium." meta="≈ 1 min" tone="gain" onPress={() => router.push("/business/issue-size")} />
          <ToolCard icon="receipt-outline" title="Issue Cost Estimator" subtitle="Lead manager, underwriting, market making, registrar… the full cost of an SME IPO, stage by stage." meta="≈ 1 min" tone="warning" onPress={() => router.push("/business/issue-cost")} />
          <ToolCard icon="checkbox-outline" title="SME IPO Listing Checklist" subtitle="32 steps from eligibility to post-listing compliance. Tick them off as you go." meta="Saved on this device" tone="info" onPress={() => router.push("/business/checklist")} />
          <ToolCard icon="stats-chart-outline" title="Valuation Range" subtitle="What the company could be worth, by our sector multiple and by what listed peers came at." meta="≈ 1 min" tone="gain" onPress={() => router.push("/business/valuation")} />
          <ToolCard icon="people-outline" title="Compare My Company" subtitle="Your revenue, margins and debt against listed IPOs in your sector." meta="≈ 2 min" tone="info" onPress={() => router.push("/business/peers")} />
          <ToolCard icon="document-text-outline" title="Balance Sheet Check" subtitle="Choose your statements file or type the figures. See eight ratios and how they compare with the SME listing limits." meta="≈ 3 min · read on your phone" tone="sme" onPress={() => router.push("/business/health-check")} />
          <ToolCard icon="pie-chart-outline" title="IPOs by Sector" subtitle="How many companies in your sector have listed, how they were subscribed and how they listed." meta="Live from our IPO data" tone="mainboard" onPress={() => router.push("/sectors")} />
        </View>

        {/* Why SME IPO */}
        <View style={{ gap: 10 }}>
          <Text variant="overline" color="textFaint">
            Why list
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat icon="wallet-outline" title="Growth capital" body="Equity without personal guarantees or EMI pressure." />
            <Stat icon="ribbon-outline" title="Credibility" body="Listed status with banks, customers and talent." />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Stat icon="swap-horizontal-outline" title="Liquidity" body="A market price and an exit route for early investors." />
            <Stat icon="shield-checkmark-outline" title="Governance" body="Institutional-grade systems that outlast the founder." />
          </View>
        </View>

        {/* Case studies written by the team in the admin panel */}
        <CaseStudies />

        {/* Services */}
        <View style={{ gap: 10 }}>
          <Text variant="overline" color="textFaint">
            What we do
          </Text>
          <Card padding={0}>
            {SERVICES.map((s, i) => (
              <PressableScale key={s.title} onPress={() => open(s.url, s.title)} accessibilityRole="link" scaleTo={0.99} style={[styles.service, i < SERVICES.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <View style={[styles.serviceIcon, { backgroundColor: colors.brandSoft, borderRadius: radius.md }]}>
                  <Ionicons name={s.icon} size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="title">{s.title}</Text>
                  <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                    {s.body}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color={colors.textFaint} />
              </PressableScale>
            ))}
          </Card>
        </View>

        {/* Fundraising / pre-IPO / IPO interest */}
        <InterestCard />

        {/* Lead form */}
        <LeadForm source="business-hub" title="Book an IPO readiness call" subtitle="A 30-minute, no-obligation conversation about your company, the right exchange and a realistic timeline." cta="Book my call" showMessage />

        <View style={{ gap: 6 }}>
          <Text variant="caption" color="textFaint">
            {env.brand.name} / Jainam Capital Advisors · {env.brand.address}
          </Text>
          <Text variant="caption" color="textFaint">
            Tools give indicative, directional estimates for planning and are not a valuation, legal opinion or eligibility confirmation. Exchange and SEBI criteria change; our team verifies current norms with you.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, gap: 6 }} padding={14}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text variant="title">{title}</Text>
      <Text variant="caption" color="textMuted">
        {body}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20 },
  service: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  serviceIcon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
});
