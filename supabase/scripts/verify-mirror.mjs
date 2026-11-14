#!/usr/bin/env node
// Verifies the Be IPO Ready mirror (beipoready.com/api/ipo-data) returns the shapes sync-ipos expects.
// Never prints the key. Usage:
//   read -rs 'IPO_API_KEY?bpr_ key: ' && export IPO_API_KEY && node supabase/scripts/verify-mirror.mjs
// Never point this at www.ipoguru.in.
const base = (process.env.IPO_API_BASE_URL || "https://beipoready.com/api/ipo-data").replace(/\/+$/, "");
const key = process.env.IPO_API_KEY;
if (!key) {
  console.error("IPO_API_KEY is not set (export it in this shell; it is not echoed).");
  process.exit(2);
}
if (/ipoguru\.in/i.test(base)) {
  console.error("Refusing to call ipoguru.in — the mirror is the only allowed source.");
  process.exit(2);
}

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✔" : "✖"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};
const get = async (path) => {
  const res = await fetch(`${base}/${path}`, { headers: { "X-API-KEY": key, Accept: "application/json" } });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
};
const has = (obj, keys) => keys.filter((k) => !(obj && Object.prototype.hasOwnProperty.call(obj, k)));

// 1. list
const list = await get("ipos?months=4");
check("GET /ipos?months=4 → 200 success:true", list.status === 200 && list.body?.success === true, `status ${list.status}${list.body?.error ? ` ${list.body.error}` : ""}`);
const rows = Array.isArray(list.body?.data) ? list.body.data : [];
check("list has rows and a count", rows.length > 0 && typeof list.body?.count === "number", `${rows.length} rows, count ${list.body?.count}, plan ${list.body?.plan}`);
if (rows[0]) {
  const missing = has(rows[0], ["slug", "name", "type", "status", "open_date", "close_date", "price_band", "lot_size", "gmp", "listing_price", "cmp", "web_url"]);
  check("list row has the fields mapListRow reads", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : `gmp keys: ${Object.keys(rows[0].gmp ?? {}).join(",") || "null"}`);
}

// 2. live
const live = await get("live");
check("GET /live → 200 success:true", live.status === 200 && live.body?.success === true, `status ${live.status}${live.body?.error ? ` ${live.body.error}` : ""}`);
const entries = Array.isArray(live.body?.data) ? live.body.data : [];
const withSub = entries.filter((e) => e?.subscription);
check("live entries are { ipo, subscription }", entries.every((e) => e && typeof e.ipo === "object" && "subscription" in e), `${entries.length} entries, ${withSub.length} with a subscription payload`);
if (withSub[0]) {
  const s = withSub[0].subscription;
  const missing = has(s, ["summary", "categories"]);
  check(`live subscription for ${withSub[0].ipo.slug} has summary + categories`, missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : `summary.updated_at=${s.summary?.updated_at ?? "null"} categories=${s.categories?.length ?? 0}`);
}

// 3. one open IPO's per-slug endpoints (fallback path)
const openSlug = (entries[0]?.ipo?.slug) ?? rows.find((r) => String(r.status).toLowerCase() === "open")?.slug ?? rows[0]?.slug;
if (openSlug) {
  const sub = await get(`ipos/${openSlug}/subscription`);
  check(`GET /ipos/${openSlug}/subscription → 200 or 404 not_found`, sub.status === 200 || (sub.status === 404 && sub.body?.error === "not_found"), `status ${sub.status} ${sub.body?.error ?? ""}`);
  const detail = await get(`ipos/${openSlug}`);
  check(`GET /ipos/${openSlug} → 200 with timeline/issue/company`, detail.status === 200 && has(detail.body?.data, ["timeline", "issue", "company"]).length === 0, `status ${detail.status} ${detail.body?.error ?? ""}`);
  const hist = await get(`ipos/${openSlug}/gmp/history`);
  check(`GET /ipos/${openSlug}/gmp/history → 200 (trend[]) or 404`, (hist.status === 200 && Array.isArray(hist.body?.data?.trend)) || hist.status === 404, `status ${hist.status} ${hist.body?.error ?? ""}`);
  const anchors = await get(`ipos/${openSlug}/anchors`);
  check(`GET /ipos/${openSlug}/anchors → 200 or 404`, anchors.status === 200 || anchors.status === 404, `status ${anchors.status} ${anchors.body?.error ?? ""}`);
}

// 4. unknown slug → 404 not_found (the client treats it as "skip")
const nf = await get("ipos/this-slug-does-not-exist-xyz");
check("unknown slug → 404 not_found", nf.status === 404 && nf.body?.error === "not_found", `status ${nf.status} ${nf.body?.error ?? ""}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll mirror checks passed");
process.exit(failures ? 1 : 0);
