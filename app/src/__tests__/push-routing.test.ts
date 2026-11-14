import { describe, expect, it, jest } from "@jest/globals";

import { routeForNotificationData } from "@/lib/notifications/push";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("expo-device", () => ({ isDevice: true, manufacturer: "Test", modelName: "Device" }));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.0.0" }));
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(), multiSet: jest.fn() }));
jest.mock("@/lib/supabase", () => ({ supabase: { from: jest.fn() } }));
jest.mock("@/lib/auth/store", () => ({ useAuth: jest.fn() }));


describe("routeForNotificationData", () => {
  it("deep-links to the IPO when a slug is present", () => {
    expect(routeForNotificationData({ type: "gmp_change", slug: "jio-platforms-ipo" })).toEqual({ pathname: "/ipo/[slug]", params: { slug: "jio-platforms-ipo" } });
  });
  it("routes grouped reminders to the right tab segment", () => {
    expect(routeForNotificationData({ type: "opens_today" })).toEqual({ pathname: "/", params: { segment: "open" } });
    expect(routeForNotificationData({ type: "new_ipo" })).toEqual({ pathname: "/", params: { segment: "upcoming" } });
    expect(routeForNotificationData({ type: "listed" })).toEqual({ pathname: "/", params: { segment: "listed" } });
    expect(routeForNotificationData({ type: "allotment" })).toBe("/allotment");
    expect(routeForNotificationData({ type: "refund" })).toBe("/allotment");
  });
  it("falls back to home", () => {
    expect(routeForNotificationData({ type: "something_else" })).toBe("/");
    expect(routeForNotificationData({ slug: "" })).toBe("/");
    expect(routeForNotificationData(null)).toBeNull();
    expect(routeForNotificationData(undefined)).toBeNull();
  });
});
