# Be IPO Ready — run, test and Play Store release checklist

## A. Local run & smoke test

- [ ] `cd app && npm install && npx tsc --noEmit && npx expo lint && npx jest`
- [ ] `node --test supabase/tests`
- [ ] `app/google-services.json` present; `app/.env` filled (Supabase publishable key at minimum)
- [ ] `npx expo prebuild --platform android && npx expo run:android` on a physical device
- [ ] Onboarding → allow notifications → `select count(*) from device_tokens` increases
- [ ] Home lists Open/Upcoming/Closed/Listed; pull-to-refresh; search; filters
- [ ] Detail: subscription bars, GMP chart, financials, documents open, Add to calendar, share, allotment button
- [ ] Watchlist star persists across restarts (anonymous session is persisted)
- [ ] Airplane mode: cached lists still render (react-query persister)
- [ ] Test push (docs/SETUP.md §2.6) arrives, tapping opens the IPO
- [ ] Dark/light theme switch
- [ ] Premium: Play licence tester can purchase on an internal-testing build; `profiles.is_premium` flips

## B. Backend health

- [ ] `select * from sync_runs order by started_at desc limit 5` — `ok = true`, api_calls ≈ 2–20 per run (mirror requests, no quota)
- [ ] `select jobname, schedule, active from cron.job` — 7 jobs active
- [ ] `select status, count(*) from notification_log group by 1` — once FCM is configured no new `failed` rows
- [ ] `sync_runs.error` has no `check IPO_API_KEY` (bad bpr_ key) or repeated `stopped early` (mirror `not_synced`) rows

## C. Signing (configured on 26 Oct 2026)

An **upload keystore** was generated locally and is git-ignored:

| Item | Value |
|---|---|
| Keystore | `app/credentials/upload-keystore.jks` (alias `upload`) |
| Passwords | `app/credentials/keystore.properties` (also mirrored in `app/credentials.json` for EAS `credentialsSource: local`) |
| SHA-1 | `8C:10:70:53:4A:A9:32:C4:92:2B:BE:67:9F:A9:27:BA:E1:E7:8A:A4` |
| SHA-256 | `A2:AC:AE:CD:54:26:16:44:F9:8A:07:6E:BD:E2:D4:DA:B4:1F:62:AE:DE:BB:58:BB:2E:C7:EF:E1:FC:42:D3:EC` |

- [ ] **Back up `app/credentials/` somewhere safe** (password manager / encrypted drive). Losing it means you cannot update the app unless Play App Signing is enabled (keep it enabled; it is the default when you create the app).
- [ ] Add the SHA-1 above to Firebase → Project settings → Android app, and to the Google Cloud **Android** OAuth client (needed for Google sign-in on release builds). After the first Play upload also add the **App signing key** SHA-1 from Play Console → Setup → App integrity.

## D. Build the release bundle (local, no cloud queue)

```bash
cd app
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npx expo prebuild --platform android --clean      # regenerates android/
python3 scripts/android-release-signing.py        # injects release signing from credentials/keystore.properties
cd android && ./gradlew bundleRelease             # → android/app/build/outputs/bundle/release/app-release.aab
```

**Release-only crash guard (R8):** Expo 58 enables R8 shrinking in release builds. The keep rules in `app.config.ts` → `expo-build-properties.android.extraProguardRules` are required; without them WorkManager's Room database is stripped and the app closes at launch (`Failed to create an instance of androidx.work.impl.WorkDatabase`). Always smoke-test the **release** APK before uploading:

```bash
adb install -r release/be-ipo-ready-<version>.apk
adb logcat -c && adb shell am start -n in.ipobell.app/.MainActivity && sleep 10 && adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime"   # must print nothing
```

**Verify the signer before distributing** (a regenerated `android/` can silently fall back to the debug key):

```bash
$ANDROID_HOME/build-tools/$(ls $ANDROID_HOME/build-tools | sort -V | tail -1)/apksigner verify --print-certs app/android/app/build/outputs/apk/release/app-release.apk | grep DN
# must print: CN=Be IPO Ready, OU=Mobile, O=BEIPOREADY ...   (never "CN=Android Debug")
```

Bump `versionCode` (and `version`) in `app/app.config.ts` before every new upload. Cloud alternative with the same keystore: `npx eas-cli build --platform android --profile production` (uses `credentials.json`).

**29 Oct 2026 note:** the repo is not a git repository and no EAS project is linked (`@pareshsutharr/beipoready` does not exist). Local Gradle builds are the release path. If you ever want EAS: `cd app && EAS_NO_VCS=1 npx eas-cli init --force` once, then export the printed id as `EAS_PROJECT_ID` (app.config.ts reads it) and run with `EAS_NO_VCS=1`. `app/.easignore` already excludes node_modules/android/ios.

## D2. EAS build (optional)

- [ ] `npx eas-cli build --platform android --profile production` → `.aab`
- [ ] Set EAS secrets: `GOOGLE_SERVICES_JSON` (file), `ADMOB_ANDROID_APP_ID`, all `EXPO_PUBLIC_*`
- [ ] Install the AAB via internal testing and re-run section A on a release build 

## E. Play Console

New personal developer accounts (created after Nov 2023) must run a **closed test with at least 12 testers opted in for 14 continuous days** before they can apply for production access. Plan for this:

- [ ] Create app (`in.ipobell.app`, Finance category)
- [ ] *Testing → Closed testing*: create a track, upload the AAB, add a testers email list (≥ 12 Gmail accounts), share the opt-in link, keep the build available 14 days, then *Apply for production access* from the dashboard
- [ ] Store listing: name "Be IPO Ready – IPO GMP & Alerts", short + full description (no "guaranteed returns" language), screenshots (phone 16:9 + feature graphic 1024×500), app icon 512×512
- [ ] Privacy policy URL (host `app/src/app/legal/privacy.tsx` text at https://ipobell.in/privacy or any public page)
- [ ] **Data safety** form:
  - Data collected: Device or other IDs (push token) — app functionality, not shared; App interactions (watchlist, preferences) — app functionality; Purchase history (subscription token) — app functionality; Email + name **only** if the user signs in with Google (account management)
  - Data is encrypted in transit; users can request deletion (in-app Settings → Delete account); no data collected from children
- [ ] *App content*: Ads declaration = **no** (the app contains no ads); Financial features = "No financial features / informational only" (the app does not facilitate transactions); Target audience 18+; Content rating questionnaire (Finance app, no gambling)
- [ ] *Account deletion* URL/instructions (Policy → App content → Data deletion): in-app via Settings
- [ ] Add `com.android.vending.BILLING` is already in the manifest via `app.config.ts`; activate subscriptions after the first upload
- [ ] Pre-launch report: check for crashes; fix any Android 13+ `POST_NOTIFICATIONS` prompt issues (the prompt only appears after a channel exists — handled in `requestPushPermission`)

## F. Legal copy to keep in the listing

> Be IPO Ready provides information for educational purposes only and is not investment advice. We are not SEBI-registered investment advisors. Grey Market Premium (GMP) is unofficial and unregulated. Data by IPO Guru.

## G. After launch

- [ ] Monitor `sync_runs.error` and the Supabase Edge Function logs
- [ ] Rotate the Be IPO Ready connector key (`IPO_API_KEY`, bpr_…) if it ever leaks (it only lives in Supabase secrets); the IPO Guru key lives on the website only
- [ ] Watch the IPO Guru plan expiry on the website side (the mirror has no `/me`); if the website sync stops, this app's `sync_runs` will show `not_synced` stops
