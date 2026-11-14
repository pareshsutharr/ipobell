// Ask-the-DRHP in the app (pure helpers, unit-tested). The answer comes from the `ask-drhp` Edge Function, which
// answers only from pages of the uploaded offer document and names them. This file reads its response strictly
// and turns failures into plain messages.

export interface AskAction {
  label: string;
  route: string;
}

export interface AskDocument {
  id: string;
  docType: "drhp" | "rhp" | "prospectus";
  filePath: string;
  pageCount: number | null;
}

export interface AskResult {
  outcome: "answered" | "not_found" | "refused";
  answer: string;
  pages: number[];
  document: AskDocument | null;
  actions: AskAction[];
  disclaimer: string | null;
  remaining: number | null;
}

/** Same questions the server suggests (supabase/functions/_shared/drhp-chat.ts); a test keeps the two identical. */
export const SUGGESTED_QUESTIONS = [
  "Where will the money be used?",
  "Is it a fresh issue or an offer for sale?",
  "What does the company do?",
  "What are the main risks?",
  "Who are the promoters?",
  "How have revenue and profit changed?",
];

export const MAX_QUESTION_CHARS = 500;

/** Routes the server may send as buttons. Anything else is dropped, so a response can never navigate somewhere unexpected. */
const ALLOWED_ROUTES = new Set(["/business/eligibility", "/business/issue-cost", "/business/readiness", "/business/book-call"]);
const DOC_TYPES = ["drhp", "rhp", "prospectus"] as const;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The function's JSON → AskResult, or null when it is not a usable answer. */
export function parseAskResponse(raw: unknown): AskResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const outcome = o.outcome === "answered" || o.outcome === "not_found" || o.outcome === "refused" ? o.outcome : null;
  const answer = str(o.answer, 4000);
  if (!outcome || !answer) return null;

  let document: AskDocument | null = null;
  if (o.document && typeof o.document === "object") {
    const d = o.document as Record<string, unknown>;
    const docType = DOC_TYPES.find((t) => t === d.doc_type);
    const filePath = str(d.file_path, 200);
    if (docType && typeof d.id === "string" && /^[a-z0-9/_.-]+\.pdf$/.test(filePath) && !filePath.includes("..")) {
      document = { id: d.id, docType, filePath, pageCount: typeof d.page_count === "number" ? d.page_count : null };
    }
  }
  const maxPage = document?.pageCount ?? 5000;
  const pages = outcome === "answered" && Array.isArray(o.pages) ? [...new Set(o.pages.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= maxPage))].sort((a, b) => a - b).slice(0, 12) : [];
  const actions = Array.isArray(o.actions)
    ? (o.actions as unknown[])
        .map((a) => (a && typeof a === "object" ? { label: str((a as Record<string, unknown>).label, 40), route: str((a as Record<string, unknown>).route, 60) } : { label: "", route: "" }))
        .filter((a) => a.label && ALLOWED_ROUTES.has(a.route))
        .slice(0, 3)
    : [];
  return { outcome, answer, pages, document, actions, disclaimer: str(o.disclaimer, 400) || null, remaining: typeof o.remaining === "number" && o.remaining >= 0 ? Math.floor(o.remaining) : null };
}

export type AskFailure = "limit" | "no_document" | "not_configured" | "sign_in" | "busy" | "bad_question" | "offline" | "not_available";

/** What went wrong, from the HTTP status and body of a failed call. */
export function classifyFailure(status: number | null, body: unknown): { kind: AskFailure; message: string } {
  const o = (body && typeof body === "object" ? body : {}) as { error?: unknown; details?: { code?: unknown } };
  const serverMessage = typeof o.error === "string" ? o.error : "";
  const code = typeof o.details?.code === "string" ? o.details.code : "";
  if (status === null) return { kind: "offline", message: "Could not reach the server. Check your connection and try again." };
  if (status === 429 || code === "daily_limit") return { kind: "limit", message: serverMessage || "You have reached today's limit of questions. Please come back tomorrow." };
  if (status === 422 || code === "no_document") return { kind: "no_document", message: "The offer document for this IPO has not been added yet, so questions cannot be answered." };
  if (status === 503 || code === "not_configured") return { kind: "not_configured", message: "Questions are not switched on yet. Please check back soon." };
  if (status === 401 || status === 403) return { kind: "sign_in", message: "Please sign in again to ask a question." };
  if (status === 400) return { kind: "bad_question", message: serverMessage || "Please type your question in words." };
  if (status === 404) return { kind: "not_available", message: "Questions are not available yet. Please check back soon." };
  return { kind: "busy", message: "The answer service is busy. Please try again in a minute." };
}

/** Why this question cannot be sent, or null. The server checks again. */
export function checkQuestion(q: string): string | null {
  const t = q.trim();
  if (t.length < 3) return "Type a question.";
  if (t.length > MAX_QUESTION_CHARS) return `Keep the question under ${MAX_QUESTION_CHARS} characters.`;
  return null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AskResult;
  /** A failed call: shown as a notice, not as an answer. */
  failure?: AskFailure;
}

/** "1 question left today" / "5 questions left today"; null when unknown or plenty. */
export function remainingLabel(remaining: number | null): string | null {
  if (remaining === null || remaining > 5) return null;
  if (remaining === 0) return "That was your last question for today.";
  return `${remaining} ${remaining === 1 ? "question" : "questions"} left today`;
}
