"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "./env";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Browser client (cookies shared with the server). One instance per tab. */
export function supabaseBrowser() {
  if (!client) {
    const { url, anon } = publicEnv();
    client = createBrowserClient(url, anon);
  }
  return client;
}
