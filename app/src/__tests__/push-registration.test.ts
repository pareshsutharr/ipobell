import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Regression test for the push-token loop: on Android, getDevicePushTokenAsync() re-emits the
// token event, so registration must (a) never call it when a token is supplied, (b) collapse
// concurrent calls into one upsert and (c) skip an unchanged, recently-seen token entirely.

const mockGetDevicePushTokenAsync = jest.fn(async () => ({ type: "fcm", data: "tok-1" }));
const mockUpsert = jest.fn(async () => ({ error: null }));
const mockStorage: Record<string, string> = {};

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted", canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: (...a: unknown[]) => mockGetDevicePushTokenAsync(...(a as [])),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(),
  setNotificationChannelGroupAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-device", () => ({ isDevice: true, manufacturer: "Test", modelName: "Device" }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.0" }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  multiSet: jest.fn(async (pairs: [string, string][]) => {
    for (const [k, v] of pairs) mockStorage[k] = v;
  }),
}));
jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn(() => ({ upsert: mockUpsert })) } }));
jest.mock("@/lib/auth/store", () => ({ useAuth: jest.fn() }));
jest.mock("@/lib/notifications/channels", () => ({ setupNotificationChannels: jest.fn(async () => undefined) }));

import { registerDeviceForPush } from "@/lib/notifications/push";

describe("registerDeviceForPush", () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    mockGetDevicePushTokenAsync.mockClear();
    mockUpsert.mockClear();
  });

  it("collapses concurrent registrations into one token fetch and one upsert", async () => {
    const [a, b, c] = await Promise.all([registerDeviceForPush("u1"), registerDeviceForPush("u1"), registerDeviceForPush("u1")]);
    expect([a, b, c]).toEqual(["tok-1", "tok-1", "tok-1"]);
    expect(mockGetDevicePushTokenAsync).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("does not ask the OS for the token again when the event already supplied it", async () => {
    await registerDeviceForPush("u1", { token: "tok-2" });
    expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockStorage["ipobell.push.lastToken"]).toBe("tok-2");
  });

  it("skips the upsert for an unchanged, recently registered token", async () => {
    mockStorage["ipobell.push.lastToken"] = "tok-1";
    mockStorage["ipobell.push.lastSeen"] = String(Date.now());
    await registerDeviceForPush("u1");
    await registerDeviceForPush("u1", { token: "tok-1" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("re-sends when forced or when the token is stale", async () => {
    mockStorage["ipobell.push.lastToken"] = "tok-1";
    mockStorage["ipobell.push.lastSeen"] = String(Date.now() - 13 * 60 * 60 * 1000);
    await registerDeviceForPush("u1");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    mockStorage["ipobell.push.lastSeen"] = String(Date.now());
    await registerDeviceForPush("u1", { force: true });
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });
});
