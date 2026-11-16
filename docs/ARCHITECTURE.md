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
- `profiles`, `device_tokens`, `notification_preferences`, `watchlist`: RLS `auth.uid() = user_id`; `is_premium`/`premium_until` are frozen for clients by a trigger (unused: there is no Premium tier, see "Unused leftovers" below).
- `notification_log`, `sync_runs`, `purchases` (write): service role only. `private` schema is not exposed; the only public wrapper (`notification_recipients`) has `execute` revoked from `anon`/`authenticated`.
- Cron → function auth: `x-cron-secret` header compared in constant time against `CRON_SECRET`; `delete-account` and `test-push` require a user JWT (`verify_jwt = true`).
- Anonymous users use the `authenticated` role; a watchlist cap of 50 IPOs per account is enforced in a trigger (`enforce_watchlist_limit`).

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

## Safety and hygiene additions (14 Nov 2026)

Migrations `20261114000100` to `20261114000500`. Each is written to be applied in any order relative to a function deploy.

- **Sync watchdog** (`functions/sync-watchdog`, logic in `_shared/watchdog.ts`): pg_cron `ipobell-sync-watchdog` at :10 and :40. Unhealthy when the last 3 finished runs failed (a run unfinished after 10 minutes counts as failed) or there has been no successful run for 2 hours in market time (08:30–18:30 IST) / 4 hours otherwise. One e-mail when it turns unhealthy, a reminder every 6 hours, one on recovery. Recipients: `app_settings.sync_alerts` (`{enabled, emails[]}`), falling back to `LEAD_NOTIFY_DEFAULT_EMAIL`; state in `app_settings.sync_watchdog_state`. `POST {"dry":true}` returns the assessment without sending; `{"test":true}` sends a sample. Uses the same `SMTP_*` secrets as `notify-lead` through `_shared/mail.ts`.
- **Lead forwarding with retry** (`20261114000200`): the insert trigger now calls `private.send_lead_forward()`, which stores the pg_net request id. `private.reconcile_lead_forwards()` (pg_cron `ipobell-lead-forward-retry`, every 5 minutes) reads `net._http_response`: HTTP 2xx stamps `forwarded_at`; anything else writes `forward_error` and re-sends after 5, 10, 20 and 40 minutes, giving up after 5 attempts. Leads older than this migration are never re-sent. A retry after a lost response can deliver a lead twice; the message carries the lead id so the website can de-duplicate.
- **Raw feed payload is private** (`20261114000300`): `ipos.raw_data` is always `{}`. A BEFORE trigger moves whatever the sync writes there into `public.ipo_raw_data` (keyed by slug, `list` and `detail`, service role only). `sync-ipos` is unchanged. The empty column stays so released apps that `select *` keep working; drop it once the function stops writing it.
- **Error reporting** (`20261114000400`, `app/src/lib/errors`): uncaught JS errors (`ErrorUtils` global handler), screens that fail to render (root `ErrorBoundary` → `ErrorScreen`) and `reportError()` calls are scrubbed of PANs, e-mails, phone numbers and tokens, throttled (one per fingerprint per minute, 10 per minute overall), saved to AsyncStorage and sent to `public.report_errors(jsonb)` once a session exists (20 per call, 60 per user per hour). Admin panel → **App errors** reads `public.app_error_groups()`. Rows are pruned after 90 days. Not covered: native crashes before JavaScript starts (needs a native crash SDK and a new build).
- **Admin outbound requests** (`admin/src/lib/safe-fetch.ts`): `import-image`, `logo-hero` and media discovery fetch outside URLs only through `safeFetch`, which allows http/https on default ports, refuses any host that is or resolves to a private, loopback, link-local or reserved address (IPv4 and IPv6, including mapped forms), re-checks each redirect and follows at most 3. Known limit: DNS is resolved once for the check and again by `fetch` (rebinding is not covered). `next.config.ts` allows optimised images only from Supabase storage, so `/_next/image` is no longer an open proxy.
- **CI** (`.github/workflows/ci.yml`): app (type check, lint, jest, jsdom tests), supabase (`node --test supabase/tests/*.test.ts`), admin (`next typegen`, type check, tests). No secrets needed.

### Testing migrations locally

There is no local Supabase stack in the repo. `supabase/scripts/local-test-db/up.sh` starts a throwaway local Postgres with small stand-ins for `auth`, `vault`, `cron`, `net` and `storage` (`stubs.sql`) and applies every migration; the migrations in this section were exercised against it. Edge Functions (Deno) were not executed locally: their decision logic lives in `_shared/*.ts` modules covered by `supabase/tests`, but the first real run of a new function is in the hosted project.

### Unused leftovers

`public.purchases`, `profiles.is_premium`, `premium_until`, `premium_product_id` and the `protect_premium_columns` trigger remain from the removed Premium tier (27 Oct 2026). Nothing reads or writes them; they are marked as unused with table and column comments (`20261114000500`) and kept because released app versions still select `profiles.*`. `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` in `supabase/.env.example` is likewise unused.

## Team-entered IPO data (14 Nov 2026)

The feed has no state or sector, so staff enter them. `public.ipo_admin_data` (`20261114000600`, one row per IPO): `state` (CHECK against the 28 states and 8 union territories), `sector`, `industry`, `listing_platform` (`nse_emerge` | `bse_sme` | `mainboard`), `is_promoted` (reserved, unused). Everyone reads; only admins write; `sync-ipos` never touches it. A missing row or null field means "not entered": clients show "Not specified".

Admin panel: the IPO page has an "IPO data entered by the team" form (suggestions from the insight and the feed are one-click, never auto-saved); **IPOs → Import state & sector (CSV)** downloads a sheet of every IPO and imports the filled sheet (matched by slug, blank cell = leave as is, a line with an invalid value is rejected and reported, nothing is guessed); the IPO list shows a Complete / Incomplete badge and filter. Lists and CSV logic: `admin/src/lib/ipo-admin-data.ts`, tested in `admin/tests/ipo-admin-data.test.ts` (which also checks the state list against the migration and the sector list against the app's `SECTOR_PE`).

## Investor and business quick wins (14 Nov 2026)

- **Listing statistics** (`/listing-stats`, entry on the Listed segment of Home): average and median listing gain, share listed above issue price, SME against Mainboard, best and worst listing, for 3 / 6 / 12 months or all. Numbers come from `get_listing_stats` (one call per board); `features/ipos/stats.ts` only derives what is shown. Checked against an independent calculation on live data for all 12 period × board combinations.
- **Paging** (`features/ipos/paging.ts`, `useIposPaged`): Closed and Listed on Home load 40 rows at a time (`count: exact`, `range`, with `slug` as the last sort key so rows with the same date cannot repeat or go missing between pages). Rows are de-duplicated by id when pages are joined.
- **IPOs by state** (`/states`, `/states/[state]`, "By state" chip on Home): `public.ipo_directory` (`20261114000700`, security-invoker view = list columns + `state`, `sector`, `industry`, `listing_platform`) and `public.ipo_state_counts(p_board)`. IPOs with no state are one group, "Not specified". List rows show the state when one is entered (`useIpoStates`, one cached request). If the view is not in the database, the screens say the view is being set up (`isNotSetUpError`).
- **Interest signal**: `public.ipo_interest(ipo_id)` (`20261114000800`, security definer) returns watchlist count and distinct viewers in 30 days; values below 3 are returned as NULL so a number never points at one or two people. Shown under the status badge on the IPO page; any error shows nothing.
- **Checklist sync**: `public.checklist_progress` (one row per user, RLS own row). The screen keeps a phone copy `{done, dirty}`; on open, unsent phone ticks win and are sent, otherwise the account copy wins (`features/business/checklistSync.ts`). Saves are debounced 1.2 s; a failed save stays dirty and is retried.
- **Fundraising / pre-IPO / IPO interest**: `InterestCard` on the Get Listed tab sends through the existing lead form with source `business-hub`; the type rides in the payload as `Interest` and in the message, so the staff e-mail shows it and no backend change is needed.

## Notification filters, compare, business rules (14 Nov 2026)

- **Notification filters** (`20261114000900`): `notification_preferences.filter_board`, `filter_sectors`, `filter_min_issue_cr`, `filter_max_issue_cr`. Applied in `private.notification_recipients` through `private.ipo_passes_filters`, so every sender follows them with no function change. No filter = previous behaviour. A watchlisted IPO always passes. An unknown fact never blocks: an IPO with no sector entered or no size announced still passes that filter. App: Notifications → "Which IPOs" (`features/notifications/filters.ts`, which also carries the same rule as `ipoPasses` for tests).
- **Compare IPOs** (`/compare?slugs=a,b`, chip on Home, icon on the IPO page): two or three IPOs side by side: issue, demand, valuation ratios from `ipos.kpis`, financials from `ipo_financials`, listing result. Financials use each company's latest year ending 31 March (a newer part-year is skipped); if companies report in different units each figure carries its unit. Rows with no data are dropped. Nothing is ranked. Logic: `features/ipos/compare.ts`.
- **Business rules** (`20261114001000`, `public.business_rules`, keys `sector_pe`, `growth_premium`, `issue_size`, `issue_cost`, `eligibility`): the numbers behind the issue size, issue cost and eligibility tools. Everyone reads; only super admins write (admin panel → **Business rules**). The app keeps a bundled copy and validates each key on read (`features/business/rules.ts`): a missing, malformed or implausible value is ignored for that key, the bundled number is used, and the rejection is reported to App errors. The admin panel applies the same checks before saving (`admin/src/lib/business-rules.ts`). The migration seed is generated from the app's constants and a test keeps them identical. The app refreshes rules every 30 minutes or on reopen. Sector names cannot change remotely (they are shared with the IPO sector list and the alert filters). The checklist is deliberately not remote: ticks are stored by position, so editing the list would scramble saved progress.

## Business owner analysis tools (14 Nov 2026)

- **Growth analysis** (Business view of an IPO page, `features/ipos/growth.ts`): revenue and profit CAGR between the first and last full financial year (periods ending 31 March; part-years are skipped), year-on-year change and margin per year. When the maths has no meaning (a loss in the base or latest year, fewer than two full years) it says so in words instead of showing a number. Hidden when there are fewer than two full years.
- **Sector view** (`/sectors`, `/sectors/[sector]`, `20261114001100`): `public.ipo_sector_stats(p_board)` gives per-sector counts, average listing gain, listed above issue, average subscription and money raised. Averages use only IPOs that have the figure. Sector names contain "/", so the route parameter is percent-encoded (`sectorToParam`) and decoded until stable (`paramToState`).
- **Peers** (`20261114001200`): `public.sector_peers(sector)` lists the IPOs tagged with a sector with their reported ratios (`private.kpi_number` reads "13.03" / "34.09%" as numbers, anything else as NULL) and latest full-year figures. Medians and quartiles are computed in the app (`features/business/peers.ts`, linear interpolation as in Excel PERCENTILE.INC).
- **Valuation range** (`/business/valuation`): two yardsticks, profit × the sector P/E from business rules ± the band, and profit × the 25th to 75th percentile of listed peers' P/E (needs at least 3 peers with a positive P/E). Shows the overlap when there is one. There is no price-to-sales method: no P/S multiples exist in the data or the rules, and none were invented.
- **Compare my company** (`/business/peers`): the owner's revenue, EBITDA, PAT, debt and net worth against the peers' middle half; "above / in line / below most peers" only when at least 3 peers have the figure. Peers do not report EBITDA, so that row shows the owner's figure alone. Inputs stay on the phone unless sent through the lead form.
- Both tools send leads with source `business-hub` and the tool name in the payload.

## Case studies (14 Nov 2026)

`public.case_studies` (`20261114001300`): slug, title, exchange, listing year, city, summary (card text), body (paragraphs separated by blank lines), highlights, hero image, order, draft / published. Published rows are public; admins see and edit everything. Seeded with the one case study the app used to carry in code, word for word.

Admin panel → **Case studies**: list, editor (title fills the link name until it is edited; Save draft / Publish / Unpublish / Delete; image upload to the `insights` bucket under `case-studies/`). Save checks in `admin/src/lib/case-studies.ts`; publishing also requires the exchange and listing year.

App: `CaseStudies` on the Get Listed tab shows up to three cards and a "See all" link; `/business/case-studies` lists all, `/business/case-studies/[slug]` shows one with a lead form (source `business-hub`, payload "Case study read"). The hard-coded card is gone. If the list cannot be loaded at all (older backend, or offline with nothing cached) the app shows its bundled copy of that one case study; if the team has published none, the section is hidden.

## Offer documents, DRHP summaries and the review flow (14 Nov 2026)

- **Upload** (`20261114001400`, admin IPO page → "Offer documents"): the team uploads the DRHP, RHP or prospectus PDF (up to 50 MB) to the public-read bucket `ipo-documents`. `public.ipo_documents_admin` holds one row per file with type, version (numbered per IPO and type by a trigger; the newest is `is_current`) and extraction status. The app sees a document only when `text_status = 'done'`.
- **Text extraction** runs in the admin's browser with pdf.js (`admin/src/lib/pdf-text.ts`), not on the server, so no function time limit or request size limit applies. The file is opened before anything is uploaded (a damaged or password-protected PDF is refused), then each page's text is saved to `public.ipo_document_pages` in batches. Page text is readable by admins and the service role only. A PDF where no page has text (a scan) is marked failed with a plain message; pages with no text are counted, not hidden. The pdf.js worker is copied to `admin/public/` by `scripts/copy-pdf-worker.mjs` before every dev start and build so it always matches the installed library.
- **Summaries** (`20261114001500`, `public.ipo_drhp_summaries`): one-page summary, long summary, use of funds and risks, each with page numbers. "Draft with AI" (`/api/summaries/generate`) sends Gemini only pages of the uploaded document, chosen by `selectPages` (the best page of each section first, then by score, within a character budget), with instructions to cite the page of every fact, copy figures exactly and never advise. Page numbers the model was not shown are dropped from the structured fields and listed for the editor to check by hand. Save checks refuse advice wording ("subscribe", "avoid", "recommend", …). Nothing is saved by the AI; a person edits and publishes.
- **Review flow** (`20261114001500`, `20261114001600`): editors save drafts; only a super admin publishes a DRHP summary or a business insight, and only a super admin can change or delete one that is published. Enforced by triggers (`ONLY_SUPER_ADMIN_PUBLISHES`, `PUBLISHED_IS_LOCKED`), so it holds whatever the panel does; the panel hides Publish for editors and explains the refusal. This changed existing behaviour for insights: before, any admin could publish.
- **Change log** (`public.admin_change_log`, admin → Change log): every insert, update and delete on IPO data, insights, summaries, documents, case studies and business rules, with who, when, which columns changed and status changes. No before/after text is stored. A re-save with identical content is not logged. Kept two years.
- **App** (`DrhpSummarySection` on the IPO page, both perspectives): the one-page summary, "Where the money goes", "Risks the document states", the long summary behind "Read the full summary", and the uploaded PDFs. A page reference such as "(p. 87)" opens the PDF at that page (`#page=87`). Hidden when there is neither a published summary nor an uploaded document.

## Ask-the-DRHP (14 Nov 2026)

```
App (/ask-drhp?slug=…) ─▶ ask-drhp (user JWT) ─▶ public.search_document_pages (full-text, top 8 pages of the uploaded document)
                                         │                         │
                                         │                         ▼
                                         └──▶ Gemini (JSON: found, answer, pages) ─▶ parseAnswer ─▶ drhp_chat_log ─▶ app
```

- **Search** (`20261114001700`): PostgreSQL full-text search over `ipo_document_pages` (`tsv` generated column, GIN index), one result per page. `search_document_pages(ipo, terms, phrases, limit)` ORs the stemmed words of the question and lifts pages containing an exact phrase. Questions are answered from the newest stage uploaded and read (prospectus, else RHP, else DRHP). Callable by the service role only. **No embeddings / pgvector**: keyword search needs no extra service, is tested end to end on the local database, and page-level hits are what a citation needs. `expandQuery` adds the vocabulary offer documents use ("where will the money go" → "objects of the issue", "net proceeds"). Semantic search can be added later behind the same function.
- **Function** `supabase/functions/ask-drhp` (verify_jwt; guests included). Order of work: validate → refuse advice questions without a model call → reuse the answer to the same question about the same document from the last 14 days → daily limit (20 per user per 24 hours, `DRHP_CHAT_DAILY_LIMIT`) → search → Gemini (`GEMINI_API_KEY`, optional `GEMINI_MODEL`; JSON schema, temperature 0.1) → `parseAnswer` → log.
- **Rules, enforced in code** (`_shared/drhp-chat.ts`, unit-tested): the prompt gives only the retrieved pages and puts the quoted question after them; an answer is shown only if the model says it found one AND cites at least one page that was actually sent (made-up page numbers are dropped); otherwise the user gets "I could not find this in the offer document". Advice wording in a question (`isAdviceQuestion`) or in an answer is replaced by a fixed refusal. Text in the document is content, never instructions; because the output checks do not depend on the model obeying, an injected instruction cannot produce advice or an uncited answer.
- **Lead hook**: a question about eligibility, cost or readiness for one's own company (`detectIntent`) gets one extra sentence and buttons to the matching tool and to Book a call. The app accepts only those four routes from the server.
- **Log** `public.drhp_chat_log`: question, answer, pages, outcome (`answered` / `not_found` / `refused` / `error`), intent, cached. It is the limit counter and the cache. Users read their own rows; admins read all (admin → Questions); only the function writes. Kept one year. The privacy policy states that questions are stored and that the question and pages of the public document go to Google Gemini.
- **App**: `DrhpSummarySection` shows "Ask the document a question" when a readable document exists; the screen shows suggested questions, answers with page chips that open the PDF at that page, and a fixed disclaimer. Failures are mapped to plain messages (`classifyFailure`); a 404 (function not deployed) reads "not available yet".
- **Type check**: Edge Functions cannot run locally without Deno, so `supabase/typecheck/` type-checks every function with plain TypeScript and small stand-ins (`cd admin && npm run typecheck:functions`; also in CI).

## Balance sheet check (16 Nov 2026)

Plan step 5.1. A business owner chooses a statements file or types figures, checks them, and sees ratios and SME rule checks. Saving to the account is optional.

- **Reading happens on the phone.** `features/business/sheetRead.ts` opens Excel / CSV with SheetJS (`xlsx` 0.20.3, installed from the SheetJS CDN because the npm registry copy is old and has known issues). `sheetParse.ts` takes a number only when the row label is one it recognises (`MATCHERS`) and the column sits under a year heading; it detects the unit note ("₹ in Lakhs") and asks the user when the file does not say. Net worth, borrowings, intangibles and EBITDA can be worked out from other rows, and the screen says so. Nothing is guessed; the user reviews every figure. PDFs are accepted for upload only: their figures are typed.
- **Report:** `features/business/health.ts`, pure. Eight ratios and five checks against the same `EligibilityLimits` the eligibility check uses (so they follow the admin's Business rules). A missing figure gives "Not specified". The wording states numbers and whether a published limit is met; a test fails if it grades or recommends. This is not plan step 5.2 (stats-based grading), which is still not built.
- **Saving needs consent** (`healthSaved.ts`: text, version `BALANCE_SHEET_CONSENT_VERSION`). `healthApi.ts` uploads the file to the private bucket `balance-sheets` at `<user id>/<report id>.<ext>` and inserts a row in `public.balance_sheet_reports` with the checked figures and the consent version. A trigger sets the owner, the consent time and the expiry (90 days) on the server and limits a person to 5 reports. Rows are never updated.
- **Who can read:** the owner (own folder, own rows) and admins (read only). Signed-out visitors have no access. Admin → Balance sheets lists reports; the file opens through `/api/balance-sheets/<id>/download`, a link valid for one minute, created with the admin's own session.
- **Deleting:** the owner deletes in the app (file first, then the row). `purge-balance-sheets` (pg_cron, nightly) removes reports past 90 days and files no report points at (failed upload, deleted account, removed guest); it asks `public.balance_sheet_purge_list()` (service role only) and removes files through the Storage API. `delete-account` removes the user's folder before deleting the user.
- **Usage data:** `tool_complete` for `health_check` carries counts only (years, figures, checks met), never amounts.
- **Native modules:** `expo-document-picker` and `expo-file-system` are loaded only when "Choose a file" is tapped (`healthPick.ts`); an app built before they were added says to update and offers typing.
- Leads from the screen use the source `balance-sheet-check` (added to the `business_leads` check constraint). The older journey report groups unknown sources under "book a call"; it has not been changed.
