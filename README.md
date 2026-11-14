# Be IPO Ready — Indian IPO tracker with alerts

React Native (Expo SDK 58) + Supabase (Postgres, Edge Functions, pg_cron, Realtime) + Firebase Cloud Messaging, fed with [IPO Guru](https://www.ipoguru.in) data through the Be IPO Ready website's read-only mirror (`beipoready.com/api/ipo-data`): IPO Guru → beipoready.com sync → MongoDB → `/api/ipo-data` → `sync-ipos` → Supabase → app. This app makes no IPO Guru requests of its own.

```
IPOBELL/
├── app/                        # Expo app (TypeScript, expo-router)
│   ├── app.config.ts           # Expo config + plugins (notifications, calendar, build properties…)
│   ├── eas.json                # EAS build/submit profiles
│   ├── .env.example            # EXPO_PUBLIC_* runtime config
│   └── src/
│       ├── app/                # routes: (tabs)/ IPOs|Watchlist|Get Listed|Profile, allotment, ipo/[slug], applications/*, search, notifications, about, legal/*
│       ├── components/ui/      # design system primitives (Text, Card, Button, Chip, Skeleton, Section, SegmentedControl…)
│       ├── features/           # ipos (types/api/hooks/components), watchlist, …
│       ├── lib/                # env, supabase client, react-query, theme, format, auth, notifications, analytics, errors
│       └── __tests__/          # jest
├── supabase/
│   ├── migrations/             # 000100 schema+RLS, 000200 pg_cron, 20261027 allotment tracker, 20261028 business_leads, 20261029 roles/admins/insights
│   ├── functions/              # sync-ipos, send-notifications, daily-reminders, check-allotments, test-push, delete-account, notify-lead, sync-watchdog, _shared/
│   ├── tests/                  # node --test (mappers, change detection, dedupe keys, watchdog)
│   ├── config.toml             # per-function verify_jwt
│   ├── .env.example            # Edge Function secrets
│   └── deploy.sh
├── admin/                      # Next.js admin panel (insights editor, leads, admins) — deployed on Vercel
└── docs/
    ├── PRODUCT_BRIEF.md        # approved phase-2 spec (two audiences, perspectives, insights, admin)
    ├── SETUP.md                # step-by-step: Supabase, Firebase/FCM, Google sign-in
    ├── RELEASE_CHECKLIST.md    # signing, closed testing, data safety, store listing
    └── ARCHITECTURE.md         # data flow, notification pipeline, API budget
```

## Quick start

```bash
# backend (already deployed to project ehpjxstddpkxijfjelax)
export SUPABASE_ACCESS_TOKEN=sbp_...
./supabase/deploy.sh

# app
cd app
cp .env.example .env            # fill in keys (see docs/SETUP.md)
npm install
npx expo prebuild --platform android
npx expo run:android            # or: npx eas-cli build --profile development --platform android
```

Tests: `node --test supabase/tests/*.test.ts` (backend mappers, registrars, watchdog; a bare directory fails on Node 24), `cd admin && npm test` (URL guard), `cd app && npx jest` (app), and `cd app && npm run test:dom` (jsdom tests of the injected registrar script against KFintech-style result pages). Type-check: `cd app && npx tsc --noEmit`. Lint: `npx expo lint`.

## What's live right now

| Piece | Status |
|---|---|
| Postgres schema, RLS, indexes, realtime publication | applied |
| pg_cron: sync every 15 min (08:30–18:29 IST), hourly otherwise, full backfill 06:50 IST, reminders 08:30 / 15:00 / 19:00 IST, weekly housekeeping | scheduled |
| Edge Functions: sync-ipos, send-notifications, daily-reminders, check-allotments, test-push, delete-account, notify-lead | deployed |
| Edge Function `sync-watchdog` and migrations `20261114000100`–`20261114000600` (sync alerts, lead forward retry, private raw feed data, error reporting, team-entered IPO data) | deployed and applied 14 Nov 2026 |
| Migrations `20261114000700` (IPOs by state) and `20261114000800` (interest signal, checklist sync) | written 14 Nov 2026, **not applied yet**: run `supabase db push` |
| Secrets: `IPO_API_KEY` (Be IPO Ready `bpr_…` connector key), `IPO_API_BASE_URL` (`https://beipoready.com/api/ipo-data`), `CRON_SECRET`, `ANDROID_PACKAGE_NAME`, `GMP_ALERT_THRESHOLD_PCT` | set (mirror cutover 30 Oct 2026, sync-ipos v10) |
| `FCM_SERVICE_ACCOUNT_JSON` | set (27 Oct 2026) |
| Anonymous auth | enabled |

Until `FCM_SERVICE_ACCOUNT_JSON` is set, notifications are detected, deduped and logged in `notification_log` with status `failed / FCM not configured`; nothing is lost and nothing is sent twice once FCM is on (dedupe keys are already claimed — clear `notification_log` rows with status `failed` if you want them re-sent).

## Check my IPO (allotment tracker)

Users save PANs (encrypted), add applications per IPO, and the backend checks MUFG Intime / Bigshare automatically on allotment day and pushes the result; CAPTCHA-protected registrars (KFintech, Maashitla, …) get a one-tap manual flow with the PAN copied. See docs/ARCHITECTURE.md.

## Get Listed (business-owner tools → advisory leads)

The fifth tab is the lead-generation side of the app for the advisory business. It ships the beipoready.com tools natively, with the same question banks, multiples and percentages so app and web results match:

| Tool | Route | Logic |
|---|---|---|
| IPO Readiness Score (20 Q, 5 areas, bands 90/75/55/35) | `/business/readiness` | `features/business/tools.ts` → `scoreReadiness` |
| Eligibility check (NSE Emerge / BSE SME / Main Board) | `/business/eligibility` | `checkEligibility` — compliance blockers, SME capital ≤ ₹25 Cr, EBITDA ≥ ₹1 Cr in 2/3 yrs, OFS ≤ 20%, GCP cap, NTA/leverage for BSE |
| Issue size calculator (PAT × sector P/E + growth premium, 20–30% dilution) | `/business/issue-size` | `calcIssueSize` |
| Issue cost estimator (≈10% of issue, 8 line items, 5 payment stages) | `/business/issue-cost` | `calcIssueCost` |
| SME IPO checklist (32 steps, ticks saved on device) | `/business/checklist` | `checklistProgress` |
| Book a readiness call | `/business/book-call` | `LeadForm` |

Every tool ends in a `LeadForm` ("send to our team"). Submissions call the `submit_business_lead` RPC → `public.business_leads` (RLS: users read only their own rows; 10 per user per day), and a DB trigger forwards each row to `https://beipoready.com/api/leads` via pg_net so app leads reach the same inbox as website leads. Contact details are remembered on-device. Entry points: the tab, an onboarding slide, a dismissible card under the IPO list, and a Profile row. Tests: `src/__tests__/business-tools.test.ts`.

## Two audiences, one app (29 Oct 2026)

See `docs/PRODUCT_BRIEF.md` for the approved spec. In short:

- **Welcome → sign-in** (Google / email / skip) → **"How will you use Be IPO Ready?"** (Investor / Business owner) → Home. The choice is stored on `profiles.role` and locally; it sets the default perspective.
- **Investor | Business switch** in the home header (`features/perspective`). Investor = today's tracker. Business = the same list plus a readiness strip, `INSIGHT` markers on rows, and on the detail page the staff-written **Business Insight** (`features/insights`): hero image, headline, vitals, the house view, company / founder / listing-journey chapters, highlights, gallery and "what this means for your company" ending in the advisory CTA. Investors see a compact **Research note** card with a one-tap switch to the full story.
- **Admin panel** (`admin/`, Next.js on Vercel): insight editor per IPO with image upload to the `insights` bucket, leads inbox, admin management (super admin only). Auth and role gating in `supabase/migrations/20261029000100_roles_admins_insights.sql`.

## Analytics (29 Oct 2026)

Every screen view, IPO view, perspective switch, tool start/completion, lead, search, watchlist change and outbound link is tracked (`app/src/lib/analytics`) into `public.analytics_events` and analysed in the admin panel → **Analytics** (overview, audience, raw events). See `docs/ARCHITECTURE.md` → Product analytics.

## Compliance

- The app shows "Information only. Not investment advice. We are not SEBI-registered advisors." on every data screen and has a full Disclaimer and Privacy Policy page.
- "Data by IPO Guru" attribution links are rendered on list, detail and About screens (required by the API licence).
- Account deletion is in-app (Settings → Delete account → `delete-account` Edge Function).


## Scope (as of 27 Oct 2026)

Deliberately simple: no ads, no sign-in (anonymous device account), no subscriptions, no sponsor links. Five tabs: IPOs, Allotment (PAN tracker), Watchlist, Get Listed (advisory tools + lead capture, added 28 Oct 2026), Profile (notifications, saved PANs, appearance, about Be IPO Ready, legal, delete my data).
# ipobell
# ipobell
