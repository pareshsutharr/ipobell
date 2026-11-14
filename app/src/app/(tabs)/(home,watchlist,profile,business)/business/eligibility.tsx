// Eligibility check — NSE Emerge / BSE SME / Main Board criteria evaluated live as the owner answers.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Button, Card, Chip, PressableScale, Screen, Text, type ChipTone } from "@/components/ui";
import { CheckRow, Field, NumberField, PillChoice, YES_NO } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { checkEligibility, eligibilityPayload, EMPTY_ELIGIBILITY, type Count03, type EligibilityInput, type EligibilityVerdict, type PlatformResult, type TrackRecord } from "@/features/business/tools";
import { useBusinessRules } from "@/features/business/useBusinessRules";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

const VERDICT: Record<EligibilityVerdict, { label: string; tone: ChipTone; icon: React.ComponentProps<typeof Ionicons>["name"] }> = {
  eligible: { label: "Likely eligible", tone: "gain", icon: "checkmark-circle" },
  gaps: { label: "Gaps to close", tone: "warning", icon: "alert-circle" },
  blocked: { label: "Not eligible now", tone: "loss", icon: "close-circle" },
  incomplete: { label: "Answer more", tone: "neutral", icon: "ellipse-outline" },
};

const COUNT_OPTIONS: { value: Count03; label: string }[] = [
  { value: 0, label: "None" },
  { value: 1, label: "1 of 3" },
  { value: 2, label: "2 of 3" },
  { value: 3, label: "All 3" },
];
const TRACK_OPTIONS: { value: TrackRecord; label: string }[] = [
  { value: "lt1", label: "Under 1 year" },
  { value: "1to2", label: "1–2 years" },
  { value: "2to3", label: "2–3 years" },
  { value: "3plus", label: "3+ years" },
];

type NumKey = "netWorthLatest" | "netWorthPrevious" | "netTangibleAssets" | "leverage" | "postIssueCapital" | "issueSize" | "ofsPortion" | "gcpAmount";

export default function EligibilityScreen() {
  const { spacing } = useTheme();
  const [input, setInput] = useState<EligibilityInput>(EMPTY_ELIGIBILITY);
  const [text, setText] = useState<Record<NumKey, string>>({ netWorthLatest: "", netWorthPrevious: "", netTangibleAssets: "", leverage: "", postIssueCapital: "", issueSize: "", ofsPortion: "", gcpAmount: "" });
  const [expanded, setExpanded] = useState<string | null>(null);

  const rules = useBusinessRules();
  const result = useMemo(() => checkEligibility(input, rules.eligibility), [input, rules.eligibility]);
  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    trackTool("eligibility", "start");
  }, []);
  useEffect(() => {
    const incomplete = result.platforms.every((p) => p.verdict === "incomplete");
    if (incomplete) return;
    const key = `${result.recommended ?? "none"}:${result.platforms.map((p) => p.verdict).join(",")}`;
    if (key === lastTracked.current) return;
    lastTracked.current = key;
    trackTool("eligibility", "complete", { recommended: result.recommended ?? "none", verdicts: result.platforms.map((p) => `${p.key}=${p.verdict}`).join(","), blockers: result.blockers.length });
  }, [result]);
  const set = <K extends keyof EligibilityInput>(k: K, v: EligibilityInput[K]) => setInput((i) => ({ ...i, [k]: v }));
  const setNum = (k: NumKey) => (t: string, n: number | null) => {
    setText((x) => ({ ...x, [k]: t }));
    set(k, n);
  };
  const rec = result.recommended ? result.platforms.find((p) => p.key === result.recommended) : null;
  const enough = result.answered >= 8;

  return (
    <Screen>
      <PageHeader title="Eligibility check" subtitle="NSE Emerge · BSE SME · Main Board" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.xl }} keyboardShouldPersistTaps="handled">
        {/* Live verdict */}
        <Card variant={result.blockers.length ? "surface" : "primary"} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="h3">Where you stand</Text>
            <Text variant="caption" color="textMuted" numeric>
              {result.answered}/{result.total} answered
            </Text>
          </View>
          {result.platforms.map((p) => (
            <PlatformRow key={p.key} p={p} expanded={expanded === p.key} onToggle={() => setExpanded(expanded === p.key ? null : p.key)} />
          ))}
          {result.blockers.length ? (
            <Text variant="caption" color="loss">
              One or more compliance answers block a listing application right now. These usually need a cure period or a resolution first; talk to us about the path.
            </Text>
          ) : rec && enough ? (
            <Text variant="bodySm" color="textMuted">
              Based on your answers, <Text variant="bodySm" weight="semibold">{rec.name}</Text> looks like the natural route. {rec.failing.length ? `${rec.failing.length} criteria still need work.` : "Core criteria appear to be met."}
            </Text>
          ) : (
            <Text variant="caption" color="textMuted">
              Answer the questions below; results update as you go. Indicative only, criteria change and the exchange decides.
            </Text>
          )}
        </Card>

        {/* 1. Company */}
        <Group title="1 · The company">
          <Field label="Track record of operations" hint="Include the predecessor firm if you converted from a proprietorship, partnership or LLP.">
            <PillChoice options={TRACK_OPTIONS} value={input.trackRecord} onChange={(v) => set("trackRecord", v)} />
          </Field>
          <Field label="Converted from a proprietorship, partnership or LLP?">
            <PillChoice options={YES_NO} value={input.converted} onChange={(v) => set("converted", v)} />
          </Field>
          <Field label="Promoter change in the last year?">
            <PillChoice options={YES_NO} value={input.promoterChangedLastYear} onChange={(v) => set("promoterChangedLastYear", v)} />
          </Field>
        </Group>

        {/* 2. Financials */}
        <Group title="2 · Financials (restated, consolidated)">
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field label="Net worth, latest FY" style={{ flex: 1 }}>
              <NumberField value={text.netWorthLatest} onChange={setNum("netWorthLatest")} placeholder="e.g. 4.2" />
            </Field>
            <Field label="Net worth, year before" style={{ flex: 1 }}>
              <NumberField value={text.netWorthPrevious} onChange={setNum("netWorthPrevious")} placeholder="e.g. 3.1" />
            </Field>
          </View>
          <Field label="Net tangible assets, latest FY">
            <NumberField value={text.netTangibleAssets} onChange={setNum("netTangibleAssets")} placeholder="e.g. 5" />
          </Field>
          <Field label="Years in the last 3 with operating profit (EBITDA) of at least ₹1 Cr">
            <PillChoice options={COUNT_OPTIONS} value={input.operatingProfitYears} onChange={(v) => set("operatingProfitYears", v)} />
          </Field>
          <Field label="Operating profit in the most recent full FY?">
            <PillChoice options={YES_NO} value={input.operatingProfitLatest} onChange={(v) => set("operatingProfitLatest", v)} />
          </Field>
          <Field label="Years in the last 3 with positive free cash flow to equity">
            <PillChoice options={COUNT_OPTIONS} value={input.fcfePositiveYears} onChange={(v) => set("fcfePositiveYears", v)} />
          </Field>
          <Field label="Leverage (total debt ÷ equity)" hint="From the latest audited balance sheet.">
            <NumberField value={text.leverage} onChange={setNum("leverage")} placeholder="e.g. 1.4" prefix="" suffix="×" />
          </Field>
          <Field label="Is this a finance company (NBFC etc.)?">
            <PillChoice options={YES_NO} value={input.financeCompany} onChange={(v) => set("financeCompany", v)} />
          </Field>
        </Group>

        {/* 3. Proposed issue */}
        <Group title="3 · Proposed issue">
          <Field label="Expected post-issue paid-up equity capital" hint="₹1–25 Cr → SME platforms · above ₹25 Cr → Main Board.">
            <NumberField value={text.postIssueCapital} onChange={setNum("postIssueCapital")} placeholder="e.g. 12" />
          </Field>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field label="Total issue size" style={{ flex: 1 }}>
              <NumberField value={text.issueSize} onChange={setNum("issueSize")} placeholder="e.g. 20" />
            </Field>
            <Field label="Offer-for-sale portion" style={{ flex: 1 }}>
              <NumberField value={text.ofsPortion} onChange={setNum("ofsPortion")} placeholder="e.g. 2" />
            </Field>
          </View>
          <Field label="Amount for general corporate purposes" hint="Capped at 15% of the issue or ₹10 Cr, whichever is lower.">
            <NumberField value={text.gcpAmount} onChange={setNum("gcpAmount")} placeholder="e.g. 2.5" />
          </Field>
        </Group>

        {/* 4. Compliance */}
        <Group title="4 · Compliance & disclosures">
          <YesNoRow label="Listing application rejected by an exchange in the last 6 months?" value={input.rejectedLast6m} onChange={(v) => set("rejectedLast6m", v)} />
          <YesNoRow label="Company or promoting company referred to BIFR / admitted under the Insolvency Code?" value={input.insolvency} onChange={(v) => set("insolvency", v)} />
          <YesNoRow label="Winding-up petition admitted by NCLT or a court?" value={input.windingUp} onChange={(v) => set("windingUp", v)} />
          <YesNoRow label="Pending defaults on debentures, bonds or fixed deposits?" value={input.debentureDefault} onChange={(v) => set("debentureDefault", v)} />
          <YesNoRow label="Defaults to banks or financial institutions in the past 3 years?" value={input.bankDefault3y} onChange={(v) => set("bankDefault3y", v)} />
          <YesNoRow label="Material regulatory action against promoters or group companies in the past year?" value={input.regulatoryAction} onChange={(v) => set("regulatoryAction", v)} />
          <YesNoRow label="Any director charge-sheeted for an economic offence, or under investigation?" value={input.directorChargesheet} onChange={(v) => set("directorChargesheet", v)} />
          <YesNoRow label="Restated, consolidated audited financials for the last 3 years available?" value={input.auditedThreeYears} onChange={(v) => set("auditedThreeYears", v)} />
        </Group>

        <LeadForm
          source="eligibility-check"
          title="Get an honest read from our team"
          subtitle="Send your answers and an advisor will confirm eligibility against current exchange norms and recommend NSE Emerge, BSE SME or the Main Board."
          cta="Send to our team"
          message={`Eligibility self-check: ${result.platforms.map((p) => `${p.name} – ${VERDICT[p.verdict].label}`).join(", ")}${rec ? `. Suggested: ${rec.name}` : ""}`}
          payload={eligibilityPayload(input, result)}
        />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button title="Reset" variant="ghost" onPress={() => { setInput(EMPTY_ELIGIBILITY); setText({ netWorthLatest: "", netWorthPrevious: "", netTangibleAssets: "", leverage: "", postIssueCapital: "", issueSize: "", ofsPortion: "", gcpAmount: "" }); }} />
        </View>
        <Text variant="caption" color="textFaint">
          Thresholds reflect SEBI ICDR and exchange criteria as published by Be IPO Ready. Main Board profitability (₹15 Cr average operating profit over 3 of 5 years) is not tested here. The exchange&apos;s decision is final.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function PlatformRow({ p, expanded, onToggle }: { p: PlatformResult; expanded: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const v = VERDICT[p.verdict];
  const answered = p.checks.filter((c) => c.ok !== null);
  const passed = answered.filter((c) => c.ok).length;
  return (
    <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 10 }}>
      <PressableScale onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.platform}>
        <Ionicons name={v.icon} size={20} color={v.tone === "neutral" ? colors.textFaint : v.tone === "gain" ? colors.gain : v.tone === "warning" ? colors.warning : colors.loss} />
        <Text variant="title" style={{ flex: 1 }}>
          {p.name}
        </Text>
        <Chip label={v.label} tone={v.tone} variant="soft" size="sm" />
        <Text variant="caption" color="textFaint" numeric>
          {passed}/{answered.length}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
      </PressableScale>
      {expanded ? (
        <View style={{ marginTop: 6 }}>
          {p.checks.map((c, i) => (
            <CheckRow key={c.label} ok={c.ok} label={c.label} detail={c.detail} last={i === p.checks.length - 1} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 16 }}>
      <Text variant="overline" color="textFaint">
        {title}
      </Text>
      {children}
    </View>
  );
}

function YesNoRow({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="bodySm">{label}</Text>
      <PillChoice options={YES_NO} value={value} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  platform: { flexDirection: "row", alignItems: "center", gap: 8 },
});
