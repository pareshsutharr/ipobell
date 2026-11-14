// Pure helpers for error reporting (no React Native imports, so they run under jest as plain TypeScript).
// See index.ts for the wiring and supabase/migrations/20261114000400_app_errors.sql for the server side.

export type ErrorKind = "uncaught" | "render" | "handled";

export interface ErrorReport {
  fingerprint: string;
  fatal: boolean;
  kind: ErrorKind;
  message: string;
  stack: string | null;
  screen: string | null;
  context: Record<string, string | number | boolean | null>;
  platform: string;
  app_version: string;
  device_id: string;
  ts: string;
}

export interface ReportMeta {
  kind: ErrorKind;
  fatal?: boolean;
  screen?: string | null;
  context?: Record<string, unknown>;
  platform: string;
  appVersion: string;
  deviceId: string;
  now?: Date;
}

export const MAX_MESSAGE = 1000;
export const MAX_STACK = 6000;
const MAX_CONTEXT_KEYS = 20;
const MAX_CONTEXT_VALUE = 300;

/** Turn whatever was thrown (Error, string, object, undefined) into a message and a stack. */
export function normalizeError(thrown: unknown): { message: string; stack: string | null } {
  if (thrown instanceof Error) {
    const name = thrown.name && thrown.name !== "Error" ? `${thrown.name}: ` : "";
    return { message: `${name}${thrown.message || "(no message)"}`, stack: typeof thrown.stack === "string" ? thrown.stack : null };
  }
  if (typeof thrown === "string") return { message: thrown || "(empty string thrown)", stack: null };
  if (thrown && typeof thrown === "object") {
    const o = thrown as { message?: unknown; stack?: unknown };
    if (typeof o.message === "string" && o.message) return { message: o.message, stack: typeof o.stack === "string" ? o.stack : null };
    try {
      return { message: `Non-error thrown: ${JSON.stringify(thrown).slice(0, 300)}`, stack: null };
    } catch {
      return { message: "Non-error thrown: [unserialisable object]", stack: null };
    }
  }
  return { message: `Non-error thrown: ${String(thrown)}`, stack: null };
}

/** Things that must never leave the phone, even inside an error message: PANs, e-mails, phone numbers, tokens. */
export function scrub(text: string): string {
  return text
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[PAN]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[token]")
    .replace(/(?<![\w.])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w.])/g, "[phone]");
}

function firstAppFrame(stack: string | null): string {
  if (!stack) return "";
  const lines = stack.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("at ") || /@/.test(l));
  // Drop positions (line:column and bundle addresses change with every build) so one bug keeps one fingerprint.
  return (lines[0] ?? "").replace(/\(.*\)$/, "").replace(/:\d+(:\d+)?/g, "").replace(/address at .*/i, "").trim();
}

/** Small stable hash (FNV-1a, 32-bit) rendered as 8 hex characters. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Same bug → same fingerprint, whatever numbers or ids appear in the message. */
export function fingerprint(message: string, stack: string | null): string {
  const shape = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>").replace(/\d+/g, "<n>").slice(0, 200);
  return hash(`${shape}|${firstAppFrame(stack)}`);
}

function cleanContext(context: Record<string, unknown> | undefined): ErrorReport["context"] {
  const out: ErrorReport["context"] = {};
  if (!context) return out;
  for (const [k, v] of Object.entries(context).slice(0, MAX_CONTEXT_KEYS)) {
    if (v === undefined) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else out[k] = scrub(typeof v === "string" ? v : safeString(v)).slice(0, MAX_CONTEXT_VALUE);
  }
  return out;
}

function safeString(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return "[unserialisable]";
  }
}

export function buildReport(thrown: unknown, meta: ReportMeta): ErrorReport {
  const { message, stack } = normalizeError(thrown);
  const cleanMessage = scrub(message).slice(0, MAX_MESSAGE);
  const cleanStack = stack ? scrub(stack).slice(0, MAX_STACK) : null;
  return {
    fingerprint: fingerprint(cleanMessage, cleanStack),
    fatal: Boolean(meta.fatal),
    kind: meta.kind,
    message: cleanMessage,
    stack: cleanStack,
    screen: meta.screen ? meta.screen.slice(0, 200) : null,
    context: cleanContext(meta.context),
    platform: meta.platform,
    app_version: meta.appVersion,
    device_id: meta.deviceId,
    ts: (meta.now ?? new Date()).toISOString(),
  };
}

/**
 * Decides whether a report should be queued. The same fingerprint is accepted once per `windowMs`, and at most
 * `maxPerWindow` reports of any kind per window, so a render loop cannot flood the queue or the server.
 */
export class ReportThrottle {
  private seen = new Map<string, number>();
  private stamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxPerWindow: number;

  constructor(windowMs = 60_000, maxPerWindow = 10) {
    this.windowMs = windowMs;
    this.maxPerWindow = maxPerWindow;
  }

  allow(fp: string, now = Date.now()): boolean {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
    for (const [k, t] of this.seen) if (now - t >= this.windowMs) this.seen.delete(k);
    if (this.seen.has(fp)) return false;
    if (this.stamps.length >= this.maxPerWindow) return false;
    this.seen.set(fp, now);
    this.stamps.push(now);
    return true;
  }
}

/** Keep the newest `max` reports (used for the queue and for what is persisted between launches). */
export function capQueue<T>(queue: T[], max: number): T[] {
  return queue.length > max ? queue.slice(queue.length - max) : queue;
}
