// Error reporting. Uncaught JavaScript errors, screens that fail to render and errors reported by hand are
// queued, saved to the phone (so a crash is still reported on the next launch) and sent in small batches to
// `report_errors()` (Supabase RPC). Staff read them in the admin panel → Errors.
//
// Nothing is sent while there is no session. PANs, e-mails, phone numbers and tokens are removed from the
// message, stack and context before anything is stored (see scrub() in core.ts).
// Not covered: crashes in native code before JavaScript starts.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { AppState, Platform } from "react-native";

import { buildReport, capQueue, ReportThrottle, type ErrorKind, type ErrorReport } from "@/lib/errors/core";
import { useAuth } from "@/lib/auth/store";
import { supabase } from "@/lib/supabase";

const QUEUE_KEY = "ipobell.errors.queue.v1";
const DEVICE_KEY = "ipobell.analytics.device.v1"; // same id the analytics module uses, so an error can be tied to a journey
const MAX_QUEUE = 30;
const BATCH = 20;
const FLUSH_DELAY_MS = 3000;

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler?: () => GlobalHandler | undefined;
  setGlobalHandler?: (handler: GlobalHandler) => void;
}

const throttle = new ReportThrottle();
let queue: ErrorReport[] = [];
let currentScreen: string | null = null;
let deviceId = "unknown";
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let started = false;

function appVersion(): string {
  return `${Application.nativeApplicationVersion ?? "dev"}+${Application.nativeBuildVersion ?? "0"}`;
}

async function persist() {
  try {
    if (queue.length) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else await AsyncStorage.removeItem(QUEUE_KEY);
  } catch {
    // storage full or unavailable: the report is still in memory for this session
  }
}

function schedule(delay = FLUSH_DELAY_MS) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushErrors();
  }, delay);
}

/** Tell the reporter which screen is showing (called from the root layout on every route change). */
export function setErrorScreen(path: string | null) {
  currentScreen = path;
}

/** Report an error. Safe to call anywhere; never throws. */
export function reportError(thrown: unknown, opts: { kind?: ErrorKind; fatal?: boolean; context?: Record<string, unknown> } = {}) {
  try {
    const report = buildReport(thrown, {
      kind: opts.kind ?? "handled",
      fatal: opts.fatal,
      screen: currentScreen,
      context: opts.context,
      platform: Platform.OS,
      appVersion: appVersion(),
      deviceId,
    });
    if (!throttle.allow(report.fingerprint)) return;
    queue = capQueue([...queue, report], MAX_QUEUE);
    // Save first: after a fatal error the app may be gone before the network call finishes.
    void persist();
    schedule(opts.fatal ? 0 : FLUSH_DELAY_MS);
  } catch {
    // error reporting must never cause another error
  }
}

/** Send queued reports. Keeps them when there is no session or the request fails. */
export async function flushErrors(): Promise<void> {
  if (flushing || !queue.length) return;
  if (!useAuth.getState().session) return;
  flushing = true;
  const batch = queue.slice(0, BATCH);
  try {
    const { error } = await supabase.rpc("report_errors", { p_errors: batch });
    if (error) {
      // The server refused the batch itself (too large / malformed): drop it rather than retry forever.
      if (/BATCH_TOO_LARGE|invalid input/i.test(error.message)) queue = queue.slice(batch.length);
      return;
    }
    queue = queue.slice(batch.length);
    if (queue.length) schedule();
  } catch {
    // offline: keep the queue, try again on the next report, sign-in or foreground
  } finally {
    flushing = false;
    void persist();
  }
}

/** Install the global handler and load reports saved by a previous launch. Call once at startup. */
export function startErrorReporting() {
  if (started) return;
  started = true;

  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (utils?.setGlobalHandler) {
    const previous = utils.getGlobalHandler?.();
    utils.setGlobalHandler((error, isFatal) => {
      reportError(error, { kind: "uncaught", fatal: Boolean(isFatal) });
      previous?.(error, isFatal); // keep React Native's own behaviour (red box in dev, close in release)
    });
  }

  void (async () => {
    try {
      const [savedQueue, savedDevice] = await Promise.all([AsyncStorage.getItem(QUEUE_KEY), AsyncStorage.getItem(DEVICE_KEY)]);
      if (savedDevice) deviceId = savedDevice;
      if (savedQueue) {
        const parsed = JSON.parse(savedQueue) as unknown;
        if (Array.isArray(parsed)) queue = capQueue([...(parsed as ErrorReport[]), ...queue], MAX_QUEUE);
      }
    } catch {
      // unreadable queue: start empty
    }
    if (queue.length) schedule(1500);
  })();

  // Reports wait for a session; send them as soon as the user signs in or comes back to the app.
  useAuth.subscribe((state, prev) => {
    if (state.session && !prev.session) schedule(500);
  });
  AppState.addEventListener("change", (s) => {
    if (s === "active") schedule(500);
  });
}
