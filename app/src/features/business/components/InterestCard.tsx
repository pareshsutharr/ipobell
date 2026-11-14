// "What are you planning?" on the Get Listed tab: fundraising, a pre-IPO round or an IPO. The choice travels with
// the enquiry (payload "Interest" and the first line of the message), so the team knows what the call is about.
import React, { useState } from "react";
import { View } from "react-native";

import { Card, Text } from "@/components/ui";
import { PillChoice, type Option } from "@/features/business/components/Fields";
import { LeadForm } from "@/features/business/components/LeadForm";
import { INTEREST_TYPES, interestLead, type InterestType } from "@/features/business/interest";

const OPTIONS: Option<InterestType>[] = INTEREST_TYPES.map((t) => ({ value: t.value, label: t.label }));

export function InterestCard() {
  const [interest, setInterest] = useState<InterestType>("fundraising");
  const lead = interestLead(interest);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 12 }}>
        <Text variant="h3">Raising money before an IPO?</Text>
        <Text variant="bodySm" color="textMuted">
          Tell us what you are planning and the right advisor will call you: growth capital now, a pre-IPO round, or the listing itself.
        </Text>
        <PillChoice options={OPTIONS} value={interest} onChange={setInterest} />
        <Text variant="caption" color="textMuted">
          {lead.blurb}
        </Text>
      </Card>
      {/* key: a different interest is a different enquiry, so the "sent" state does not carry over */}
      <LeadForm key={interest} source="business-hub" title={lead.title} subtitle={lead.subtitle} cta={lead.cta} message={lead.message} payload={lead.payload} showMessage />
    </View>
  );
}
