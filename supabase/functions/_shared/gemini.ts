// Minimal Gemini client for Edge Functions: one JSON-schema request, no SDK. `fetchImpl` is injectable so the
// request and the error handling are unit-tested without the network.

export class GeminiError extends Error {
  status: number;
  /** Worth trying the next model name (unknown model, or this model's quota is used up). */
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export interface GeminiJsonRequest {
  apiKey: string;
  /** Tried in order until one answers. */
  models: string[];
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

/** Ask for JSON matching `schema`. Returns the parsed object and the model that answered. */
export async function geminiJson(req: GeminiJsonRequest): Promise<{ data: unknown; model: string }> {
  const doFetch = req.fetchImpl ?? fetch;
  let last: GeminiError = new GeminiError("No Gemini model configured.", 500, false);
  for (const model of req.models) {
    let res: Response;
    try {
      res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": req.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.prompt }] }],
          generationConfig: { temperature: req.temperature ?? 0.1, maxOutputTokens: req.maxOutputTokens ?? 1024, responseMimeType: "application/json", responseSchema: req.schema },
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 45_000),
      });
    } catch (e) {
      last = new GeminiError(e instanceof Error ? e.message : "network error", 0, true);
      continue;
    }
    const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string }; error?: { message?: string } } | null;
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      const retryable = res.status === 404 || res.status === 429 || res.status >= 500 || (res.status === 400 && /model|not found|not supported/i.test(msg));
      last = new GeminiError(msg, res.status, retryable);
      if (retryable) continue;
      throw last;
    }
    const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) {
      last = new GeminiError(`no text (${json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? "empty"})`, 502, true);
      continue;
    }
    try {
      return { data: parseJson(text), model };
    } catch {
      last = new GeminiError("the model did not return valid JSON", 502, true);
    }
  }
  throw last;
}

/** JSON from a model reply, even if wrapped in a ```json fence or surrounded by prose. */
export function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("not JSON");
  }
}
