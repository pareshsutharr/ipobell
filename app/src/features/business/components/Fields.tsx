// Form primitives for the Get Listed tools: labelled text / number inputs, single-choice option
// lists, yes/no toggles, a score bar and the tool cards on the hub. Flat, hairline style like the rest.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, TextInput, View, type KeyboardTypeOptions, type StyleProp, type ViewStyle } from "react-native";

import { PressableScale, Text, useToneColors, type ChipTone } from "@/components/ui";
import { useTheme } from "@/lib/theme/ThemeProvider";

interface FieldProps {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Field({ label, hint, required, children, style }: FieldProps) {
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text variant="label">
        {label}
        {required ? <Text color="loss"> *</Text> : null}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

interface TextFieldProps {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  prefix?: string;
  suffix?: string;
  maxLength?: number;
  multiline?: boolean;
  autoComplete?: "name" | "email" | "tel" | "organization" | "off";
  testID?: string;
}

export function TextField({ value, onChangeText, placeholder, keyboardType, autoCapitalize, prefix, suffix, maxLength, multiline, autoComplete, testID }: TextFieldProps) {
  const { colors, radius, fonts } = useTheme();
  return (
    <View style={[styles.inputWrap, { borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surface }, multiline && { height: 96, alignItems: "flex-start", paddingVertical: 10 }]}>
      {prefix ? (
        <Text variant="title" color="textMuted" style={{ marginRight: 4 }}>
          {prefix}
        </Text>
      ) : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoComplete={autoComplete}
        maxLength={maxLength}
        multiline={multiline}
        style={[styles.input, { color: colors.text, fontFamily: fonts.regular }, multiline && { height: "100%", textAlignVertical: "top" }]}
      />
      {suffix ? (
        <Text variant="label" color="textMuted">
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

/** Numeric input that keeps a string for editing and reports a parsed number (or null). */
export function NumberField({ value, onChange, placeholder, prefix = "₹", suffix = "Cr", allowNegative, testID }: { value: string; onChange: (text: string, n: number | null) => void; placeholder?: string; prefix?: string; suffix?: string; allowNegative?: boolean; testID?: string }) {
  return (
    <TextField
      testID={testID}
      value={value}
      prefix={prefix || undefined}
      suffix={suffix || undefined}
      placeholder={placeholder}
      keyboardType={allowNegative ? "numbers-and-punctuation" : "decimal-pad"}
      onChangeText={(t) => {
        const cleaned = t.replace(allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, "");
        const n = cleaned === "" || cleaned === "-" || cleaned === "." ? null : Number(cleaned);
        onChange(cleaned, n === null || Number.isNaN(n) ? null : n);
      }}
    />
  );
}

export interface Option<T> {
  value: T;
  label: string;
  caption?: string;
}

/** Vertical single-choice list. */
export function OptionList<T extends string | number>({ options, value, onChange, compact }: { options: Option<T>[]; value: T | null | undefined; onChange: (v: T) => void; compact?: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <PressableScale
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            scaleTo={0.99}
            style={[
              styles.option,
              compact && { paddingVertical: 10 },
              { borderRadius: radius.md, borderColor: selected ? colors.text : colors.border, backgroundColor: selected ? colors.surfaceAlt : colors.surface },
            ]}
          >
            <View style={[styles.radio, { borderColor: selected ? colors.text : colors.borderStrong }]}>{selected ? <View style={[styles.radioDot, { backgroundColor: colors.text }]} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text variant={selected ? "title" : "body"}>{o.label}</Text>
              {o.caption ? (
                <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                  {o.caption}
                </Text>
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Horizontal pills for short choices (Yes / No, 0 / 1 / 2 / 3). */
export function PillChoice<T extends string | number | boolean>({ options, value, onChange }: { options: Option<T>[]; value: T | null | undefined; onChange: (v: T) => void }) {
  const { colors, radius } = useTheme();
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <PressableScale
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.pill, { borderRadius: radius.md, borderColor: selected ? colors.text : colors.borderStrong, backgroundColor: selected ? colors.text : "transparent" }]}
          >
            <Text variant="label" color={selected ? colors.background : colors.text}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

export const YES_NO: Option<boolean>[] = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

/** Thin progress / score bar. */
export function ScoreBar({ percent, tone = "primary", height = 8 }: { percent: number; tone?: ChipTone; height?: number }) {
  const { colors } = useTheme();
  const { fg } = useToneColors(tone);
  const w = Math.max(0, Math.min(100, percent));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.surfaceAlt, overflow: "hidden" }}>
      <View style={{ width: `${w}%`, height: "100%", backgroundColor: fg, borderRadius: height / 2 }} />
    </View>
  );
}

/** Hub card for a tool: icon, title, one-liner, time estimate. */
export function ToolCard({ icon, title, subtitle, meta, tone = "primary", onPress, badge }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; meta?: string; tone?: ChipTone; onPress: () => void; badge?: string }) {
  const { colors, radius } = useTheme();
  const { fg, bg } = useToneColors(tone);
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" style={[styles.tool, { borderRadius: radius.md, borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={[styles.toolIcon, { backgroundColor: bg, borderRadius: radius.md }]}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: colors.gainSoft, borderRadius: radius.sm }]}>
              <Text variant="caption" color="gain" weight="semibold">
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="bodySm" color="textMuted" numberOfLines={2} style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
        {meta ? (
          <Text variant="caption" color="textFaint" style={{ marginTop: 6 }}>
            {meta}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </PressableScale>
  );
}

/** Row in a results list: ✓ / ✕ / ○ with label and optional detail. */
export function CheckRow({ ok, label, detail, last }: { ok: boolean | null; label: string; detail?: string; last?: boolean }) {
  const { colors } = useTheme();
  const icon = ok === null ? "ellipse-outline" : ok ? "checkmark-circle" : "close-circle";
  const color = ok === null ? colors.textFaint : ok ? colors.gain : colors.loss;
  return (
    <View style={[styles.checkRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" color={ok === null ? "textMuted" : "text"}>
          {label}
        </Text>
        {detail ? (
          <Text variant="caption" color="textFaint" style={{ marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { height: 48, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  input: { flex: 1, fontSize: 15, height: "100%", paddingVertical: 0 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { height: 38, minWidth: 64, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  tool: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth },
  toolIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },
  badge: { paddingHorizontal: 6, height: 20, justifyContent: "center" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
});
