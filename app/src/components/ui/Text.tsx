import React from "react";
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";

import { useTheme } from "@/lib/theme/ThemeProvider";
import type { ThemeColors, TypographyVariant } from "@/lib/theme/tokens";

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: keyof ThemeColors | (string & {});
  align?: TextStyle["textAlign"];
  weight?: "regular" | "medium" | "semibold" | "bold" | "extrabold";
  /** Tabular numerals for figures that align in columns. */
  numeric?: boolean;
}

export function Text({ variant = "body", color = "text", align, weight, numeric, style, children, ...rest }: TextProps) {
  const theme = useTheme();
  const resolvedColor = color in theme.colors ? theme.colors[color as keyof ThemeColors] : color;
  const base = theme.typography[variant];
  const fontFamily = weight ? theme.fonts[weight] : undefined;
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: resolvedColor },
        fontFamily ? { fontFamily } : null,
        align ? { textAlign: align } : null,
        numeric ? { fontVariant: ["tabular-nums"] } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
