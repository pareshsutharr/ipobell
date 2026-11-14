import { describe, expect, it } from "@jest/globals";

import { buildReport, capQueue, fingerprint, hash, MAX_MESSAGE, MAX_STACK, normalizeError, ReportThrottle, scrub } from "@/lib/errors/core";

const META = { kind: "uncaught" as const, platform: "android", appVersion: "1.1.1+6", deviceId: "dev1", now: new Date("2026-11-14T10:00:00Z") };

describe("normalizeError", () => {
  it("reads Error objects, keeping a custom name", () => {
    const e = new TypeError("x is undefined");
    const n = normalizeError(e);
    expect(n.message).toBe("TypeError: x is undefined");
    expect(n.stack).toContain("TypeError");
    expect(normalizeError(new Error("plain")).message).toBe("plain");
    expect(normalizeError(new Error("")).message).toBe("(no message)");
  });

  it("copes with anything that can be thrown", () => {
    expect(normalizeError("boom")).toEqual({ message: "boom", stack: null });
    expect(normalizeError("").message).toBe("(empty string thrown)");
    expect(normalizeError({ message: "from object", stack: "at a" })).toEqual({ message: "from object", stack: "at a" });
    expect(normalizeError({ code: 42 }).message).toBe('Non-error thrown: {"code":42}');
    expect(normalizeError(undefined).message).toBe("Non-error thrown: undefined");
    expect(normalizeError(null).message).toBe("Non-error thrown: null");
    expect(normalizeError(404).message).toBe("Non-error thrown: 404");
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(normalizeError(loop).message).toBe("Non-error thrown: [unserialisable object]");
  });
});

describe("scrub", () => {
  it("removes PANs, e-mails, phone numbers and tokens", () => {
    expect(scrub("PAN ABCDE1234F failed")).toBe("PAN [PAN] failed");
    expect(scrub("user asha.patel@example.co.in not found")).toBe("user [email] not found");
    expect(scrub("call 9876543210 now")).toBe("call [phone] now");
    expect(scrub("call +91 98765 43210 now")).toBe("call [phone] now");
    expect(scrub("call +91-9876543210")).toBe("call [phone]");
    expect(scrub("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop")).toBe("Bearer [token]");
  });

  it("leaves ordinary numbers and text alone", () => {
    expect(scrub("HTTP 500 after 12000 ms at line 1234567890123")).toBe("HTTP 500 after 12000 ms at line 1234567890123");
    expect(scrub("price 1665.50 lot 9")).toBe("price 1665.50 lot 9");
    expect(scrub("ipo/abcde-1234-f")).toBe("ipo/abcde-1234-f");
  });
});

describe("fingerprint", () => {
  it("is stable for the same bug with different numbers and ids", () => {
    const stack = "TypeError: x\n    at IpoCard (index.android.bundle:1:12345)\n    at render (index.android.bundle:1:999)";
    const a = fingerprint("Cannot read row 12 of ipo 3f2504e0-4f89-11d3-9a0c-0305e82c3301", stack);
    const b = fingerprint("Cannot read row 987 of ipo 9b2504e0-4f89-11d3-9a0c-0305e82c3399", stack.replace("12345", "54321"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("differs for different messages or different places", () => {
    const stack = "Error\n    at IpoCard (bundle:1:1)";
    expect(fingerprint("A failed", stack)).not.toBe(fingerprint("B failed", stack));
    expect(fingerprint("A failed", stack)).not.toBe(fingerprint("A failed", "Error\n    at Watchlist (bundle:1:1)"));
  });

  it("hash is deterministic", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
    expect(hash("")).toBe("811c9dc5");
  });
});

describe("buildReport", () => {
  it("builds a complete report", () => {
    const r = buildReport(new Error("render failed"), { ...META, kind: "render", fatal: true, screen: "/ipo/acme", context: { slug: "acme", count: 3, ok: false, nothing: null, skip: undefined } });
    expect(r).toMatchObject({ kind: "render", fatal: true, message: "render failed", screen: "/ipo/acme", platform: "android", app_version: "1.1.1+6", device_id: "dev1", ts: "2026-11-14T10:00:00.000Z" });
    expect(r.context).toEqual({ slug: "acme", count: 3, ok: false, nothing: null });
    expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof r.stack).toBe("string");
  });

  it("defaults: not fatal, no screen, empty context", () => {
    const r = buildReport("boom", META);
    expect(r.fatal).toBe(false);
    expect(r.screen).toBeNull();
    expect(r.context).toEqual({});
    expect(r.stack).toBeNull();
  });

  it("truncates long messages, stacks and context values", () => {
    const e = new Error("m".repeat(5000));
    e.stack = "s".repeat(20000);
    const r = buildReport(e, { ...META, screen: "p".repeat(500), context: { long: "v".repeat(1000) } });
    expect(r.message.length).toBe(MAX_MESSAGE);
    expect(r.stack?.length).toBe(MAX_STACK);
    expect(r.screen?.length).toBe(200);
    expect(String(r.context.long).length).toBe(300);
  });

  it("scrubs personal data from message, stack and context", () => {
    const e = new Error("Allotment check failed for ABCDE1234F (asha@example.com)");
    e.stack = "Error: Allotment check failed for ABCDE1234F\n    at check (bundle:1:1)";
    const r = buildReport(e, { ...META, context: { pan: "ABCDE1234F", phone: "9876543210", nested: { email: "a@b.co" } } });
    const all = JSON.stringify(r);
    expect(all).not.toContain("ABCDE1234F");
    expect(all).not.toContain("asha@example.com");
    expect(all).not.toContain("9876543210");
    expect(all).not.toContain("a@b.co");
    expect(r.message).toBe("Allotment check failed for [PAN] ([email])");
  });

  it("keeps at most 20 context keys", () => {
    const context: Record<string, number> = {};
    for (let i = 0; i < 50; i++) context[`k${i}`] = i;
    expect(Object.keys(buildReport("x", { ...META, context }).context).length).toBe(20);
  });
});

describe("ReportThrottle", () => {
  it("accepts a fingerprint once per window", () => {
    const t = new ReportThrottle(60_000, 10);
    expect(t.allow("a", 0)).toBe(true);
    expect(t.allow("a", 1_000)).toBe(false);
    expect(t.allow("a", 59_999)).toBe(false);
    expect(t.allow("a", 60_000)).toBe(true);
  });

  it("caps the total per window, then recovers", () => {
    const t = new ReportThrottle(60_000, 3);
    expect([t.allow("a", 0), t.allow("b", 1), t.allow("c", 2), t.allow("d", 3), t.allow("e", 4)]).toEqual([true, true, true, false, false]);
    expect(t.allow("d", 60_010)).toBe(true);
  });

  it("a render loop of one error produces one report", () => {
    const t = new ReportThrottle();
    let accepted = 0;
    for (let i = 0; i < 1000; i++) if (t.allow("loop", i)) accepted++;
    expect(accepted).toBe(1);
  });
});

describe("capQueue", () => {
  it("keeps the newest entries", () => {
    expect(capQueue([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
    expect(capQueue([1, 2], 3)).toEqual([1, 2]);
    expect(capQueue([], 3)).toEqual([]);
  });
});
