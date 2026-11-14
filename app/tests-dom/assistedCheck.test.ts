// DOM tests for the injected registrar script. Run with:  node --test app/tests-dom
// (Node 24 strips TypeScript natively; jsdom comes from node_modules.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { buildInjectedScript } from "../src/features/applications/assistedCheck.ts";

type Posted = { kind: string; status?: string; shares?: number | null; applied?: number | null; note?: string };

function run(html: string, opts = { pan: "ABCDE1234F", ipoName: "Jio Platforms" }): Promise<{ posted: Posted[]; dom: JSDOM }> {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window as unknown as Record<string, unknown>;
  const posted: Posted[] = [];
  w.ReactNativeWebView = { postMessage: (s: string) => posted.push(JSON.parse(s) as Posted) };
  dom.window.eval(buildInjectedScript(opts));
  // the injected script polls with setInterval; close the window afterwards so the process can exit
  return new Promise((resolve) => setTimeout(() => { const out = { posted, dom }; setTimeout(() => dom.window.close(), 0); resolve(out); }, 3300));
}

const kfintechAllotted = `
<div class="card">
  <div class="row"><div><span class="label">Application Number:</span><b>GROWWfa88321d47b</b></div><div><span class="label">Name:</span><b>MR. DIVESH KARWASARA .</b></div></div>
  <div class="row"><div><span class="label">DP ID Client ID:</span><b>12088XXXXXX55650</b></div><div><span class="label">PAN:</span><b>XXXXXX444L</b></div></div>
  <div class="row"><div><span class="label">Applied:</span><b>12</b></div><div><span class="label">Allotted:</span><b>12</b></div></div>
  <button>Back</button>
</div>
<footer>If your application was not allotted, the blocked amount is released by your bank. Sorry for any inconvenience.</footer>`;

const kfintechNotAllotted = kfintechAllotted.replace('<span class="label">Allotted:</span><b>12</b>', '<span class="label">Allotted:</span><b>0</b>');

const tableLayout = `
<table><thead><tr><th>Name</th><th>Shares Applied</th><th>Shares Allotted</th><th>Category</th></tr></thead>
<tbody><tr><td>SOMEONE</td><td>18</td><td>9</td><td>RII</td></tr></tbody></table>`;

const noRecord = `<div class="alert">Sorry, no records found for the given PAN. Please check and try again.</div>`;

const formPage = `
<form>
  <select id="ipo"><option value="">Select IPO</option><option value="123">JIO PLATFORMS LIMITED</option><option value="124">CORE4 ENGINEERS LIMITED</option></select>
  <label><input type="radio" name="t" value="app"/> Application No</label>
  <label><input type="radio" name="t" value="pan"/> PAN</label>
  <input type="text" id="txtpan" placeholder="Enter PAN no" maxlength="10"/>
  <button type="button">Submit</button>
</form>`;

test("KFintech card: Allotted: 12 → allotted, even though the footer says 'not allotted'", async () => {
  const { posted } = await run(kfintechAllotted);
  const r = posted.find((m) => m.kind === "result");
  assert.ok(r, "no result posted");
  assert.equal(r.status, "allotted");
  assert.equal(r.shares, 12);
  assert.equal(r.applied, 12);
});

test("KFintech card: Allotted: 0 → not allotted", async () => {
  const { posted } = await run(kfintechNotAllotted);
  const r = posted.find((m) => m.kind === "result");
  assert.equal(r?.status, "not_allotted");
  assert.equal(r?.shares, 0);
});

test("header/row table → allotted 9 of 18", async () => {
  const { posted } = await run(tableLayout);
  const r = posted.find((m) => m.kind === "result");
  assert.equal(r?.status, "allotted");
  assert.equal(r?.shares, 9);
  assert.equal(r?.applied, 18);
});

test("no record page → not_found", async () => {
  const { posted } = await run(noRecord);
  assert.equal(posted.find((m) => m.kind === "result")?.status, "not_found");
});

test("form page: prefills IPO + PAN, picks the PAN radio, auto-submits (no CAPTCHA)", async () => {
  const { posted, dom } = await run(formPage);
  const pre = posted.find((m) => m.kind === "prefilled");
  assert.match(pre?.note ?? "", /IPO: JIO PLATFORMS LIMITED/);
  assert.match(pre?.note ?? "", /PAN filled/);
  assert.match(pre?.note ?? "", /Checking/);
  const d = dom.window.document;
  assert.equal((d.getElementById("txtpan") as HTMLInputElement).value, "ABCDE1234F");
  assert.equal((d.getElementById("ipo") as HTMLSelectElement).value, "123");
  assert.equal((d.querySelector('input[value="pan"]') as HTMLInputElement).checked, true);
});
