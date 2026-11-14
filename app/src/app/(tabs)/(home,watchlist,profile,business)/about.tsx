import * as Application from "expo-application";
import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui";
import { TextPage } from "@/features/shell/components/TextPage";
import { env } from "@/lib/env";
import { BrandMark } from "@/features/shell/components/Brand";

export default function AboutScreen() {
  return (
    <TextPage
      title="About Be IPO Ready"
      blocks={[
        {
          paragraphs: [
            "Be IPO Ready is a single place to follow every Mainboard and SME IPO in India — the calendar, price band and lot size, live subscription by category, grey market premium with history, anchor investors, company financials, documents and listing performance.",
            "The bell is the point: we remind you on the days that matter — when an issue opens, closes, when allotment is out, when refunds and demat credit happen and when it lists — plus subscription milestones and GMP moves for the IPOs you watch.",
          ],
        },
        {
          heading: "Data source",
          paragraphs: ["IPO, GMP, subscription and company data is provided by IPO Guru (ipoguru.in) and refreshed every few minutes during market hours. Listing prices and current market prices come from exchange data via the same source."],
        },
        {
          heading: "Premium",
          paragraphs: ["Be IPO Ready is free to use. No ads, no sign-up — your watchlist and saved PANs live on this device's anonymous account."],
        },
        {
          heading: "Important",
          paragraphs: ["Be IPO Ready is an information app, not an adviser. See the Disclaimer for details."],
        },
      ]}
      links={[
        { label: "Data by IPO Guru", url: env.links.dataAttribution },
        { label: "Website", url: env.links.website },
        { label: "Contact support", url: env.links.support },
      ]}
    >
      <View style={styles.hero}>
        <BrandMark size={64} />
        <View>
          <Text variant="h2">Be IPO Ready</Text>
          <Text variant="bodySm" color="textMuted" numeric>
            Version {Application.nativeApplicationVersion ?? "1.0.0"} ({Application.nativeBuildVersion ?? "dev"})
          </Text>
        </View>
      </View>
    </TextPage>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 },
  logo: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
