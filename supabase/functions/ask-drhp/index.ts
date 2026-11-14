// ask-drhp — answers a question about one IPO from the offer document the team uploaded, with page numbers.
//
// POST (user JWT; guest accounts included) { "ipo_id": "<uuid>", "question": "Where will the money be used?" }
//   200 { outcome: "answered" | "not_found" | "refused", answer, pages[], document, actions[], disclaimer, remaining, cached }
//   400 bad input · 401 not signed in · 422 no document uploaded for this IPO · 429 daily limit
//   503 GEMINI_API_KEY is not set · 502 the model could not be reached
//
// Order of work, cheapest first: validate → refuse advice questions (no model call) → serve a repeated question
// from the log (no model call) → daily limit → search the pages → ask the model → check its answer → log.
// Every rule about what may be said is in _shared/drhp-chat.ts and is unit-tested there.
//
// Secrets: GEMINI_API_KEY (required). Optional: GEMINI_MODEL, DRHP_CHAT_DAILY_LIMIT.

import { adminClient, AuthError, requireUser } from "../_shared/auth.ts";
import {
  actionsFor, ADVICE_REFUSAL, ANSWER_SCHEMA, buildPrompt, CACHE_DAYS, checkQuestion, DAILY_LIMIT, detectIntent, DISCLAIMER, expandQuery, intentNote,
  isAdviceQuestion, limitMessage, NOT_FOUND_ANSWER, overLimit, PAGES_TO_MODEL, parseAnswer, questionKey, SYSTEM_PROMPT, type ChatAnswer, type RetrievedPage,
} from "../_shared/drhp-chat.ts";
import { envOptional } from "../_shared/env.ts";
import { DEFAULT_MODELS, geminiJson, GeminiError } from "../_shared/gemini.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_ORDER = ["prospectus", "rhp", "drhp"];
const DOC_LABEL: Record<string, string> = { drhp: "Draft Red Herring Prospectus (DRHP)", rhp: "Red Herring Prospectus (RHP)", prospectus: "Prospectus" };

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);

  let user: { id: string };
  try {
    user = await requireUser(req);
  } catch (e) {
    return error(e instanceof AuthError ? e.message : "Unauthorized", 401);
  }

  const body = await readJson<{ ipo_id?: unknown; question?: unknown }>(req);
  if (typeof body.ipo_id !== "string" || !UUID.test(body.ipo_id)) return error("ipo_id is required", 400);
  const problem = checkQuestion(body.question);
  if (problem) return error(problem, 400);
  const ipoId = body.ipo_id;
  const question = (body.question as string).trim();
  const key = questionKey(question);
  const intent = detectIntent(question);
  const limit = Math.max(1, Number(envOptional("DRHP_CHAT_DAILY_LIMIT") ?? DAILY_LIMIT) || DAILY_LIMIT);

  const admin = adminClient();
  const [{ data: ipo }, { data: docs, error: docsErr }] = await Promise.all([
    admin.from("ipos").select("name, display_name").eq("id", ipoId).maybeSingle(),
    admin.from("ipo_documents_admin").select("id, doc_type, version, file_path, page_count").eq("ipo_id", ipoId).eq("is_current", true).eq("text_status", "done"),
  ]);
  if (docsErr) return error(docsErr.message, 500);
  if (!ipo) return error("IPO not found", 404);
  // Same order as private.answer_document(): the newest stage that has been uploaded and read.
  const doc = [...(docs ?? [])].sort((a, b) => DOC_ORDER.indexOf(a.doc_type as string) - DOC_ORDER.indexOf(b.doc_type as string) || (b.version as number) - (a.version as number))[0];
  if (!doc) return error("No offer document has been uploaded for this IPO yet.", 422, { code: "no_document" });
  const document = { id: doc.id as string, doc_type: doc.doc_type as string, version: doc.version as number, file_path: doc.file_path as string, page_count: doc.page_count as number | null };

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const usedToday = async (): Promise<number> => {
    const { count } = await admin.from("drhp_chat_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("cached", false).in("outcome", ["answered", "not_found"]).gte("created_at", dayAgo);
    return count ?? 0;
  };
  const log = async (a: ChatAnswer | { outcome: "error"; answer: string | null; pages: number[]; found: false }, cached: boolean) => {
    await admin.from("drhp_chat_log").insert({ user_id: user.id, ipo_id: ipoId, document_id: document.id, question, question_key: key, answer: a.answer, pages: a.pages, found: a.found, intent, cached, outcome: a.outcome });
  };
  const respond = async (a: ChatAnswer, cached: boolean) => {
    const note = a.outcome === "refused" ? null : intentNote(intent);
    return json({
      ok: true,
      outcome: a.outcome,
      answer: note ? `${a.answer}\n\n${note}` : a.answer,
      pages: a.pages,
      document,
      actions: actionsFor(intent),
      disclaimer: DISCLAIMER,
      cached,
      remaining: Math.max(0, limit - (await usedToday())),
    });
  };

  // 1. Advice questions: refused without calling the model, and not counted against the limit.
  if (isAdviceQuestion(question)) {
    const refused: ChatAnswer = { outcome: "refused", answer: ADVICE_REFUSAL, pages: [], found: false };
    await log(refused, false);
    return respond(refused, false);
  }

  // 2. The same question about the same document, asked recently by anyone: reuse the answer.
  const since = new Date(Date.now() - CACHE_DAYS * 24 * 3600 * 1000).toISOString();
  const { data: hit } = await admin.from("drhp_chat_log").select("answer, pages, found, outcome").eq("document_id", document.id).eq("question_key", key).eq("cached", false).in("outcome", ["answered", "not_found"]).gte("created_at", since).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (hit && typeof hit.answer === "string") {
    const cachedAnswer: ChatAnswer = { outcome: hit.outcome as "answered" | "not_found", answer: hit.answer, pages: (hit.pages as number[]) ?? [], found: Boolean(hit.found) };
    await log(cachedAnswer, true);
    return respond(cachedAnswer, true);
  }

  // 3. Daily limit (questions that reach the search and the model).
  if (overLimit(await usedToday(), limit)) return error(limitMessage(limit), 429, { code: "daily_limit" });

  // 4. Find the pages.
  const search = expandQuery(question);
  const { data: found, error: searchErr } = await admin.rpc("search_document_pages", { p_ipo_id: ipoId, p_terms: search.terms, p_phrases: search.phrases, p_limit: PAGES_TO_MODEL });
  if (searchErr) return error(searchErr.message, 500);
  const pages: RetrievedPage[] = ((found ?? []) as { document_id: string; page_no: number; text: string }[]).filter((p) => p.document_id === document.id).map((p) => ({ page_no: p.page_no, text: p.text }));
  if (!pages.length) {
    const none: ChatAnswer = { outcome: "not_found", answer: NOT_FOUND_ANSWER, pages: [], found: false };
    await log(none, false);
    return respond(none, false);
  }

  // 5. Ask the model, then check what it said.
  const apiKey = envOptional("GEMINI_API_KEY");
  if (!apiKey) return error("Questions are not switched on yet (GEMINI_API_KEY is not set).", 503, { code: "not_configured" });
  const model = envOptional("GEMINI_MODEL");
  let answer: ChatAnswer;
  try {
    // Pages go to the model in page order, which reads more naturally than relevance order.
    const ordered = [...pages].sort((a, b) => a.page_no - b.page_no);
    const company = (ipo.display_name as string | null) ?? (ipo.name as string);
    const result = await geminiJson({ apiKey, models: model ? [model, ...DEFAULT_MODELS.filter((m) => m !== model)] : DEFAULT_MODELS, system: SYSTEM_PROMPT, prompt: buildPrompt(company, DOC_LABEL[document.doc_type] ?? "Offer document", ordered, question), schema: ANSWER_SCHEMA, temperature: 0.1, maxOutputTokens: 800 });
    answer = parseAnswer(result.data, pages.map((p) => p.page_no));
  } catch (e) {
    const message = e instanceof GeminiError ? e.message : e instanceof Error ? e.message : String(e);
    await log({ outcome: "error", answer: message.slice(0, 500), pages: [], found: false }, false);
    return error("The answer service is busy. Please try again in a minute.", 502, { code: "model_error" });
  }

  await log(answer, false);
  return respond(answer, false);
});
