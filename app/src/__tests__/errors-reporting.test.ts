import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Wiring test for the error reporter: nothing leaves the phone without a session, reports survive a restart,
// a failed send is retried, and the global handler still calls React Native's own handler.

type RpcResult = { error: { message: string } | null };
const mockRpc = jest.fn(async (_name: string, _args: { p_errors: unknown[] }): Promise<RpcResult> => ({ error: null }));
const mockStorage: Record<string, string> = {};
const mockAuth: { session: object | null; listeners: ((s: { session: object | null }, p: { session: object | null }) => void)[] } = { session: null, listeners: [] };

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (k: string) => mockStorage[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStorage[k] = v;
  }),
  removeItem: jest.fn(async (k: string) => {
    delete mockStorage[k];
  }),
}));
jest.mock("expo-application", () => ({ nativeApplicationVersion: "1.1.1", nativeBuildVersion: "6" }));
jest.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: jest.fn() } }));
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: (name: string, args: { p_errors: unknown[] }) => mockRpc(name, args) } }));
jest.mock("@/lib/auth/store", () => ({
  useAuth: {
    getState: () => ({ session: mockAuth.session }),
    subscribe: (fn: (s: { session: object | null }, p: { session: object | null }) => void) => {
      mockAuth.listeners.push(fn);
      return () => undefined;
    },
  },
}));

const QUEUE_KEY = "ipobell.errors.queue.v1";
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function load() {
  let mod!: typeof import("@/lib/errors");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh copy of the module per test
    mod = require("@/lib/errors");
  });
  return mod;
}

describe("error reporting", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
    mockRpc.mockReset();
    mockRpc.mockImplementation(async () => ({ error: null }));
    mockAuth.session = null;
    mockAuth.listeners = [];
    delete (globalThis as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it("without a session: saves the report on the phone and sends nothing", async () => {
    const { reportError, flushErrors } = load();
    reportError(new Error("boom"), { kind: "handled" });
    await settle();
    await flushErrors();
    expect(mockRpc).not.toHaveBeenCalled();
    const saved = JSON.parse(mockStorage[QUEUE_KEY]) as { message: string; platform: string; app_version: string }[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ message: "boom", platform: "android", app_version: "1.1.1+6", kind: "handled", fatal: false });
  });

  it("with a session: sends the batch and clears the saved queue", async () => {
    const { reportError, flushErrors, setErrorScreen } = load();
    mockAuth.session = { user: "u1" };
    setErrorScreen("/ipo/acme");
    reportError(new Error("first"));
    reportError(new Error("second"), { fatal: true, kind: "render", context: { slug: "acme" } });
    await flushErrors();
    await settle();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe("report_errors");
    expect(args.p_errors).toHaveLength(2);
    expect(args.p_errors[1]).toMatchObject({ message: "second", fatal: true, kind: "render", screen: "/ipo/acme", context: { slug: "acme" } });
    expect(mockStorage[QUEUE_KEY]).toBeUndefined();
    await flushErrors();
    expect(mockRpc).toHaveBeenCalledTimes(1); // nothing left to send
  });

  it("a failed send keeps the reports and the next flush retries them", async () => {
    const { reportError, flushErrors } = load();
    mockAuth.session = { user: "u1" };
    mockRpc.mockImplementationOnce(async () => {
      throw new Error("Network request failed");
    });
    reportError(new Error("offline error"));
    await flushErrors();
    await settle();
    expect(JSON.parse(mockStorage[QUEUE_KEY])).toHaveLength(1);
    await flushErrors();
    await settle();
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockStorage[QUEUE_KEY]).toBeUndefined();
  });

  it("a server-side temporary error keeps the reports; a rejected batch is dropped", async () => {
    const { reportError, flushErrors } = load();
    mockAuth.session = { user: "u1" };
    mockRpc.mockImplementationOnce(async () => ({ error: { message: "upstream timeout" } }));
    reportError(new Error("kept"));
    await flushErrors();
    await settle();
    expect(JSON.parse(mockStorage[QUEUE_KEY])).toHaveLength(1);
    mockRpc.mockImplementationOnce(async () => ({ error: { message: "BATCH_TOO_LARGE" } }));
    await flushErrors();
    await settle();
    expect(mockStorage[QUEUE_KEY]).toBeUndefined();
  });

  it("the same error in a loop is reported once", async () => {
    const { reportError, flushErrors } = load();
    mockAuth.session = { user: "u1" };
    for (let i = 0; i < 200; i++) reportError(new Error("render loop"));
    await flushErrors();
    expect(mockRpc.mock.calls[0][1].p_errors).toHaveLength(1);
  });

  it("personal data never reaches storage or the server", async () => {
    const { reportError, flushErrors } = load();
    mockAuth.session = { user: "u1" };
    reportError(new Error("PAN ABCDE1234F for asha@example.com / 9876543210 failed"), { context: { pan: "ABCDE1234F" } });
    await settle();
    expect(mockStorage[QUEUE_KEY]).not.toMatch(/ABCDE1234F|asha@example\.com|9876543210/);
    await flushErrors();
    expect(JSON.stringify(mockRpc.mock.calls[0][1])).not.toMatch(/ABCDE1234F|asha@example\.com|9876543210/);
  });

  it("reports saved by a previous launch are sent after sign-in", async () => {
    mockStorage[QUEUE_KEY] = JSON.stringify([{ fingerprint: "aaaa1111", fatal: true, kind: "uncaught", message: "crash last time", stack: null, screen: "/", context: {}, platform: "android", app_version: "1.1.1+6", device_id: "d", ts: "2026-11-14T10:00:00.000Z" }]);
    mockStorage["ipobell.analytics.device.v1"] = "device-xyz";
    const { startErrorReporting, reportError } = load();
    startErrorReporting();
    await settle();
    jest.advanceTimersByTime(2000);
    await settle();
    expect(mockRpc).not.toHaveBeenCalled(); // still signed out

    mockAuth.session = { user: "u1" };
    for (const l of mockAuth.listeners) l({ session: mockAuth.session }, { session: null });
    reportError(new Error("new one"));
    jest.advanceTimersByTime(4000);
    await settle();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const sent = mockRpc.mock.calls[0][1].p_errors as { message: string; device_id: string }[];
    expect(sent.map((e) => e.message)).toEqual(["crash last time", "new one"]);
    expect(sent[1].device_id).toBe("device-xyz");
  });

  it("a corrupt saved queue is ignored", async () => {
    mockStorage[QUEUE_KEY] = "{not json";
    const { startErrorReporting, reportError, flushErrors } = load();
    startErrorReporting();
    await settle();
    mockAuth.session = { user: "u1" };
    reportError(new Error("still works"));
    await flushErrors();
    expect(mockRpc.mock.calls[0][1].p_errors).toHaveLength(1);
  });

  it("the global handler reports as uncaught and still calls React Native's handler", async () => {
    const previous = jest.fn();
    let installed: ((e: unknown, fatal?: boolean) => void) | undefined;
    (globalThis as { ErrorUtils?: unknown }).ErrorUtils = { getGlobalHandler: () => previous, setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => (installed = h) };
    const { startErrorReporting, flushErrors } = load();
    startErrorReporting();
    startErrorReporting(); // second call must not install twice
    expect(installed).toBeDefined();
    mockAuth.session = { user: "u1" };
    const err = new Error("uncaught in release");
    installed?.(err, true);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(err, true);
    await flushErrors();
    expect(mockRpc.mock.calls[0][1].p_errors[0]).toMatchObject({ kind: "uncaught", fatal: true, message: "uncaught in release" });
  });

  it("reportError itself never throws, whatever is passed", () => {
    const { reportError } = load();
    const weird: Record<string, unknown> = {};
    weird.self = weird;
    expect(() => {
      reportError(undefined);
      reportError(null);
      reportError(weird, { context: { weird } });
      reportError(Symbol("s"));
    }).not.toThrow();
  });
});
