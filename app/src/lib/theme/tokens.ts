// Design tokens — Be IPO Ready.
// Editorial-finance look: warm paper background, white surfaces, hairline dividers, deep navy for
// brand moments and primary actions, a restrained antique gold accent, green/red only for numbers.
// Type: Poppins throughout (headings 700, UI 400–600).

export type ThemeMode = "dark" | "light";

export const palette = {
  navy950: "#07172E",
  navy900: "#0F2D52",
  navy800: "#174072",
  gold: "#D4A440",       // on navy / dark surfaces
  goldInk: "#A47A1E",    // gold as text on light surfaces (AA on paper)
  goldSoft: "#F3E7C8",
  discOrange: "#FAA51A",
  paper: "#FBFAF7",
  paperDeep: "#F2EFE8",
  white: "#FFFFFF",
  ink: "#1A1F2B",
  ink2: "#3F4756",
  grey: "#6B7280",
  greyLight: "#9AA1AE",
  line: "#E9E6DF",
  lineStrong: "#D6D2C8",
  fill: "#F4F2ED",
  gain: "#15803D",
  gainBright: "#4ADE80",
  loss: "#B91C1C",
  lossBright: "#F87171",
  blue: "#1D4ED8",
  blueBright: "#60A5FA",
  violet: "#5B21B6",
  violetBright: "#A78BFA",
  teal: "#0F766E",
  tealBright: "#2DD4BF",
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textFaint: string;
  textOnPrimary: string;
  textOnBrand: string;
  primary: string;
  primarySoft: string;
  brand: string;
  brandSoft: string;
  brandDeep: string;
  gain: string;
  gainSoft: string;
  loss: string;
  lossSoft: string;
  neutral: string;
  neutralSoft: string;
  info: string;
  infoSoft: string;
  warning: string;
  warningSoft: string;
  sme: string;
  smeSoft: string;
  mainboard: string;
  mainboardSoft: string;
  skeleton: string;
  skeletonHighlight: string;
  overlay: string;
  tabBar: string;
  chartGrid: string;
}

export const lightColors: ThemeColors = {
  background: palette.paper,
  surface: palette.white,
  surfaceAlt: palette.fill,
  surfaceElevated: palette.white,
  border: palette.line,
  borderStrong: palette.lineStrong,
  text: palette.ink,
  textMuted: palette.grey,
  textFaint: palette.greyLight,
  textOnPrimary: palette.white,
  textOnBrand: palette.white,
  primary: palette.goldInk,
  primarySoft: "rgba(164,122,30,0.10)",
  brand: palette.navy900,
  brandSoft: "rgba(15,45,82,0.07)",
  brandDeep: palette.navy950,
  gain: palette.gain,
  gainSoft: "rgba(21,128,61,0.09)",
  loss: palette.loss,
  lossSoft: "rgba(185,28,28,0.08)",
  neutral: palette.grey,
  neutralSoft: palette.fill,
  info: palette.blue,
  infoSoft: "rgba(29,78,216,0.08)",
  warning: palette.goldInk,
  warningSoft: "rgba(164,122,30,0.12)",
  sme: palette.violet,
  smeSoft: "rgba(91,33,182,0.08)",
  mainboard: palette.teal,
  mainboardSoft: "rgba(15,118,110,0.09)",
  skeleton: "#ECE9E2",
  skeletonHighlight: "#F5F3EE",
  overlay: "rgba(17,24,39,0.45)",
  tabBar: palette.white,
  chartGrid: palette.line,
};

export const darkColors: ThemeColors = {
  background: "#0A1120",
  surface: "#0A1120",
  surfaceAlt: "#131B2C",
  surfaceElevated: "#1A2437",
  border: "rgba(255,255,255,0.09)",
  borderStrong: "rgba(255,255,255,0.18)",
  text: "#F4F3EE",
  textMuted: "#A6ACB8",
  textFaint: "#6F7786",
  textOnPrimary: palette.navy950,
  textOnBrand: palette.navy950,
  primary: palette.gold,
  primarySoft: "rgba(212,164,64,0.16)",
  brand: "#E7C77A",
  brandSoft: "rgba(231,199,122,0.12)",
  brandDeep: "#E7C77A",
  gain: palette.gainBright,
  gainSoft: "rgba(74,222,128,0.12)",
  loss: palette.lossBright,
  lossSoft: "rgba(248,113,113,0.12)",
  neutral: "#A6ACB8",
  neutralSoft: "#131B2C",
  info: palette.blueBright,
  infoSoft: "rgba(96,165,250,0.12)",
  warning: "#F2D27A",
  warningSoft: "rgba(242,210,122,0.14)",
  sme: palette.violetBright,
  smeSoft: "rgba(167,139,250,0.14)",
  mainboard: palette.tealBright,
  mainboardSoft: "rgba(45,212,191,0.12)",
  skeleton: "#131B2C",
  skeletonHighlight: "#1A2437",
  overlay: "rgba(0,0,0,0.6)",
  tabBar: "#0A1120",
  chartGrid: "rgba(255,255,255,0.06)",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extrabold: "Poppins_800ExtraBold",
  heading: "Poppins_700Bold",
  headingSemibold: "Poppins_600SemiBold",
  display: "Poppins_700Bold",
} as const;

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, letterSpacing: -0.4 },
  h1: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 31, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 26, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23 },
  title: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22 },
  bodySm: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  label: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  overline: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 0.8, textTransform: "uppercase" as const },
  numLg: { fontFamily: fonts.semibold, fontSize: 22, lineHeight: 29, letterSpacing: -0.2, fontVariant: ["tabular-nums"] as const },
  numMd: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, fontVariant: ["tabular-nums"] as const },
  numSm: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, fontVariant: ["tabular-nums"] as const },
} as const;

export type TypographyVariant = keyof typeof typography;

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fonts: typeof fonts;
  typography: typeof typography;
  shadow: { card: object; float: object };
}

export function buildTheme(mode: ThemeMode): Theme {
  const colors = mode === "dark" ? darkColors : lightColors;
  return {
    mode,
    colors,
    spacing,
    radius,
    fonts,
    typography,
    // Flat design: no card shadows. `float` is only for the sticky bottom bar / sheets.
    shadow: {
      card: {},
      float: mode === "dark" ? {} : { shadowColor: "#111827", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -2 }, elevation: 6 },
    },
  };
}
