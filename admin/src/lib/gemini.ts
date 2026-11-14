// Thin client for the Gemini API (generativelanguage.googleapis.com). Server-only: reads GEMINI_API_KEY.
//
// Model: GEMINI_MODEL env wins; otherwise we try a short list of Flash models in order and remember the first
// one that answers (separately for grounded and plain calls), so a renamed or quota-blocked model does not
// break the admin panel. Measured 30 Oct 2026 on the free tier: gemini-2.5-flash answers grounded research in
// ~6s and JSON in ~4s; gemini-3.x-flash took 40-90s for the same JSON and returned 429 for Google Search.

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super("AI drafting is not set up. Add GEMINI_API_KEY to the admin environment (Vercel → Settings → Environment Variables).");
  }
}

const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.8-flash"];
const resolvedModel: Record<"search" | "plain", string | null> = { search: null, plain: null };

type Part = { text: string };
export interface GeminiRequest {
  system?: string;
  prompt: string;
  /** Turn on Google Search grounding. Cannot be combined with `jsonSchema`. */
  search?: boolean;
  /** Structured output: the response is JSON matching this schema. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResult {
  text: string;
  model: string;
  /** Web pages the answer was grounded on (only with `search: true`). */
  sources: { title: string; url: string }[];
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new GeminiNotConfiguredError();
  return key;
}

function candidates(kind: "search" | "plain"): string[] {
  const env = process.env.GEMINI_MODEL?.trim();
  const list = env ? [env, ...FALLBACK_MODELS.filter((m) => m !== env)] : [...FALLBACK_MODELS];
  const known = resolvedModel[kind];
  if (known) return [known, ...list.filter((m) => m !== known)];
  return list;
}

async function callModel(model: string, req: GeminiRequest, key: string): Promise<Response> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: req.prompt }] as Part[] }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxOutputTokens ?? 4096,
      ...(req.jsonSchema ? { responseMimeType: "application/json", responseSchema: req.jsonSchema } : {}),
    },
  };
  if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
  if (req.search) body.tools = [{ google_search: {} }];
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
}

export async function gemini(req: GeminiRequest): Promise<GeminiResult> {
  const key = apiKey();
  const kind = req.search ? "search" : "plain";
  let lastError = "Gemini did not answer.";
  for (const model of candidates(kind)) {
    const res = await callModel(model, req, key);
    if (res.status === 404) {
      lastError = `Model ${model} is not available for this API key.`;
      continue; // try the next name
    }
    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) {
      const msg = json?.error?.message ?? `Gemini returned HTTP ${res.status}`;
      // Unknown model, or this model's quota is exhausted (free tier blocks Google Search on some models): try the next.
      if (res.status === 429 || (res.status === 400 && /model|not found|not supported/i.test(msg))) {
        lastError = `${model}: ${msg}`;
        continue;
      }
      throw new Error(msg);
    }
    const cand = json?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) {
      const reason = cand?.finishReason ?? json?.promptFeedback?.blockReason ?? "empty response";
      throw new Error(`Gemini returned no text (${reason}).`);
    }
    resolvedModel[kind] = model;
    const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources = chunks
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
      .filter((w) => (seen.has(w.uri) ? false : (seen.add(w.uri), true)))
      .map((w) => ({ url: w.uri, title: w.title ?? w.uri }));
    return { text, model, sources };
  }
  throw new Error(lastError);
}

/** Pull a JSON object out of a model reply even if it is wrapped in a ```json fence or prose. */
export function parseJsonObject<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new Error("Gemini did not return valid JSON.");
  }
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}
