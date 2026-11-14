// Auth. Three ways in: Google (Supabase OAuth, PKCE, through the system browser), email + password,
// or "skip" (anonymous Supabase account, which can be upgraded to an email account later without
// losing watchlist / PANs). `status === "ready"` with `session === null` means signed out.
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { create } from "zustand";

import { GoogleCancelledError, isNativeGoogleAvailable, nativeGoogleIdToken } from "@/lib/auth/googleNative";
import { queryClient } from "@/lib/query";
import { supabase } from "@/lib/supabase";

export const AUTH_REDIRECT = Linking.createURL("auth/callback"); // beipoready://auth/callback

export type AuthMethod = "google" | "email" | "guest";

interface AuthState {
  status: "loading" | "ready" | "error";
  session: Session | null;
  user: User | null;
  error: string | null;
  bootstrap: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signInWithGoogle: () => Promise<"ok" | "cancelled">;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Returns `true` when a session exists right away, `false` when the project requires email confirmation first. */
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<boolean>;
  /** Upgrade the current anonymous account to an email account (keeps all data). */
  linkEmail: (email: string, password: string, fullName?: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Handle an `auth/callback` URL (OAuth code or email confirmation). */
  handleAuthUrl: (url: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

let bootstrapped = false;

export class AuthFlowError extends Error {}

function trackSignIn(method: "google" | "email" | "signup" | "guest" | "link") {
  // Lazy import: lib/analytics imports this store.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@/lib/analytics") as typeof import("@/lib/analytics")).track("sign_in", { method });
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  session: null,
  user: null,
  error: null,

  bootstrap: async () => {
    if (bootstrapped) return;
    bootstrapped = true;
    try {
      const { data } = await supabase.auth.getSession();
      set({ status: "ready", session: data.session, user: data.session?.user ?? null, error: null });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });
  },

  continueAsGuest: async () => {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    set({ status: "ready", session: data.session, user: data.session?.user ?? null, error: null });
    trackSignIn("guest");
  },

  signInWithGoogle: async () => {
    // Real builds: Google's native account sheet → ID token → Supabase. No browser round-trip.
    if (isNativeGoogleAvailable()) {
      let token: string;
      try {
        token = await nativeGoogleIdToken();
      } catch (e) {
        if (e instanceof GoogleCancelledError) return "cancelled";
        throw e;
      }
      const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token });
      if (error) throw error;
      set({ session: data.session, user: data.session?.user ?? null });
      trackSignIn("google");
      return "ok";
    }
    // Expo Go / web: OAuth through the system browser with a deep-link return.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
    });
    if (error) throw error;
    if (!data.url) throw new AuthFlowError("Google sign-in is not configured yet.");
    const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT, { preferEphemeralSession: false });
    if (result.type !== "success" || !result.url) return "cancelled";
    const ok = await get().handleAuthUrl(result.url);
    if (!ok) throw new AuthFlowError("Google did not return a session. Please try again.");
    trackSignIn("google");
    return "ok";
  },

  signInWithEmail: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
    trackSignIn("email");
  },

  signUpWithEmail: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { emailRedirectTo: AUTH_REDIRECT, data: fullName ? { full_name: fullName.trim() } : undefined },
    });
    if (error) throw error;
    trackSignIn("signup");
    return Boolean(data.session);
  },

  linkEmail: async (email, password, fullName) => {
    const { data, error } = await supabase.auth.updateUser(
      { email: email.trim().toLowerCase(), password, data: fullName ? { full_name: fullName.trim() } : undefined },
      { emailRedirectTo: AUTH_REDIRECT },
    );
    if (error) throw error;
    trackSignIn("link");
    // With "confirm email" on, the user stays anonymous until the link in the mail is opened.
    return Boolean(data.user?.email && !data.user.is_anonymous);
  },

  sendPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: AUTH_REDIRECT });
    if (error) throw error;
  },

  handleAuthUrl: async (url) => {
    const parsed = Linking.parse(url);
    const code = typeof parsed.queryParams?.code === "string" ? parsed.queryParams.code : null;
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      set({ session: data.session, user: data.session?.user ?? null });
      return Boolean(data.session);
    }
    // Implicit-flow fallback (#access_token=…&refresh_token=…)
    const hash = url.split("#")[1];
    if (hash) {
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (access_token && refresh_token) {
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        set({ session: data.session, user: data.session?.user ?? null });
        return Boolean(data.session);
      }
    }
    return false;
  },

  signOut: async () => {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    queryClient.clear();
    set({ session: null, user: null });
  },

  deleteAccount: async () => {
    const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
    if (error) throw error;
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    queryClient.clear();
    set({ session: null, user: null });
  },
}));

/** Human-readable message for Supabase auth errors. */
export function authErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid login credentials/i.test(msg)) return "Wrong email or password.";
  if (/email not confirmed/i.test(msg)) return "Please confirm your email first. Check your inbox for our link.";
  if (/already registered|already been registered/i.test(msg)) return "An account with this email already exists. Sign in instead.";
  if (/password should be at least/i.test(msg)) return "Password must be at least 8 characters.";
  if (/rate limit|too many/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return "Google sign-in is not enabled yet. Use email for now.";
  if (/network request failed/i.test(msg)) return "No connection. Check your internet and try again.";
  return msg || "Something went wrong";
}
