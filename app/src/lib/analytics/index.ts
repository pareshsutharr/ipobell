// Product analytics. Events are queued in memory, flushed in batches to `track_events()` (Supabase RPC) every
// few seconds, when the queue grows, and when the app goes to the background. Nothing personal is sent
// beyond what the user already gave us (their account id); props carry screen names, IPO slugs, tool results.
//
// Event taxonomy — keep in sync with supabase/migrations/20261029000300_analytics.sql:
//   app_open {cold}                      screen_view {path, params}             sign_in {method}
//   role_selected {role}                 perspective_switch {to}                ipo_view {slug, name, board, status}
//   insight_view {slug, ipo_id, verdict} latest_insight_tap {slug}              watchlist {action, slug}
//   search {query, results}              tool_start {tool}                      tool_complete {tool, …summary}
//   lead_submit {source, tool, has_phone, has_email}                            external_link {url, host, label}
//   share {slug}  calendar_add {slug}    allotment_check {slug, registrar}      notification_pref {key, value}
//   push_open {type, slug}
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { AppState, Linking, Platform } from "react-native";

import { usePerspective } from "@/features/perspective/store";
import { useAuth } from "@/lib/auth/store";
import { supabase } from "@/lib/supabase";

export type ToolName = "readiness" | "eligibility" | "issue_size" | "issue_cost" | "checklist" | "book_call";
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

interface QueuedEvent {
  event: string;
  screen?: string;
  props: AnalyticsProps;
  role: string | null;
  perspective: string;
  platform: string;
  app_version: string;
  device_id: string;
  session_id: string;
  ts: string;
}

const DEVICE_KEY = "ipobell.analytics.device.v1";
const QUEUE_KEY = "ipobell.analytics.queue.v1";
const SESSION_GAP_MS = 30 * 60 * 1000;
const FLUSH_EVERY_MS = 8000;
const FLUSH_AT = 20;
const MAX_QUEUE = 400;

let deviceId: string | null = null;
let sessionId = newId();
let lastActivity = Date.now();
let currentScreen: string | undefined;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let started = false;

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const stored = await AsyncStorage.getItem(DEVICE_KEY);
    if (stored) return (deviceId = stored);
    const fresh = newId() + newId();
    await AsyncStorage.setItem(DEVICE_KEY, fresh);
    return (deviceId = fresh);
  } catch {
    return (deviceId = newId());
  }
}

function touchSession() {
  const now = Date.now();
  if (now - lastActivity > SESSION_GAP_MS) sessionId = newId();
  lastActivity = now;
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_EVERY_MS);
}

/** Record one event. Safe to call anywhere; never throws. */
export function track(event: string, props: AnalyticsProps = {}, screen?: string) {
  try {
    touchSession();
    const clean: AnalyticsProps = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      clean[k] = typeof v === "string" ? v.slice(0, 300) : v;
    }
    queue.push({
      event,
      screen: screen ?? currentScreen,
      props: clean,
      role: usePerspective.getState().role,
      perspective: usePerspective.getState().perspective,
      platform: Platform.OS,
      app_version: `${Application.nativeApplicationVersion ?? "dev"}+${Application.nativeBuildVersion ?? "0"}`,
      device_id: deviceId ?? "pending",
      session_id: sessionId,
      ts: new Date().toISOString(),
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flush();
    else schedule();
  } catch {
    // analytics must never break the app
  }
}

/** Screen view with the route path; dedupes repeats of the same path. */
let lastPath: string | null = null;
export function trackScreen(path: string, params: Record<string, unknown> = {}) {
  if (path === lastPath) return;
  lastPath = path;
  currentScreen = path;
  const slug = typeof params.slug === "string" ? params.slug : undefined;
  track("screen_view", { path, slug }, path);
}

export function trackTool(tool: ToolName, phase: "start" | "complete", summary: AnalyticsProps = {}) {
  track(phase === "start" ? "tool_start" : "tool_complete", { tool, ...summary });
}

/** Open a URL in the browser and record the click. Use for every outbound link. */
export function openExternal(url: string, label?: string) {
  let host: string | undefined;
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    host = undefined;
  }
  track("external_link", { url, host, label });
  return Linking.openURL(url).catch(() => undefined);
}

/** Send what we have. Keeps the batch on failure and retries on the next flush. */
export async function flush(): Promise<void> {
  if (flushing || !queue.length) return;
  const session = useAuth.getState().session;
  if (!session) return; // no identity yet; try again later
  flushing = true;
  const did = await ensureDeviceId();
  const batch = queue.splice(0, 100).map((e) => ({ ...e, device_id: e.device_id === "pending" ? did : e.device_id }));
  try {
    const { error } = await supabase.rpc("track_events", { p_events: batch });
    if (error) throw error;
    if (queue.length) schedule();
  } catch {
    queue = [...batch, ...queue].slice(-MAX_QUEUE);
    AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => undefined);
  } finally {
    flushing = false;
  }
}

/** Call once at app start (root layout). Restores an unsent queue and flushes on background. */
export function startAnalytics() {
  if (started) return;
  started = true;
  void ensureDeviceId();
  AsyncStorage.getItem(QUEUE_KEY)
    .then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as QueuedEvent[];
      if (Array.isArray(saved) && saved.length) queue = [...saved.slice(-MAX_QUEUE), ...queue];
      AsyncStorage.removeItem(QUEUE_KEY).catch(() => undefined);
    })
    .catch(() => undefined);
  track("app_open", { cold: true });
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      const resumed = Date.now() - lastActivity > SESSION_GAP_MS;
      touchSession();
      if (resumed) track("app_open", { cold: false });
    } else {
      void flush();
    }
  });
  // Flush as soon as a session appears (first launch: guest / sign-in happens after the first events).
  useAuth.subscribe((s, prev) => {
    if (s.session && !prev.session) void flush();
  });
}
