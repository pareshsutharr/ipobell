// FCM device registration + tap handling (deep links into the app).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { router, type Href } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/lib/auth/store";
import { setupNotificationChannels } from "@/lib/notifications/channels";
import { Notifications } from "@/lib/notifications/native";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme/tokens";

const LAST_TOKEN_KEY = "ipobell.push.lastToken";
const LAST_SEEN_KEY = "ipobell.push.lastSeen";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getPushPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return "granted";
  if (p.status === "denied" && !p.canAskAgain) return "denied";
  return "undetermined";
}

/** Android 13+ shows the system prompt only after at least one channel exists. */
export async function requestPushPermission(): Promise<boolean> {
  await setupNotificationChannels(palette.gold);
  const p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

/** Last token we successfully registered (or confirmed) in this process. */
let registeredToken: string | null = null;
let inFlight: Promise<string | null> | null = null;

/**
 * Fetch the native FCM token and upsert it into device_tokens for the current user.
 * Deduplicated: concurrent calls share one registration, and an unchanged token is only
 * re-sent after 12 hours. Pass `token` when you already have it (from the token listener),
 * because calling getDevicePushTokenAsync re-emits the token event on Android.
 */
export function registerDeviceForPush(userId: string, opts: { force?: boolean; token?: string } = {}): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = doRegister(userId, opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRegister(userId: string, opts: { force?: boolean; token?: string }): Promise<string | null> {
  // iOS simulators cannot get a push token; Android emulators with Google Play services can.
  if (!Device.isDevice && Platform.OS === "ios") return null;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return null;
  await setupNotificationChannels(palette.gold);

  let token = opts.token ?? null;
  if (!token) {
    try {
      token = (await Notifications.getDevicePushTokenAsync()).data as string;
    } catch (e) {
      console.warn("getDevicePushTokenAsync failed", e);
      return null;
    }
  }
  if (!token) return null;

  const [lastToken, lastSeen] = await Promise.all([AsyncStorage.getItem(LAST_TOKEN_KEY), AsyncStorage.getItem(LAST_SEEN_KEY)]);
  const stale = !lastSeen || Date.now() - Number(lastSeen) > 12 * 60 * 60 * 1000;
  if (!opts.force && lastToken === token && !stale) {
    registeredToken = token;
    return token;
  }

  const { error } = await supabase.from("device_tokens").upsert(
    {
      user_id: userId,
      fcm_token: token,
      platform: Platform.OS,
      device_name: `${Device.manufacturer ?? ""} ${Device.modelName ?? ""}`.trim() || null,
      app_version: Application.nativeApplicationVersion ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" },
  );
  if (error) {
    console.warn("device_tokens upsert failed", error.message);
    return null;
  }
  registeredToken = token;
  await AsyncStorage.multiSet([
    [LAST_TOKEN_KEY, token],
    [LAST_SEEN_KEY, String(Date.now())],
  ]);
  return token;
}

/** Translate a push payload (see supabase/functions/_shared/notify.ts) into an in-app route. */
export function routeForNotificationData(data: Record<string, unknown> | undefined | null): Href | null {
  if (!data) return null;
  const slug = typeof data.slug === "string" && data.slug ? data.slug : null;
  if (slug) return { pathname: "/ipo/[slug]", params: { slug } } as Href;
  const type = typeof data.type === "string" ? data.type : "";
  switch (type) {
    case "opens_today":
    case "closes_today":
    case "closing_soon":
    case "subscription_milestone":
      return { pathname: "/", params: { segment: "open" } } as Href;
    case "new_ipo":
      return { pathname: "/", params: { segment: "upcoming" } } as Href;
    case "allotment":
    case "allotment_tomorrow":
    case "refund":
    case "demat_credit":
      return "/allotment" as Href;
    case "listing_today":
    case "listing_tomorrow":
    case "listed":
      return { pathname: "/", params: { segment: "listed" } } as Href;
    default:
      return "/" as Href;
  }
}

function handleResponse(response: import("expo-notifications").NotificationResponse | null) {
  if (!response) return;
  const content = response.notification.request.content;
  const data = (content.data ?? {}) as Record<string, unknown>;
  const href = routeForNotificationData(data);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@/lib/analytics") as typeof import("@/lib/analytics")).track("push_open", { type: typeof data.type === "string" ? data.type : undefined, slug: typeof data.slug === "string" ? data.slug : undefined });
  if (href) {
    // give the navigator a tick to mount
    setTimeout(() => router.push(href), 50);
  }
}

/** Mount once in the root layout. Registers the device when auth is ready and handles taps. */
export function usePushNotifications() {
  const user = useAuth((s) => s.user);
  const handledInitial = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    registerDeviceForPush(user.id).catch(() => undefined);
    // Android emits this event every time getDevicePushTokenAsync() runs, not only on rotation,
    // so only act on a token we have not registered yet, and reuse the token from the event.
    const sub = Notifications.addPushTokenListener((event) => {
      const token = typeof event.data === "string" ? event.data : null;
      if (!token || token === registeredToken) return;
      registerDeviceForPush(user.id, { token }).catch(() => undefined);
    });
    return () => sub.remove();
  }, [user?.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    if (!handledInitial.current) {
      handledInitial.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((r) => {
          if (r) handleResponse(r);
        })
        .catch(() => undefined);
    }
    return () => sub.remove();
  }, []);
}
