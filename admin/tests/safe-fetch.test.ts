// Unit tests for the server-side URL guard. Run: npm test (node --test). No network: DNS and fetch are faked.
import assert from "node:assert/strict";
import { test } from "node:test";

import { assertPublicUrl, isPublicAddress, safeFetch, UnsafeUrlError, type Resolver } from "../src/lib/safe-fetch.ts";

const PUBLIC_IP = "93.184.216.34";
const dns = (map: Record<string, string[]>): Resolver => async (host) => {
  if (!(host in map)) throw new Error("ENOTFOUND");
  return map[host];
};
const publicDns = dns({ "company.co.in": [PUBLIC_IP], "cdn.company.co.in": [PUBLIC_IP], "press.example.org": ["2606:2800:220:1:248:1893:25c8:1946"] });

async function rejects(url: string, resolver: Resolver = publicDns) {
  await assert.rejects(() => assertPublicUrl(url, resolver), UnsafeUrlError, `expected ${url} to be refused`);
}

test("public addresses are recognised", () => {
  for (const ip of ["8.8.8.8", "93.184.216.34", "1.1.1.1", "172.15.255.255", "172.32.0.0", "100.63.255.255", "100.128.0.0", "198.17.255.255", "198.20.0.0", "223.255.255.255", "2606:4700:4700::1111", "2001:4860:4860::8888"]) {
    assert.equal(isPublicAddress(ip), true, ip);
  }
});

test("loopback, private, link-local, metadata and reserved IPv4 are refused", () => {
  for (const ip of ["127.0.0.1", "127.255.255.254", "0.0.0.0", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "100.127.255.255", "192.0.0.1", "192.0.2.5", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("local and wrapped IPv6 are refused", () => {
  for (const ip of ["::1", "::", "fc00::1", "fd12:3456:789a::1", "fe80::1", "fe80::1%en0", "fec0::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "2002:7f00:1::", "[::1]"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
});

test("IPv4-mapped and NAT64 forms of a public address are allowed", () => {
  assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
  assert.equal(isPublicAddress("64:ff9b::808:808"), true);
});

test("garbage is never treated as public", () => {
  for (const ip of ["", "not-an-ip", "999.1.1.1", "1.2.3", "1.2.3.4.5", ":::", "gggg::1", "1::2::3"]) {
    assert.equal(isPublicAddress(ip), false, JSON.stringify(ip));
  }
});

test("a normal public link passes and is returned parsed", async () => {
  const u = await assertPublicUrl("https://company.co.in/about/team.jpg?x=1", publicDns);
  assert.equal(u.hostname, "company.co.in");
  assert.equal((await assertPublicUrl("http://company.co.in:80/a", publicDns)).hostname, "company.co.in");
  assert.equal((await assertPublicUrl("https://press.example.org/a.png", publicDns)).hostname, "press.example.org");
  assert.equal((await assertPublicUrl("https://8.8.8.8/x", publicDns)).hostname, "8.8.8.8");
});

test("literal local addresses are refused, in every spelling the URL parser accepts", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://127.0.0.1:80/admin",
    "http://localhost/",
    "http://LOCALHOST/",
    "http://localhost./",
    "http://2130706433/", // 127.0.0.1 as a decimal number
    "http://0x7f000001/", // hex
    "http://0177.0.0.1/", // octal
    "http://127.1/", // short form
    "http://0/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://10.0.0.5/",
    "http://192.168.0.10/router",
    "http://172.20.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
  ]) {
    await rejects(url);
  }
});

test("wrong schemes, credentials and odd ports are refused", async () => {
  for (const url of ["file:///etc/passwd", "ftp://company.co.in/a.png", "gopher://company.co.in/", "javascript:alert(1)", "data:image/png;base64,AAAA", "https://user:pass@company.co.in/a.png", "https://company.co.in:8443/a.png", "http://company.co.in:6379/", "http://company.co.in:22/", "not a url", ""]) {
    await rejects(url);
  }
});

test("local-looking host names are refused without a DNS lookup", async () => {
  let lookups = 0;
  const counting: Resolver = async () => {
    lookups++;
    return [PUBLIC_IP];
  };
  for (const url of ["http://intranet/", "http://db.internal/", "http://printer.local/", "http://app.localhost/", "http://box.lan/", "http://kubernetes.default.svc.cluster.local/"]) {
    await rejects(url, counting);
  }
  assert.equal(lookups, 0);
});

test("a public-looking name that resolves to a private address is refused", async () => {
  await rejects("https://evil.example.org/", dns({ "evil.example.org": ["127.0.0.1"] }));
  await rejects("https://evil.example.org/", dns({ "evil.example.org": ["10.1.2.3"] }));
  await rejects("https://evil.example.org/", dns({ "evil.example.org": ["::1"] }));
  await rejects("https://evil.example.org/", dns({ "evil.example.org": ["::ffff:192.168.1.1"] }));
});

test("one private record among public ones is enough to refuse", async () => {
  await rejects("https://mixed.example.org/", dns({ "mixed.example.org": [PUBLIC_IP, "169.254.169.254"] }));
});

test("unknown hosts and empty answers are refused", async () => {
  await rejects("https://nowhere.example.org/", dns({}));
  await rejects("https://empty.example.org/", dns({ "empty.example.org": [] }));
});

// ---- safeFetch -------------------------------------------------------------------------------------------

type Route = { status: number; location?: string; body?: string };
function fakeFetch(routes: Record<string, Route>) {
  const seen: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const href = String(input);
    seen.push(href);
    assert.equal(init?.redirect, "manual", "redirects must be handled by safeFetch, not by fetch");
    const r = routes[href];
    if (!r) return new Response("not found", { status: 404 });
    return new Response(r.status >= 300 && r.status < 400 ? null : (r.body ?? "ok"), { status: r.status, headers: r.location ? { location: r.location } : {} });
  }) as typeof fetch;
  return { impl, seen };
}

test("safeFetch returns the response and the final URL when there is no redirect", async () => {
  const f = fakeFetch({ "https://company.co.in/a.jpg": { status: 200, body: "img" } });
  const { response, finalUrl } = await safeFetch("https://company.co.in/a.jpg", {}, { resolver: publicDns, fetchImpl: f.impl });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "img");
  assert.equal(finalUrl, "https://company.co.in/a.jpg");
});

test("safeFetch follows a public redirect, including a relative one", async () => {
  const f = fakeFetch({
    "https://company.co.in/a.jpg": { status: 301, location: "https://cdn.company.co.in/a.jpg" },
    "https://cdn.company.co.in/a.jpg": { status: 302, location: "/final/a.jpg" },
    "https://cdn.company.co.in/final/a.jpg": { status: 200, body: "img" },
  });
  const { response, finalUrl } = await safeFetch("https://company.co.in/a.jpg", {}, { resolver: publicDns, fetchImpl: f.impl });
  assert.equal(response.status, 200);
  assert.equal(finalUrl, "https://cdn.company.co.in/final/a.jpg");
  assert.equal(f.seen.length, 3);
});

test("safeFetch refuses a redirect to a local address and never requests it", async () => {
  for (const target of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/", "http://localhost:3000/", "http://[::1]/", "http://10.0.0.8/", "file:///etc/passwd"]) {
    const f = fakeFetch({ "https://company.co.in/a.jpg": { status: 302, location: target } });
    await assert.rejects(() => safeFetch("https://company.co.in/a.jpg", {}, { resolver: publicDns, fetchImpl: f.impl }), UnsafeUrlError, target);
    assert.deepEqual(f.seen, ["https://company.co.in/a.jpg"], `the redirect target ${target} must not be fetched`);
  }
});

test("safeFetch refuses a redirect to a name that resolves privately", async () => {
  const f = fakeFetch({ "https://company.co.in/a.jpg": { status: 307, location: "https://rebind.example.org/x" } });
  const resolver = dns({ "company.co.in": [PUBLIC_IP], "rebind.example.org": ["192.168.1.20"] });
  await assert.rejects(() => safeFetch("https://company.co.in/a.jpg", {}, { resolver, fetchImpl: f.impl }), UnsafeUrlError);
  assert.equal(f.seen.length, 1);
});

test("safeFetch stops after the redirect limit", async () => {
  const routes: Record<string, Route> = {};
  for (let i = 0; i < 10; i++) routes[`https://company.co.in/r${i}`] = { status: 302, location: `/r${i + 1}` };
  const f = fakeFetch(routes);
  await assert.rejects(() => safeFetch("https://company.co.in/r0", {}, { resolver: publicDns, fetchImpl: f.impl }), /Too many redirects/);
  assert.equal(f.seen.length, 4, "first request + 3 redirects");

  const g = fakeFetch(routes);
  await assert.rejects(() => safeFetch("https://company.co.in/r0", {}, { resolver: publicDns, fetchImpl: g.impl, maxRedirects: 0 }), /Too many redirects/);
  assert.equal(g.seen.length, 1);
});

test("safeFetch never makes a request for an unsafe first URL", async () => {
  const f = fakeFetch({});
  await assert.rejects(() => safeFetch("http://127.0.0.1/", {}, { resolver: publicDns, fetchImpl: f.impl }), UnsafeUrlError);
  assert.equal(f.seen.length, 0);
});

test("a 3xx without a Location header is returned as is", async () => {
  const f = fakeFetch({ "https://company.co.in/a": { status: 304 } });
  const { response } = await safeFetch("https://company.co.in/a", {}, { resolver: publicDns, fetchImpl: f.impl });
  assert.equal(response.status, 304);
});
