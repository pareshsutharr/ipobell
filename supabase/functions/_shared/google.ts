// Google OAuth2 access tokens from a service-account JSON, signed with WebCrypto (RS256).
// Used for FCM HTTP v1 and the Google Play Developer API.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
}

const cache = new Map<string, { token: string; expiresAt: number }>();

export function parseServiceAccount(raw: string): ServiceAccount {
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service account JSON must contain client_email and private_key");
  }
  return sa;
}

export async function getAccessToken(sa: ServiceAccount, scope: string): Promise<string> {
  const key = `${sa.client_email}|${scope}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await signRs256(sa.private_key, unsigned);
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(claims.aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache.set(key, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

async function signRs256(pem: string, input: string): Promise<string> {
  const der = pemToDer(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return b64url(new Uint8Array(sig));
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
