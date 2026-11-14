// Book an IPO readiness call — contact form + direct call / WhatsApp / office details.
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { Card, PressableScale, Screen, Text } from "@/components/ui";
import { LeadForm } from "@/features/business/components/LeadForm";
import { PageHeader } from "@/features/shell/components/PageHeader";
import { env } from "@/lib/env";
import { openExternal, trackTool } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

const AGENDA = ["Where your company stands on eligibility and readiness", "NSE Emerge vs BSE SME vs Main Board for your profile", "Indicative issue size, valuation range and cost", "A realistic month-by-month timeline to listing"];

export default function BookCallScreen() {
  const { colors, spacing, radius } = useTheme();
  const open = (url: string, label?: string) => openExternal(url, label);
  useEffect(() => {
    trackTool("book_call", "start");
  }, []);
  return (
    <Screen>
      <PageHeader title="Book a readiness call" subtitle="30 minutes · free · no obligation" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 48, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <Card variant="alt" style={{ gap: 8 }}>
          <Text variant="overline" color="textFaint">
            What we cover
          </Text>
          {AGENDA.map((a) => (
            <View key={a} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Ionicons name="checkmark-circle" size={16} color={colors.gain} style={{ marginTop: 2 }} />
              <Text variant="bodySm" style={{ flex: 1 }}>
                {a}
              </Text>
            </View>
          ))}
        </Card>

        <LeadForm source="book-call" title="Request a call back" subtitle="Tell us a little about the company and we'll call at a time that suits you." cta="Request call back" showMessage />

        <Card padding={0}>
          <Row icon="call-outline" title="Call us" subtitle={env.brand.phone} onPress={() => open(env.links.support)} />
          <Row icon="logo-whatsapp" title="WhatsApp" subtitle="Chat with an advisor" onPress={() => open(env.links.whatsapp)} />
          <Row icon="mail-outline" title="Contact page" subtitle="beipoready.com/contact-us" onPress={() => open(env.links.contact)} />
          <Row icon="location-outline" title="Office" subtitle={`2001, 20th Floor, The Junomoneta Tower, Adajan, Surat 395009`} onPress={() => open("https://maps.google.com/?q=The+Junomoneta+Tower+Adajan+Surat")} last />
        </Card>
        <Text variant="caption" color="textFaint" style={{ borderRadius: radius.sm }}>
          Be IPO Ready advises companies on fundraising and listing. The IPO tracker in this app is information only and not investment advice.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Row({ icon, title, subtitle, onPress, last }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; subtitle: string; onPress: () => void; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="link" scaleTo={0.99} style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name={icon} size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="title">{title}</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textFaint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
