import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "./env";

/** Request-scoped server client that reads/writes the auth cookies. Call inside Server Components, Route Handlers and Server Actions. */
export async function supabaseServer() {
  const { url, anon } = publicEnv();
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes the session instead.
        }
      },
    },
  });
}
