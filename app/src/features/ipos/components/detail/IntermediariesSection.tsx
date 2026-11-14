import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Linking, StyleSheet, View } from "react-native";

import { PressableScale, Section, Text } from "@/components/ui";
import { openUrl } from "@/features/ipos/components/detail/helpers";
import type { Ipo, LeadManager } from "@/features/ipos/types";
import { initials } from "@/lib/format";
import { useTheme } from "@/lib/theme/ThemeProvider";

function Logo({ uri, name }: { uri: string | null | undefined; name: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={[styles.logo, { borderColor: colors.border, borderRadius: radius.sm }]}>
      {uri ? (
        <Image source={{ uri }} style={styles.logoImg} contentFit="contain" transition={150} cachePolicy="memory-disk" />
      ) : (
        <Text variant="caption" color="textMuted">
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

function ContactLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} style={styles.link} accessibilityRole="link">
      <Ionicons name={icon} size={13} color={colors.brand} />
      <Text variant="caption" color="brand" numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </PressableScale>
  );
}

function contactLinks(c: { phone?: string | null; email?: string | null; website?: string | null }) {
  const out: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }[] = [];
  if (c.website) out.push({ icon: "globe-outline", label: c.website.replace(/^https?:\/\//, "").replace(/\/$/, ""), onPress: () => openUrl(c.website) });
  if (c.email) out.push({ icon: "mail-outline", label: c.email, onPress: () => Linking.openURL(`mailto:${c.email}`).catch(() => undefined) });
  if (c.phone) out.push({ icon: "call-outline", label: c.phone, onPress: () => Linking.openURL(`tel:${(c.phone ?? "").replace(/\s+/g, "")}`).catch(() => undefined) });
  return out;
}

export function IntermediariesSection({ ipo }: { ipo: Ipo }) {
  const { colors } = useTheme();
  const reg = ipo.registrar;
  const lms = (ipo.lead_managers ?? []).filter((l): l is LeadManager => Boolean(l && l.name));
  const cc = ipo.company_contact ?? {};
  const hasReg = Boolean(reg && reg.name);
  const hasContact = Boolean(cc.website || cc.email || cc.phone);
  if (!hasReg && !lms.length && !hasContact) return null;

  return (
    <View>
      {hasReg && reg ? (
        <Section title="Registrar">
          <View style={styles.row}>
            <Logo uri={reg.logo} name={reg.name ?? "R"} />
            <View style={{ flex: 1 }}>
              <Text variant="title">{reg.name}</Text>
              <Text variant="caption" color="textMuted">
                Handles allotment & refunds
              </Text>
            </View>
          </View>
          <View style={styles.links}>
            {reg.status_page ? <ContactLink icon="search-outline" label="Allotment status page" onPress={() => openUrl(reg.status_page)} /> : null}
            {contactLinks(reg).map((l) => (
              <ContactLink key={l.label} {...l} />
            ))}
          </View>
        </Section>
      ) : null}

      {lms.length ? (
        <Section title="Lead managers" subtitle={`${lms.length} book running lead manager${lms.length > 1 ? "s" : ""}`}>
          {lms.map((l, i) => (
            <View key={(l.slug ?? l.name ?? "") + i} style={[styles.row, styles.lm, i < lms.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Logo uri={l.logo} name={l.name ?? "LM"} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" numberOfLines={2}>
                  {l.name}
                </Text>
                {l.website || l.email ? (
                  <View style={[styles.links, { marginTop: 4 }]}>
                    {contactLinks({ website: l.website, email: l.email }).map((x) => (
                      <ContactLink key={x.label} {...x} />
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {hasContact ? (
        <Section title="Company contact">
          {cc.address ? (
            <Text variant="bodySm" color="textMuted" style={{ marginBottom: 8 }}>
              {cc.address}
            </Text>
          ) : null}
          <View style={styles.links}>
            {contactLinks(cc).map((l) => (
              <ContactLink key={l.label} {...l} />
            ))}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  lm: { paddingVertical: 10 },
  logo: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  logoImg: { width: 32, height: 32 },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 6, marginTop: 10 },
  link: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: "100%" },
});
