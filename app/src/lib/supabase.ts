import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { env } from "@/lib/env";

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // OAuth and email links come back through `beipoready://auth/callback` and are exchanged with PKCE.
    flowType: "pkce",
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Keep the session fresh only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Surface a readable message from a PostgREST / Auth error. */
export function errorMessage(e: unknown): string {
  if (!e) return "Something went wrong";
  if (typeof e === "string") return e;
  const anyE = e as { message?: string; hint?: string; details?: string };
  if (anyE.message?.includes("WATCHLIST_LIMIT")) {
    return anyE.hint ?? "Free accounts can watch up to 10 IPOs. Upgrade to Premium for unlimited.";
  }
  return anyE.message ?? "Something went wrong";
}
