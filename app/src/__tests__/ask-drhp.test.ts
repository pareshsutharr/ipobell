/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

import { checkQuestion, classifyFailure, parseAskResponse, remainingLabel, SUGGESTED_QUESTIONS } from "@/features/ipos/ask";

const good = (over: Record<string, unknown> = {}) => ({ ok: true, outcome: "answered", answer: "The net proceeds will fund a new plant.", pages: [64, 12, 64], document: { id: "d1", doc_type: "rhp", version: 1, file_path: "ipo/abc/d1.pdf", page_count: 300 }, actions: [], disclaimer: "Information, not advice.", cached: false, remaining: 17, ...over });

describe("reading the answer", () => {
  it("maps a good response", () => {
    expect(parseAskResponse(good())).toEqual({ outcome: "answered", answer: "The net proceeds will fund a new plant.", pages: [12, 64], document: { id: "d1", docType: "rhp", filePath: "ipo/abc/d1.pdf", pageCount: 300 }, actions: [], disclaimer: "Information, not advice.", remaining: 17 });
  });

  it("a response without an outcome or an answer is not usable", () => {
    for (const raw of [null, undefined, "text", {}, { outcome: "answered" }, { outcome: "made-up", answer: "x" }, { outcome: "answered", answer: "   " }]) expect(parseAskResponse(raw)).toBeNull();
  });

  it("pages are shown only for a real answer, and only pages inside the document", () => {
    expect(parseAskResponse(good({ pages: [0, -1, 64.5, "12", 301, 5000, 299] }))?.pages).toEqual([299]);
    expect(parseAskResponse(good({ outcome: "not_found", pages: [64] }))?.pages).toEqual([]);
    expect(parseAskResponse(good({ outcome: "refused", pages: [64] }))?.pages).toEqual([]);
    expect(parseAskResponse(good({ pages: "64" }))?.pages).toEqual([]);
  });

  it("a document with an odd path is dropped, so no link can point outside our storage", () => {
    expect(parseAskResponse(good({ document: { id: "d1", doc_type: "rhp", file_path: "../../x.pdf" } }))?.document).toBeNull();
    expect(parseAskResponse(good({ document: { id: "d1", doc_type: "rhp", file_path: "https://evil.example/a.pdf" } }))?.document).toBeNull();
    expect(parseAskResponse(good({ document: { id: "d1", doc_type: "memo", file_path: "ipo/a/b.pdf" } }))?.document).toBeNull();
    expect(parseAskResponse(good({ document: null }))?.document).toBeNull();
  });

  it("only the firm's own tool routes become buttons", () => {
    const r = parseAskResponse(good({ actions: [{ label: "Check my eligibility", route: "/business/eligibility" }, { label: "Evil", route: "/profile/delete" }, { label: "", route: "/business/book-call" }, { label: "Out", route: "https://evil.example" }, "junk", { label: "Book a call with an advisor", route: "/business/book-call" }] }));
    expect(r?.actions).toEqual([{ label: "Check my eligibility", route: "/business/eligibility" }, { label: "Book a call with an advisor", route: "/business/book-call" }]);
  });

  it("remaining count is read only when sensible", () => {
    expect(parseAskResponse(good({ remaining: 3.9 }))?.remaining).toBe(3);
    expect(parseAskResponse(good({ remaining: -1 }))?.remaining).toBeNull();
    expect(parseAskResponse(good({ remaining: "3" }))?.remaining).toBeNull();
  });
});

describe("failures are explained in plain words", () => {
  it("each kind of failure", () => {
    expect(classifyFailure(429, { ok: false, error: "You have asked 20 questions in the last 24 hours, which is the limit.", details: { code: "daily_limit" } })).toEqual({ kind: "limit", message: "You have asked 20 questions in the last 24 hours, which is the limit." });
    expect(classifyFailure(422, { error: "No offer document", details: { code: "no_document" } }).kind).toBe("no_document");
    expect(classifyFailure(503, { details: { code: "not_configured" } }).kind).toBe("not_configured");
    expect(classifyFailure(401, {}).kind).toBe("sign_in");
    expect(classifyFailure(400, { error: "Keep the question under 500 characters." })).toEqual({ kind: "bad_question", message: "Keep the question under 500 characters." });
    expect(classifyFailure(404, {}).kind).toBe("not_available"); // the function is not deployed on this backend yet
    expect(classifyFailure(502, { details: { code: "model_error" } }).kind).toBe("busy");
    expect(classifyFailure(500, "html error page").kind).toBe("busy");
    expect(classifyFailure(null, null).kind).toBe("offline");
  });

  it("never shows a raw server error for an unexpected failure", () => {
    expect(classifyFailure(500, { error: "relation \"x\" does not exist" }).message).toBe("The answer service is busy. Please try again in a minute.");
  });
});

describe("the question box", () => {
  it("checks length before sending", () => {
    expect(checkQuestion("Where will the money be used?")).toBeNull();
    expect(checkQuestion("  a ")).toMatch(/Type a question/);
    expect(checkQuestion("x".repeat(501))).toMatch(/under 500/);
  });

  it("the suggested questions are the same as the server's", () => {
    const server = fs.readFileSync(path.join(__dirname, "../../../supabase/functions/_shared/drhp-chat.ts"), "utf8");
    const block = /export const SUGGESTED_QUESTIONS = \[([\s\S]*?)\];/.exec(server);
    expect(block).not.toBeNull();
    expect([...(block as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(SUGGESTED_QUESTIONS);
  });

  it("the remaining-questions note appears only near the limit", () => {
    expect(remainingLabel(17)).toBeNull();
    expect(remainingLabel(5)).toBe("5 questions left today");
    expect(remainingLabel(1)).toBe("1 question left today");
    expect(remainingLabel(0)).toBe("That was your last question for today.");
    expect(remainingLabel(null)).toBeNull();
  });
});
