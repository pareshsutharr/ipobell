import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useColorScheme } from "react-native";
import { create } from "zustand";

import { buildTheme, type Theme, type ThemeMode } from "@/lib/theme/tokens";

export type ThemePreference = "system" | ThemeMode;

interface ThemePrefState {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (p: ThemePreference) => void;
  hydrate: () => Promise<void>;
}

const STORAGE_KEY = "ipobell.theme";

export const useThemePreference = create<ThemePrefState>((set) => ({
  preference: "system",
  hydrated: false,
  setPreference: (preference) => {
    set({ preference });
    AsyncStorage.setItem(STORAGE_KEY, preference).catch(() => undefined);
  },
  hydrate: async () => {
    try {
      const v = (await AsyncStorage.getItem(STORAGE_KEY)) as ThemePreference | null;
      set({ preference: v ?? "system", hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));

const ThemeContext = createContext<Theme>(buildTheme("dark"));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const preference = useThemePreference((s) => s.preference);
  const mode: ThemeMode = preference === "system" ? (scheme === "light" ? "light" : "dark") : preference;
  const theme = useMemo(() => buildTheme(mode), [mode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
  }, [theme.colors.background]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Color for a signed number: gain / loss / neutral. */
export function useSignedColor() {
  const { colors } = useTheme();
  return (n: number | null | undefined) => {
    if (n === null || n === undefined || Number.isNaN(n)) return colors.textMuted;
    if (n > 0) return colors.gain;
    if (n < 0) return colors.loss;
    return colors.textMuted;
  };
}
