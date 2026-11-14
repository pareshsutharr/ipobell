// "Send to our team" — one form reused by every tool. Remembers the contact on-device, posts the
// tool's inputs/results alongside, and shows a done state with call / WhatsApp shortcuts.
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Button, Card, PressableScale, Text } from "@/components/ui";
import { Field, TextField } from "@/features/business/components/Fields";
import { LeadError, normalizePhone, useSavedContact, useSubmitLead, validateContact, type LeadSource } from "@/features/business/leads";
import { env } from "@/lib/env";
import { openExternal, track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface Props {
  source: LeadSource;
  title?: string;
  subtitle?: string;
  cta?: string;
  /** Tool inputs / results, human-readable keys. */
  payload?: Record<string, unknown>;
  message?: string;
  readinessScore?: number;
  showMessage?: boolean;
  onSent?: (id: string) => void;
}

const LEAD_TOOL: Record<string, string> = { "readiness-tool": "readiness", "eligibility-check": "eligibility", "issue-size-calculator": "issue_size", "issue-cost-estimator": "issue_cost", "sme-ipo-checklist": "checklist", "book-call": "book_call", "business-hub": "book_call" };

export function LeadForm({ source, title = "Talk to our IPO team", subtitle = "Share your details and a Be IPO Ready advisor will call you back within one working day.", cta = "Request a call back", payload, message, readinessScore, showMessage, onSent }: Props) {
  const { colors, spacing, radius } = useTheme();
  const [contact, saveContact] = useSavedContact();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const submit = useSubmitLead();

  const set = (k: keyof typeof contact) => (v: string) => {
    setError(null);
    saveContact({ ...contact, [k]: k === "phone" ? normalizePhone(v) : v });
  };

  const onSend = async () => {
    const v = validateContact(contact);
    if (v) {
      setError(v);
      return;
    }
    try {
      const id = await submit.mutateAsync({
        ...contact,
        source,
        payload,
        readinessScore,
        message: [message, note.trim()].filter(Boolean).join("\n\n") || undefined,
      });
      setSentId(id);
      track("lead_submit", { source, tool: LEAD_TOOL[source], has_phone: Boolean(contact.phone.trim()), has_email: Boolean(contact.email.trim()), has_company: Boolean(contact.company.trim()), readiness_score: readinessScore ?? null });
      onSent?.(id);
    } catch (e) {
      setError(e instanceof LeadError ? e.message : "Couldn't send right now. Please try again or call us.");
    }
  };

  const open = (url: string, label?: string) => openExternal(url, label);

  if (sentId) {
    return (
      <Card variant="primary" style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="checkmark-circle" size={26} color={colors.gain} />
          <Text variant="h3" style={{ flex: 1 }}>
            Sent to our team
          </Text>
        </View>
        <Text variant="bodySm" color="textMuted">
          Thanks {contact.name.trim().split(" ")[0]}. An advisor will reach you on {contact.phone.trim() || contact.email.trim()}. Prefer to talk now?
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <Button title="Call" icon="call-outline" variant="dark" size="sm" onPress={() => open(env.links.support, "Call")} />
          <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" size="sm" onPress={() => open(env.links.whatsapp, "WhatsApp")} />
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        <Text variant="h3">{title}</Text>
        <Text variant="bodySm" color="textMuted" style={{ marginTop: 4 }}>
          {subtitle}
        </Text>
      </View>
      <Field label="Your name" required>
        <TextField value={contact.name} onChangeText={set("name")} placeholder="Full name" autoCapitalize="words" autoComplete="name" maxLength={80} />
      </Field>
      <Field label="Company">
        <TextField value={contact.company} onChangeText={set("company")} placeholder="Company name (optional)" autoCapitalize="words" autoComplete="organization" maxLength={120} />
      </Field>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Mobile" style={{ flex: 1 }}>
          <TextField value={contact.phone} onChangeText={set("phone")} placeholder="98765 43210" keyboardType="phone-pad" autoComplete="tel" maxLength={16} />
        </Field>
        <Field label="Email" style={{ flex: 1.2 }}>
          <TextField value={contact.email} onChangeText={set("email")} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={120} />
        </Field>
      </View>
      {showMessage ? (
        <Field label="Anything we should know?">
          <TextField value={note} onChangeText={setNote} placeholder="Sector, turnover, timeline, questions…" multiline maxLength={1000} />
        </Field>
      ) : null}
      {error ? (
        <Text variant="caption" color="loss">
          {error}
        </Text>
      ) : null}
      <Button title={cta} iconRight="arrow-forward" variant="dark" size="lg" fullWidth loading={submit.isPending} onPress={() => void onSend()} />
      <View style={[styles.alt, { borderTopColor: colors.border }]}>
        <Text variant="caption" color="textFaint" style={{ flex: 1 }}>
          Or reach us directly
        </Text>
        <PressableScale onPress={() => open(env.links.support)} accessibilityRole="link" style={[styles.altBtn, { borderRadius: radius.sm }]}>
          <Ionicons name="call-outline" size={14} color={colors.brand} />
          <Text variant="caption" color="brand" weight="semibold">
            {env.brand.phone}
          </Text>
        </PressableScale>
        <PressableScale onPress={() => open(env.links.whatsapp)} accessibilityRole="link" style={[styles.altBtn, { borderRadius: radius.sm }]}>
          <Ionicons name="logo-whatsapp" size={14} color={colors.gain} />
          <Text variant="caption" color="gain" weight="semibold">
            WhatsApp
          </Text>
        </PressableScale>
      </View>
      <Text variant="caption" color="textFaint">
        Your details are used only to discuss your company&apos;s listing readiness. No spam.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  alt: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  altBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
});
