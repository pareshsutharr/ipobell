// Server-side fetch for URLs that come from outside (an admin's pasted link, a web page, the IPO feed, an AI
// answer). Plain fetch() would let such a URL reach this server's own network: localhost, the cloud metadata
// address, private ranges. safeFetch refuses those, re-checks every redirect hop, and caps the hop count.
//
// What it checks, per hop: http/https only, no user:password@, default ports only, hostname is not a local
// name, and EVERY address the hostname resolves to is a public one.
// Known limit: the name is resolved here and again by fetch(), so a DNS answer that changes in between
// ("rebinding") is not covered. Closing that needs a connection pinned to the checked address.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type Resolver = (hostname: string) => Promise<string[]>;

const defaultResolver: Resolver = async (hostname) => (await dnsLookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

const LOCAL_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example)$/i;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [network, prefix length] — everything that is not the public internet.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

function isPublicV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  for (const [net, bits] of V4_BLOCKED) {
    const base = ipv4ToInt(net) as number;
    const size = 2 ** (32 - bits);
    if (n >= base && n < base + size) return false;
  }
  return true;
}

/** Expand an IPv6 address to its 8 groups (handles "::" and a trailing dotted IPv4). */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  const lastColon = s.lastIndexOf(":");
  if (s.includes(".")) {
    const n = ipv4ToInt(s.slice(lastColon + 1));
    if (n === null) return null;
    s = `${s.slice(0, lastColon + 1)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const groups = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => Number.isFinite(g)) ? groups : null;
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const embedded = () => isPublicV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  if (g.slice(0, 7).every((x) => x === 0)) return false; // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(); // ::ffff:a.b.c.d (IPv4-mapped)
  if (g.slice(0, 6).every((x) => x === 0)) return embedded(); // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(); // 64:ff9b::/96 NAT64
  if (g[0] === 0x2002) return false; // 6to4 wraps an IPv4 address
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  return true;
}

export function isPublicAddress(ip: string): boolean {
  const bare = ip.replace(/^\[|\]$/g, "");
  const kind = isIP(bare.split("%")[0]);
  if (kind === 4) return isPublicV4(bare);
  if (kind === 6) return isPublicV6(bare);
  return false;
}

/** Throws UnsafeUrlError unless the URL is a plain public http(s) address. Returns the parsed URL. */
export async function assertPublicUrl(input: string | URL, resolver: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    throw new UnsafeUrlError("That is not a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsafeUrlError("Only http and https links are allowed.");
  if (url.username || url.password) throw new UnsafeUrlError("Links with a user name or password are not allowed.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Links to non-standard ports are not allowed.");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname) throw new UnsafeUrlError("That link has no host name.");
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new UnsafeUrlError("Links to private or local addresses are not allowed.");
    return url;
  }
  if (!hostname.includes(".") || LOCAL_NAME.test(hostname)) throw new UnsafeUrlError("Links to local host names are not allowed.");

  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    throw new UnsafeUrlError("That host name could not be found.");
  }
  if (!addresses.length) throw new UnsafeUrlError("That host name could not be found.");
  // Every address must be public: a name with one public and one private record is refused.
  if (!addresses.every(isPublicAddress)) throw new UnsafeUrlError("That host name points to a private or local address.");
  return url;
}

export interface SafeFetchOptions {
  /** Redirect hops to follow after the first request (default 3). */
  maxRedirects?: number;
  resolver?: Resolver;
  fetchImpl?: typeof fetch;
}

export interface SafeFetchResult {
  response: Response;
  /** The URL that produced `response`, after redirects. */
  finalUrl: string;
}

/** fetch() for untrusted URLs: validates the URL and each redirect target, follows at most `maxRedirects` hops. */
export async function safeFetch(input: string | URL, init: Omit<RequestInit, "redirect"> = {}, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const doFetch = opts.fetchImpl ?? fetch;
  let current = await assertPublicUrl(input, opts.resolver);
  for (let hop = 0; ; hop++) {
    const response = await doFetch(current, { ...init, redirect: "manual" });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return { response, finalUrl: current.href };
    await response.body?.cancel().catch(() => undefined);
    if (hop >= maxRedirects) throw new UnsafeUrlError(`Too many redirects (more than ${maxRedirects}).`);
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new UnsafeUrlError("The server redirected to an invalid link.");
    }
    current = await assertPublicUrl(next, opts.resolver);
  }
}
