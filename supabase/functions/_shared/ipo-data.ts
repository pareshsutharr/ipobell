// Be IPO Ready data mirror client (https://beipoready.com/api/ipo-data).
//
// The mirror serves IPO Guru v2 payloads (same paths, same { success, data } envelope) from the
// website's own sync, so this app makes no IPO Guru requests and has no 20/min or daily quota.
// Error model:
//   401 invalid_key / 403 forbidden → fatal: the run stops; check IPO_API_KEY (bpr_ key, scope ipo:read)
//   404 not_found                   → the mirror has no data for that slug / sub-resource yet; skip it
//   503 not_synced, 5xx, network    → transient: bounded retry (max 2), then stop this run; cron retries
import { config } from "./env.ts";
import { sleep } from "./http.ts";

export type IpoApiErrorKind = "fatal" | "transient" | "not_found" | "budget" | "client";

export class IpoApiError extends Error {
  status: number;
  kind: IpoApiErrorKind;
  body?: unknown;
  constructor(message: string, status: number, kind: IpoApiErrorKind, body?: unknown) {
    super(message);
    this.name = "IpoApiError";
    this.status = status;
    this.kind = kind;
    this.body = body;
  }
  get fatal(): boolean {
    return this.kind === "fatal";
  }
  get transient(): boolean {
    return this.kind === "transient";
  }
  get notFound(): boolean {
    return this.kind === "not_found";
  }
}

export interface ApiEnvelope<T> {
  success: boolean;
  /** "beipoready" on the mirror (IPO Guru returned the plan name). Informational only. */
  plan?: string;
  count?: number;
  data: T;
  error?: string;
  message?: string;
}

export interface IpoDataClientOptions {
  /** Maximum requests this client may make (per Edge Function invocation). */
  budget?: number;
  /** Minimum gap between requests in ms (politeness only; the mirror has no rate limit). */
  minIntervalMs?: number;
  timeoutMs?: number;
  /** Extra attempts after a transient failure. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  apiKey?: string;
}

export class IpoDataClient {
  calls = 0;
  private lastCallAt = 0;
  private readonly budget: number;
  private readonly minInterval: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(opts: IpoDataClientOptions = {}) {
    this.budget = opts.budget ?? 60;
    this.minInterval = opts.minIntervalMs ?? 300;
    this.timeoutMs = opts.timeoutMs ?? 25_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.baseUrl = opts.baseUrl ?? config.ipoApiBaseUrl;
    this.apiKey = opts.apiKey ?? config.ipoApiKey;
  }

  get budgetLeft(): number {
    return this.budget - this.calls;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    if (this.calls >= this.budget) {
      throw new IpoApiError(`API call budget (${this.budget}) exhausted`, 0, "budget");
    }
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }

    let lastErr: IpoApiError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(1000 * attempt);
      await this.throttle();
      this.calls++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url.toString(), {
          headers: { "X-API-KEY": this.apiKey, Accept: "application/json" },
          signal: controller.signal,
        });
        const text = await res.text();
        let body: ApiEnvelope<T> | null = null;
        try {
          body = JSON.parse(text) as ApiEnvelope<T>;
        } catch {
          body = null;
        }
        const code = body?.error ?? `HTTP ${res.status}`;

        if (res.status === 401 || res.status === 403) {
          throw new IpoApiError(
            `Mirror rejected the key (${res.status} ${code}) — check IPO_API_KEY (bpr_ key with ipo:read scope)`,
            res.status,
            "fatal",
            body ?? text,
          );
        }
        if (res.status === 404) {
          throw new IpoApiError(`No data at ${path} (${code})`, 404, "not_found", body ?? text);
        }
        if (res.status === 503 || res.status >= 500) {
          lastErr = new IpoApiError(`Mirror unavailable (${res.status} ${code})`, res.status, "transient", body ?? text);
          continue;
        }
        if (!res.ok || !body || body.success === false) {
          throw new IpoApiError(body?.message ?? code, res.status, "client", body ?? text);
        }
        return body.data;
      } catch (e) {
        if (e instanceof IpoApiError) {
          if (e.transient) {
            lastErr = e;
            continue;
          }
          throw e;
        }
        // network error / timeout → transient
        lastErr = new IpoApiError(`Network error: ${e instanceof Error ? e.message : String(e)}`, 0, "transient");
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr ?? new IpoApiError("Request failed", 0, "transient");
  }

  private async throttle() {
    const wait = this.lastCallAt + this.minInterval - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
  }
}
