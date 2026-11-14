// Unit tests for the Be IPO Ready mirror client. Run: node --test supabase/tests
// Uses a fake fetch; nothing leaves the machine.
import assert from "node:assert/strict";
import { test } from "node:test";

import { IpoApiError, IpoDataClient } from "../functions/_shared/ipo-data.ts";

type Step = { status: number; body?: unknown; throw?: Error };

function client(steps: Step[], opts: Partial<ConstructorParameters<typeof IpoDataClient>[0]> = {}) {
  const urls: string[] = [];
  let i = 0;
  const fetchImpl = (async (input: string | URL | Request) => {
    urls.push(String(input));
    const step = steps[Math.min(i++, steps.length - 1)];
    if (step.throw) throw step.throw;
    return new Response(step.body === undefined ? "" : JSON.stringify(step.body), {
      status: step.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  const api = new IpoDataClient({ baseUrl: "https://mirror.test/api/ipo-data", apiKey: "bpr_test", minIntervalMs: 0, fetchImpl, ...opts });
  return { api, urls };
}

test("success: unwraps the { success, data } envelope and builds the URL with params", async () => {
  const { api, urls } = client([{ status: 200, body: { success: true, plan: "beipoready", count: 1, data: [{ slug: "x-ipo" }] } }]);
  const data = await api.get<{ slug: string }[]>("ipos", { months: 4, type: undefined });
  assert.deepEqual(data, [{ slug: "x-ipo" }]);
  assert.equal(urls[0], "https://mirror.test/api/ipo-data/ipos?months=4");
  assert.equal(api.calls, 1);
});

test("401 invalid_key is fatal, not retried, and names the secret", async () => {
  const { api } = client([{ status: 401, body: { success: false, error: "invalid_key", message: "Missing or invalid API key." } }]);
  await assert.rejects(api.get("ipos"), (e: unknown) => e instanceof IpoApiError && e.fatal && e.status === 401 && /IPO_API_KEY/.test(e.message));
  assert.equal(api.calls, 1);
});

test("403 forbidden is fatal", async () => {
  const { api } = client([{ status: 403, body: { success: false, error: "forbidden" } }]);
  await assert.rejects(api.get("ipos/x/anchors"), (e: unknown) => e instanceof IpoApiError && e.fatal);
});

test("404 not_found is reported as notFound without retry", async () => {
  const { api } = client([{ status: 404, body: { success: false, error: "not_found" } }]);
  await assert.rejects(api.get("ipos/x/subscription"), (e: unknown) => e instanceof IpoApiError && e.notFound && !e.transient);
  assert.equal(api.calls, 1);
});

test("503 not_synced is transient: at most 2 retries, then a transient error", async () => {
  const { api } = client([{ status: 503, body: { success: false, error: "not_synced" } }]);
  await assert.rejects(api.get("live"), (e: unknown) => e instanceof IpoApiError && e.transient && e.status === 503);
  assert.equal(api.calls, 3);
});

test("503 then 200 recovers within the retry bound", async () => {
  const { api } = client([{ status: 503, body: { success: false, error: "not_synced" } }, { status: 200, body: { success: true, data: { ok: 1 } } }]);
  assert.deepEqual(await api.get("live"), { ok: 1 });
  assert.equal(api.calls, 2);
});

test("network errors are transient and bounded", async () => {
  const { api } = client([{ status: 0, throw: new TypeError("fetch failed") }]);
  await assert.rejects(api.get("ipos"), (e: unknown) => e instanceof IpoApiError && e.transient && /Network/.test(e.message));
  assert.equal(api.calls, 3);
});

test("success:false with 200 is a client error, not retried", async () => {
  const { api } = client([{ status: 200, body: { success: false, error: "server_error", message: "boom" } }]);
  await assert.rejects(api.get("ipos"), (e: unknown) => e instanceof IpoApiError && e.kind === "client" && e.message === "boom");
  assert.equal(api.calls, 1);
});

test("budget is enforced and counts every request", async () => {
  const { api } = client([{ status: 200, body: { success: true, data: 1 } }], { budget: 2 });
  await api.get("a");
  await api.get("b");
  await assert.rejects(api.get("c"), (e: unknown) => e instanceof IpoApiError && e.kind === "budget");
  assert.equal(api.budgetLeft, 0);
});
