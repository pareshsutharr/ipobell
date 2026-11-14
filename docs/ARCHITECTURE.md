# Be IPO Ready — architecture

```
IPO Guru API ─▶ beipoready.com sync ─▶ MongoDB ─▶ /api/ipo-data (mirror, IPO Guru v2 shapes)
                                                 │
                            (sync-ipos, 15 min)  ▼
                                        Postgres (ipos, ipo_subscriptions, ipo_gmp_history, ipo_financials,
                                                 ipo_documents, ipo_anchors)
                                          │              ▲
                     change detection     │              │ Realtime (postgres_changes)
                     (new / listed /      ▼              │
                      milestone / GMP) ─▶ notify.ts ──▶ FCM HTTP v1 ──▶ Android (expo-notifications channels)
                                          ▲
 pg_cron ─▶ daily-reminders (08:30 / 15:00 / 19:00 IST) ┘
 App ─▶ supabase-js (RLS) ─▶ watchlist / notification_preferences / device_tokens / profiles
 App ─▶ verify-purchase (user JWT) ─▶ Google Play Developer API ─▶ profiles.is_premium
```

## Data source: the Be IPO Ready mirror (no IPO Guru calls from this app)

Since 30 Oct 2026 `sync-ipos` reads `https://beipoready.com/api/ipo-data` (`IPO_API_BASE_URL`), the website's read-only mirror of IPO Guru. The website runs the only IPO Guru sync (one shared key, 1,000 requests/day); this app spends none of that quota. The mirror serves the IPO Guru v2 paths and `{ success, data }` envelope unchanged (`/ipos`, `/ipos/{slug}`, `/ipos/{slug}/subscription`, `/ipos/{slug}/gmp/history`, `/ipos/{slug}/anchors`) plus `GET /live` (every open / just-closed IPO with its subscription payload in one response). Auth is `X-API-KEY: bpr_…` (`IPO_API_KEY`, scope `ipo:read`). Attribution stays "Data by IPO Guru": the data is still theirs.

Mirror freshness (the ceiling for this app): list/GMP every 15 min in market hours, hourly otherwise; open-IPO subscription every 15 min (up to 45 min in very busy weeks); detail every 3 h for open IPOs.

Per run `sync-ipos` makes 1 list call (`/ipos?months=4`; `months=0` once a day), 1 `/live` call for all subscriptions (per-slug `/subscription` only as a fallback), then within a per-run budget (default 60, cap 200; the mirror has no quota, the budget just bounds a run's duration):

1. `/ipos/{slug}` details — new IPOs immediately; open/closed every 12 h; upcoming every 24 h; listed every 7 days
2. `/ipos/{slug}/gmp/history` for active IPOs once a day
3. `/ipos/{slug}/anchors` once per mainboard IPO around opening (SME once)

Error handling (`_shared/ipo-data.ts`): 401/403 → fatal, the run fails with "check IPO_API_KEY (bpr_ key)"; 404 `not_found` → the mirror has no data for that sub-resource yet, skipped (anchors/GMP history are stamped so they retry tomorrow, details retry next run); 503 `not_synced`, 5xx and network errors → at most 2 retries, then the run stops early (`stopped` in the response, `ok=false` in `sync_runs`) and the next cron run picks up. Requests are spaced 300 ms apart; `sync_runs.api_calls` counts mirror requests. Milestone and GMP-change pushes still come from diffing consecutive runs; subscription snapshots are keyed by the payload's `summary.updated_at`, so an unchanged mirror payload is a no-op (`ignoreDuplicates`).

## Notification pipeline

| Type | Source | Dedupe key |
|---|---|---|
| new_ipo | sync diff (unknown slug, upcoming/open, opened < 45 days ago) | `new_ipo:{slug}` |
| listed | sync diff (listing_price appears) | `listed:{slug}` |
| subscription_milestone | sync (1x, 2x, 5x, 10x, 25x, 50x, 100x per Retail/NII/QIB/Total) | `milestone:{slug}:{col}:{m}` |
| gmp_change | sync (Δ ≥ GMP_ALERT_THRESHOLD_PCT points, watchlist-only) | `gmp_change:{slug}:{date}:{up|down}` |
| opens_today / closes_today / allotment / refund / demat_credit / listing_today | daily-reminders morning | `{type}:{slug}:{date}` |
| closing_soon | daily-reminders 15:00 IST | `closing_soon:{slug}:{date}` |
| allotment_tomorrow / listing_tomorrow | daily-reminders evening | `{type}:{slug}:{date}` |

`notify.dispatch()` claims dedupe keys with an `upsert … ignoreDuplicates` into `notification_log` (unique `dedupe_key`), so a re-run can never send twice. Recipients come from `notification_recipients(type, ipo_id)` (preferences + only-watchlist + watchlist scoping for GMP alerts + tokens seen in the last 120 days). Users eligible for several IPOs of the same type get **one grouped push**. Invalid FCM tokens (404/UNREGISTERED) are deleted.

## Security model

- `ipos*` tables: public `select`, writes only through the service role (Edge Functions).
- `profiles`, `device_tokens`, `notification_preferences`, `watchlist`: RLS `auth.uid() = user_id`; `is_premium`/`premium_until` are frozen for clients by a trigger.
- `notification_log`, `sync_runs`, `purchases` (write): service role only. `private` schema is not exposed; the only public wrapper (`notification_recipients`) has `execute` revoked from `anon`/`authenticated`.
- Cron → function auth: `x-cron-secret` header compared in constant time against `CRON_SECRET`; `verify-purchase` / `delete-account` require a user JWT (`verify_jwt = true`).
- Anonymous users use the `authenticated` role; a free-tier watchlist cap (10) is enforced in a trigger.

## App data layer

- `@tanstack/react-query` with AsyncStorage persistence (7-day cache) → instant offline lists.
- Supabase Realtime on the detail screen invalidates `ipo`, `subscription` and `gmp` queries as the sync writes.
- Auth bootstrap: `signInAnonymously()` on first launch; Google upgrade merges anonymous data client-side.


## "Check my IPO" allotment tracker (added 27 Oct 2026)

- **Data**: `user_pans` (PAN pgp-encrypted with the Vault secret `pan_key`; only `pan_last4` is readable) and `ipo_applications` (user × IPO × PAN, status machine `pending → allotted | not_allotted | not_found | manual | error`). Clients create rows only through `add_pan()` / `add_application()` (security definer, validates PAN format, free limit 5 PANs); `reveal_pan()` returns a user's own PAN for the manual flow; `due_applications()` / `decrypt_pan_admin()` are service-role only.
- **Checker**: Edge Function `check-allotments`, cron `ipobell-check-allotments` every 20 min 10:00–22:00 IST. First check at 10:00 IST on allotment day; `not_found` retries every 40 min, `error` every 30 min, up to 60 checks or listing+7 days.
- **Drivers** (`_shared/registrars.ts`): MUFG Intime (`GetDetails` → company match → `generateToken` → `SearchOnPan`, XML `<Table>` rows with `ALLOT`/`SHARES`/`PEMNDG`), Bigshare (`IPO_Status.html` options → `Data.aspx/FetchIpodetails`, `ALLOTED`/`APPLIED`). KFintech (CAPTCHA + WAF), Maashitla (SPA, undocumented API), Skyline, Cameo, Purva → `manual`: the app opens the registrar page with the PAN copied. Requests use a descriptive User-Agent and never impersonate a browser.
- **Notifications**: `allotment_result` (channel `allotment`) is a *targeted* push via `dispatchToUser()` (dedupe `allotment_result:{application_id}`), plus a one-time `allotment_manual:{application_id}` nudge for manual registrars on allotment day. Honours the user's `allotment` preference.
- **Probe**: `POST /functions/v1/check-allotments {"probe":{"driver":"mufg","ipo_name":"…","pan":"…"}}` with the cron secret dry-runs a driver.


## Get Listed — advisory tools and lead capture (28 Oct 2026)

- `app/src/features/business/tools.ts` holds all tool logic as pure functions (readiness scoring, eligibility rules, issue size, issue cost, checklist). The screens under `app/src/app/(tabs)/(home,watchlist,profile,business)/business/` only render them. Keep the numbers in sync with the website when beipoready.com changes its calculators.
- Leads: `features/business/leads.ts` → `supabase.rpc('submit_business_lead')` → `public.business_leads`. The RPC is `security definer`, validates contact (phone or email required), and rate-limits to 10 rows per user per day. Users can `select` only their own rows; staff read the table from the dashboard or export it to the CRM.
- Forwarding: `private.forward_business_lead()` (after-insert trigger) POSTs the lead to `https://beipoready.com/api/leads` with `source = app:<tool>` through pg_net. It is best-effort: failures are swallowed and the row stays in Postgres. `forwarded_at` is reserved for a future response-checking job.
- Delete-my-data: `business_leads.user_id` is `on delete set null`, so the lead survives account deletion (it is a business enquiry the person asked us to act on) but is no longer linked to the anonymous user.


## Perspectives, sign-in and Business Insights (29 Oct 2026)

- **Auth** (`app/src/lib/auth/store.ts`): no automatic anonymous sign-in any more. `status: "ready"` + `session: null` → `/welcome`. Google uses `signInWithOAuth` (PKCE, `skipBrowserRedirect`) + `WebBrowser.openAuthSessionAsync` + `exchangeCodeForSession`; email uses password auth with `emailRedirectTo: beipoready://auth/callback`; "Skip" is `signInAnonymously`. `linkEmail()` upgrades a guest with `updateUser({ email, password })`, keeping every row (watchlist, PANs, applications) because the `auth.users.id` does not change. `app/src/app/auth/callback.tsx` handles the deep link (a second exchange of an already-used code is tolerated when a session exists).
- **Role & perspective** (`app/src/features/perspective/store.ts`): `role` (profile, AsyncStorage) gates the tabs (`/choose-role` until set); `perspective` is the header switch and defaults to the role. `(tabs)/_layout.tsx` redirects: no session → welcome, no role → choose-role.
- **Insights**: `public.ipo_insights` (1:1 with `ipos`, RLS: published rows public, admins everything) + view `ipo_insight_markers` for list badges. The app reads with `features/insights/api.ts`; realtime on `ipo_insights` invalidates the detail query so a publish appears without restart. The house view (`verdict`) is rendered with non-advisory wording (`verdictMeta`) and a disclaimer.
- **Admins**: `public.admin_users` + `public.is_admin()` / `is_super_admin()` (security definer, stable) drive every admin policy (insights, storage bucket `insights`, `business_leads` read/update, `profiles` read). `private.admin_allowlist` seeds the super admin email; `handle_new_user` / `handle_user_updated` promote matching sign-ups. The Next.js panel creates further admins through a server route that holds the service-role key and re-checks the caller is a super admin.

### Website parity check (29 Oct 2026)

`app/src/features/business/tools.ts` was re-diffed against the live beipoready.com tool bundles (`/ipo-readiness-tool`, `/issue-size-calculator`, `/issue-cost-estimator`, `/sme-ipo-checklist`). Readiness questions, options and scores, the five result bands (90/75/55/35 with the site's titles and descriptions), sector P/E table, growth premium, issue-size and market-cap formulas, the eight cost line items (₹350 L on a ₹35 Cr reference deal = 10%), the five payment stages, and the 32 checklist items now match the website text for text. The **Eligibility Check** (NSE Emerge / BSE SME / Main Board) is an app-only addition; the website has no such tool. Re-run this diff whenever the website's tools change.

- 29 Oct 2026: the Allotment tab was removed from the bottom bar at the firm's request. The tracker lives on as a pushed screen at `/allotment` (reached from the IPO page's "Check allotment status" button, Profile → "Check my IPO allotment", and allotment/refund push taps). Four tabs remain: IPOs, Watchlist, Get Listed, Profile.

## Lead e-mail notifications (29 Oct 2026)

`public.business_leads` insert → `private.notify_business_lead()` (after-insert trigger) → `private.invoke_edge_function('notify-lead', {lead_id})` over pg_net with the vault `cron_secret` → `supabase/functions/notify-lead` renders an HTML + text mail (contact, tool, readiness score, every payload key/value, link to the panel) and sends it with denomailer over SMTP (465/TLS). Recipients come from `public.app_settings` key `lead_notifications` (`{enabled, emails[]}`; admins read, super admins write; seeded with beipoready@gmail.com) with `LEAD_NOTIFY_DEFAULT_EMAIL` as the fallback. The function stamps `business_leads.notified_at` or `notify_error`. The admin panel's Settings page edits the list and can send a test through `POST /api/notifications/test` (service-role bearer → the same function with `{test:true}`). Failures never block the insert or the website forward.

## Product analytics (29 Oct 2026)

- **Client** `app/src/lib/analytics/index.ts`: `track(event, props)`, `trackScreen(path)` (root layout, every route change), `trackTool(tool, start|complete, summary)`, `openExternal(url, label)` (all outbound links go through it). Events are queued in memory, flushed in batches of ≤100 to `public.track_events(jsonb)` every 8 s / at 20 events / on background, persisted to AsyncStorage when a flush fails, and tagged with user id (anonymous or real), a per-device id, a session id (new after 30 min idle), role, current perspective, platform and app version. Nothing is sent while there is no session.
- **Server** `supabase/migrations/20261029000300_analytics.sql`: `analytics_events` (RLS: admins read; inserts only via the security-definer RPC, which caps batches at 100 and silently drops after 3000 events/user/hour). Admin-only read RPCs: `analytics_overview`, `analytics_daily`, `analytics_users`, `analytics_user_events`. Raw events are pruned after 18 months by `ipobell-prune-analytics` (pg_cron, Sundays 21:30 UTC).
- **Admin panel** `/analytics` (overview, audience split, daily chart, tool funnel, top screens / IPOs / insights / links / searches; an audience filter restricts everything to investors or business owners — `analytics_overview(p_from, p_to, p_audience)` / `analytics_daily(…, p_audience)`), `/analytics/audience` (per-person table with event timeline and CSV export), `/analytics/journeys` (per person × tool: started / completed / submitted, last result, contact — `analytics_tool_journeys(p_from, p_to, p_tool, p_stage, p_audience, p_limit)`, stages `started` | `completed` | `submitted` | `not_submitted`), `/analytics/events` (raw explorer).
- **Taxonomy**: app_open, screen_view, sign_in, role_selected, perspective_switch, ipo_view, insight_view, latest_insight_tap, watchlist, search, tool_start, tool_complete, tool_restart, lead_submit, external_link, share, calendar_add, allotment_check, notification_pref, push_open. Tools: readiness, eligibility, issue_size, issue_cost, checklist, book_call.
