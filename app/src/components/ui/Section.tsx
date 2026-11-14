import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface SectionProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Plain section: bold heading, optional subtitle, content. Sections are separated by a thick light band. */
export function Section({ title, subtitle, right, children, style }: SectionProps) {
  const { spacing, colors } = useTheme();
  return (
    <View style={[{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, borderTopWidth: 6, borderTopColor: colors.surfaceAlt }, style]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="h3">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon = "file-tray-outline", title, message, actionLabel, onAction, compact }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, compact && { paddingVertical: 24 }]}>
      <Ionicons name={icon} size={32} color={colors.textFaint} />
      <Text variant="title" align="center" style={{ marginTop: 12 }}>
        {title}
      </Text>
      {message ? (
        <Text variant="bodySm" color="textMuted" align="center" style={{ marginTop: 6, maxWidth: 280 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} variant="secondary" size="sm" style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={message ?? "Check your connection and try again."} actionLabel={onRetry ? "Retry" : undefined} onAction={onRetry} />;
}

/** Label / value row with a hairline under it (used for key details). */
export function KeyValueRow({ label, value, valueColor, last, numeric = true }: { label: string; value: string; valueColor?: string; last?: boolean; numeric?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.kv, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Text variant="bodySm" color="textMuted" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="numSm" color={valueColor ?? colors.text} numeric={numeric} style={{ flexShrink: 1, textAlign: "right" }}>
        {value}
      </Text>
    </View>
  );
}

/** Two-column stat: small grey label over a value (Groww "Min invest / Price range" style). */
export function Stat({ label, value, sub, valueColor, align = "left" }: { label: string; value: string; sub?: string; valueColor?: string; align?: "left" | "right" }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: align === "right" ? "flex-end" : "flex-start" }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant="numMd" color={valueColor ?? colors.text} numeric style={{ marginTop: 2 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" color="textFaint" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function Disclaimer({ compact }: { compact?: boolean }) {
  const { spacing } = useTheme();
  return (
    <Text variant="caption" color="textFaint" style={{ paddingHorizontal: spacing.lg, paddingVertical: compact ? 10 : 16, lineHeight: 17 }}>
      Information only, not investment advice. Be IPO Ready is not a SEBI-registered advisor. GMP is an unofficial grey-market indicator and may be inaccurate. Data by IPO Guru.
    </Text>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 12, gap: 12 },
  empty: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 24 },
  kv: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, gap: 12 },
});
