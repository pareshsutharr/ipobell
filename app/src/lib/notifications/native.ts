// expo-notifications cannot be imported inside Expo Go on Android (its remote-push native module is
// not bundled there since SDK 53, and importing the package throws at module-evaluation time). This
// wrapper loads the real module lazily in development/production builds and returns an inert stub in
// Expo Go, so the rest of the app can keep calling `Notifications.*` unconditionally.
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

const env = Constants.executionEnvironment as string | undefined;
export const isExpoGo = env === "storeClient" || Constants.appOwnership === "expo";

// The definitive check: the native pieces expo-notifications needs at import time are present only in
// our own builds. (Expo Go on Android lacks ExpoTopicSubscriptionModule; iOS Expo Go lacks the push manager.)
const nativeAvailable =
  !isExpoGo && (Platform.OS === "android" ? requireOptionalNativeModule("ExpoTopicSubscriptionModule") !== null : requireOptionalNativeModule("ExpoPushTokenManager") !== null);

const noop = () => undefined;
const noSub = () => ({ remove: noop });
const denied = async () => ({ granted: false, status: "undetermined", canAskAgain: true, expires: "never" });

const stub = {
  AndroidImportance: { UNKNOWN: 0, UNSPECIFIED: 1, NONE: 2, MIN: 3, LOW: 4, DEFAULT: 5, HIGH: 6, MAX: 7 },
  setNotificationHandler: noop,
  getPermissionsAsync: denied,
  requestPermissionsAsync: denied,
  getDevicePushTokenAsync: async () => {
    throw new Error("Push notifications are not available in Expo Go");
  },
  addPushTokenListener: noSub,
  addNotificationResponseReceivedListener: noSub,
  addNotificationReceivedListener: noSub,
  getLastNotificationResponseAsync: async () => null,
  setNotificationChannelAsync: async () => null,
  getNotificationChannelsAsync: async () => [],
  scheduleNotificationAsync: async () => "",
  dismissAllNotificationsAsync: async () => undefined,
} as unknown as NotificationsModule;

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const Notifications: NotificationsModule = nativeAvailable ? (require("expo-notifications") as NotificationsModule) : stub;
