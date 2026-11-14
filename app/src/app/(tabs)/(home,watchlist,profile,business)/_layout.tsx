import { Stack } from "expo-router";
import React from "react";

import { useTheme } from "@/lib/theme/ThemeProvider";

/**
 * One native stack per tab (shared via the array-group syntax), so IPO detail, search,
 * settings and legal pages open *inside* the current tab and the bottom bar stays visible.
 */
// Each tab's stack must start on its own screen; without this, groups that have no `index`
// route would open the alphabetically-first shared screen (About) when the tab is selected.
export const unstable_settings = {
  anchor: "index",
  home: { anchor: "index" },
  watchlist: { anchor: "watchlist" },
  profile: { anchor: "profile" },
  business: { anchor: "business" },
};

export default function TabStackLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    />
  );
}
