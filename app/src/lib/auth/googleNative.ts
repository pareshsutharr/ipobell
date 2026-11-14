// Native Google Sign-In (Android/iOS builds). Shows Google's own account sheet and returns an ID token that
// Supabase verifies directly — no browser, no redirect, nothing for the allow-list to reject.
// In Expo Go the native module is absent and `isNativeGoogleAvailable()` is false; the browser flow is used.
import { requireOptionalNativeModule } from "expo-modules-core";

type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");

let mod: GoogleSigninModule | null | undefined;

function load(): GoogleSigninModule | null {
  if (mod !== undefined) return mod;
  try {
    if (!requireOptionalNativeModule("RNGoogleSignin") && !requireOptionalNativeModule("RNGoogleSigninButton")) {
      mod = null;
      return mod;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@react-native-google-signin/google-signin") as GoogleSigninModule;
  } catch {
    mod = null;
  }
  return mod;
}

export function isNativeGoogleAvailable(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) && load() !== null;
}

export class GoogleCancelledError extends Error {}

/** Returns a Google ID token for the chosen account, or throws (GoogleCancelledError when the user backs out). */
export async function nativeGoogleIdToken(): Promise<string> {
  const g = load();
  if (!g) throw new Error("Native Google Sign-In is not available in this build.");
  const { GoogleSignin, statusCodes } = g;
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID, scopes: ["email", "profile"] });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type === "cancelled") throw new GoogleCancelledError("cancelled");
    const token = result.data?.idToken;
    if (!token) throw new Error("Google did not return an ID token.");
    return token;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (e instanceof GoogleCancelledError || code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleCancelledError("cancelled");
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error("Google Play services are not available on this device.");
    if (code === "DEVELOPER_ERROR" || /DEVELOPER_ERROR|10:/.test(String((e as Error).message))) {
      throw new Error("Google sign-in is not configured for this build yet (Android OAuth client / SHA-1). Use email for now.");
    }
    throw e;
  }
}
