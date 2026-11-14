// Environment access. Secrets are set with `supabase secrets set`; SUPABASE_* are injected by the platform.

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing environment variable ${name}`);
  }
  return v;
}

export function envOptional(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v === "" ? undefined : v;
}

export const config = {
  get supabaseUrl() {
    return env("SUPABASE_URL");
  },
  get serviceRoleKey() {
    return env("SUPABASE_SERVICE_ROLE_KEY");
  },
  get anonKey() {
    return env("SUPABASE_ANON_KEY");
  },
  /** Be IPO Ready data mirror (IPO Guru v2 shapes, served by beipoready.com). Never point this at ipoguru.in. */
  get ipoApiBaseUrl() {
    return env("IPO_API_BASE_URL", "https://beipoready.com/api/ipo-data").replace(/\/+$/, "");
  },
  /** Connector key for the mirror (bpr_…, scope ipo:read). */
  get ipoApiKey() {
    return env("IPO_API_KEY");
  },
  get cronSecret() {
    return env("CRON_SECRET");
  },
  get fcmServiceAccountJson() {
    return envOptional("FCM_SERVICE_ACCOUNT_JSON");
  },
  get playServiceAccountJson() {
    return envOptional("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  },
  get androidPackageName() {
    return env("ANDROID_PACKAGE_NAME", "in.ipobell.app");
  },
  get gmpAlertThresholdPct() {
    return Number(envOptional("GMP_ALERT_THRESHOLD_PCT") ?? "2");
  },
};
