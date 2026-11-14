# Be IPO Ready — setup guide

Everything below that says **done** is already configured on the Supabase project `ehpjxstddpkxijfjelax` (IPOBELL). Items marked **you** need the Firebase / Google / Play consoles, which only you can access.

## 1. Supabase — done

- Schema, RLS, triggers, realtime publication: `supabase/migrations/20261026000100_init_schema.sql`
- Cron + Vault: `supabase/migrations/20261026000200_cron.sql` (vault secrets `project_url`, `cron_secret` exist); `pan_key` (PAN encryption for the allotment tracker) was created on 27 Oct 2026 — **back it up** from the Supabase Vault UI; losing it makes saved PANs unreadable.
- Edge Functions deployed; secrets set from `supabase/.env` (git-ignored). The same `CRON_SECRET` lives in Vault so pg_cron can call the functions.
- Anonymous sign-in: enabled.

To redeploy after code changes: `export SUPABASE_ACCESS_TOKEN=... && ./supabase/deploy.sh`.
Manual sync: `curl -X POST https://ehpjxstddpkxijfjelax.supabase.co/functions/v1/sync-ipos -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' -d '{"budget":60}'`.
IPO data comes from the Be IPO Ready mirror (`https://beipoready.com/api/ipo-data`, key `bpr_…` in `IPO_API_KEY`), never from IPO Guru directly — see docs/ARCHITECTURE.md. Cut over on 30 Oct 2026 (sync-ipos v10); check the mirror any time with `IPO_API_KEY=… node supabase/scripts/verify-mirror.mjs`.
Dry-run reminders: `… /functions/v1/daily-reminders -d '{"mode":"morning","dryRun":true}'`.

## 2. Firebase + FCM (Android push) — you

1. Firebase console → project **ipobell** (you already have it) → *Add app → Android*.
   - Package name: `in.ipobell.app` (must match `android.package` in `app/app.config.ts`).
   - Nickname: Be IPO Ready. SHA-1: optional for FCM; required later for Google sign-in (step 3).
2. Download **google-services.json** and save it as `app/google-services.json` (git-ignored). For EAS builds, upload it as a secret file: `eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json` and keep `app.config.ts` reading `process.env.GOOGLE_SERVICES_JSON`.
3. Skip the "Add Firebase SDK" Gradle steps — the `expo-notifications` config plugin and `@react-native-firebase`-free setup handle it; Expo's prebuild wires the Google Services Gradle plugin from `googleServicesFile`.
4. Firebase console → *Project settings → Cloud Messaging*: make sure **Firebase Cloud Messaging API (V1)** is enabled.
5. Firebase console → *Project settings → Service accounts → Generate new private key*. Put the JSON (single line) into `supabase/.env` as `FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}` and run `supabase secrets set --env-file supabase/.env --project-ref ehpjxstddpkxijfjelax`.
6. Test: install a dev build on a real device, allow notifications, then open **More → Notifications → Send test** (calls the `test-push` function for your own device). `select * from device_tokens` shows the registration. Or from a terminal: 
   ```bash
   curl -X POST https://ehpjxstddpkxijfjelax.supabase.co/functions/v1/send-notifications \
     -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' \
     -d '{"type":"generic","title":"Be IPO Ready test","body":"Push works 🎉","dedupe_key":"test:'$(date +%s)'"}'
   ```

How delivery works: the Edge Function sends an FCM HTTP v1 *data* message with `title`, `message`, `body` (JSON payload) and `channelId`; `expo-notifications` renders it in the matching Android channel and the app deep-links on tap (`src/lib/notifications/push.ts`).

## 3. Sign-in (added 29 Oct 2026) — partly you

The app now opens with a Welcome screen: **Continue with Google**, **Continue with email**, or **Skip for now** (anonymous account, upgradable later from Profile → Create account).

Email + password works as soon as the phase-2 migration is applied. Two dashboard settings matter (Supabase → Authentication):

- **URL configuration → Redirect URLs**: add `beipoready://auth/callback` (email confirmation, password reset and Google all return through this deep link; the app exchanges the PKCE code itself).
- **Providers → Email**: leave "Confirm email" on if you want verified addresses; the app shows a "check your inbox" screen in that case.

Google sign-in in **real builds** uses Google's native account sheet (`@react-native-google-signin/google-signin`) and `supabase.auth.signInWithIdToken` — no browser, no redirect. In **Expo Go** the native module is absent, so the app falls back to the browser OAuth flow with the `exp://` return link (needs `exp://**` on the Supabase redirect allow-list).

Native sign-in needs, in Google Cloud → APIs & Services → Credentials (**you**, one time):
1. The existing **Web application** client (its ID is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `app/.env` and the client configured in Supabase → Providers → Google).
2. An **Android** client: package name `in.ipobell.app`, SHA-1 of the release upload key `8C:10:70:53:4A:A9:32:C4:92:2B:BE:67:9F:A9:27:BA:E1:E7:8A:A4` (from `credentials/upload-keystore.jks`). Without it the sheet fails with DEVELOPER_ERROR and the app shows "Google sign-in is not configured for this build yet". After Play Store upload, also add the SHA-1 Google shows under Play Console → App signing (Google re-signs the app).
3. (iOS later) an **iOS** client with bundle id `in.ipobell.app`, plus `iosUrlScheme` in the plugin config.

Browser flow (Expo Go) needs the console work below:
1. Google Cloud console → APIs & Services → Credentials → *OAuth client ID* of type **Web application**. Authorised redirect URI: `https://ehpjxstddpkxijfjelax.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the Web client ID and secret, enable.
3. Nothing to change in the app; it uses `signInWithOAuth` through the system browser and the deep link above. Until the provider is enabled the Google button shows "Google sign-in is not enabled yet. Use email for now."

## 3b. Admin panel + super admin

- Apply `supabase/migrations/20261029000100_roles_admins_insights.sql` (`./supabase/deploy.sh` or `supabase db push`). It creates `admin_users`, `ipo_insights`, the `insights` storage bucket and the admin policies, and allow-lists `pareshsutharr@gmail.com` as **super admin**.
- Open the admin panel (`admin/`, deployed on Vercel) → *Create account* with that email and the password of your choice. The sign-up trigger promotes the address automatically; no password is stored anywhere in the repo.
- Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (same values as `app/.env`), and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project settings → API keys → secret/service role; needed only for the **Admins** page that creates editor accounts).
- Editors created from the panel get an email + temporary password; they can write insights and triage leads but cannot manage admins.

## 3c. Lead e-mail notifications (29 Oct 2026)

Every business lead from the app (readiness score, eligibility, issue size, issue cost, checklist, book-a-call, Get Listed form) is e-mailed with the contact details and everything the person entered. Pipeline: `business_leads` insert → trigger → Edge Function `notify-lead` → SMTP (admin@beipoready.com on GoDaddy) → the addresses in admin panel → **Settings** (default `beipoready@gmail.com`).

One-time setup (**you**; production deploys are not allowed from the assistant's session):

```bash
cd /Users/pareshsuthar/Desktop/IPOBELL
export SUPABASE_ACCESS_TOKEN=sbp_...
supabase db push                                                                    # applies 20261029000200_lead_notifications.sql
supabase secrets set --env-file supabase/.env --project-ref ehpjxstddpkxijfjelax    # SMTP_* + LEAD_NOTIFY_DEFAULT_EMAIL + ADMIN_PANEL_URL
supabase functions deploy notify-lead daily-reminders --project-ref ehpjxstddpkxijfjelax
```

Then open the admin panel → Settings → **Send a test e-mail** (needs `SUPABASE_SERVICE_ROLE_KEY` on Vercel). Each lead shows "E-mailed to the team · time" or the SMTP error in its drawer under Leads. GoDaddy SMTP: `smtpout.secureserver.net`, port 465, TLS, user `admin@beipoready.com`.

## 4. AdMob — not used

Ads were removed from the app on 27 Oct 2026 (no AdMob SDK, no ad units). If you ever want them back, re-add `react-native-google-mobile-ads` and the `src/lib/ads` components from git history.

## 5. Play Billing — removed

There is no Premium tier; `expo-iap` and the `verify-purchase` function were removed on 27 Oct 2026.

## 6. App environment

```
cd app && cp .env.example .env
```
`EXPO_PUBLIC_SUPABASE_ANON_KEY` is the **publishable** key (`sb_publishable_…`, Supabase → Project settings → API keys). Never put the service-role or secret key in the app.

## 7. Build & run

```bash
cd app
npm install
npx expo prebuild --platform android     # generates android/ (CNG; don't hand-edit)
npx expo run:android                     # dev build on a connected device/emulator
# or in the cloud:
npx eas-cli login && npx eas-cli build:configure
npx eas-cli build --platform android --profile development
```
Push notifications, ads and billing need a **development build** (not Expo Go) and a **physical device**.

## 8. Edge Function secrets reference

| Secret | Used by |
|---|---|
| `IPO_API_BASE_URL` (`https://beipoready.com/api/ipo-data`), `IPO_API_KEY` (Be IPO Ready connector key `bpr_…`, scope `ipo:read`; **not** an IPO Guru key) | sync-ipos |
| `CRON_SECRET` | all cron-called functions (header `x-cron-secret`), must equal Vault `cron_secret` |
| `FCM_SERVICE_ACCOUNT_JSON` | send-notifications / sync-ipos / daily-reminders |
| `GMP_ALERT_THRESHOLD_PCT` (default 2) | sync-ipos GMP-change alerts |
