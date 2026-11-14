# Be IPO Ready app — product brief (v2, 29 Oct 2026)

Approved by the firm's head on 29 Oct 2026. This document is the working specification for the
second phase of the app. It turns the head's direction into concrete, testable objectives.

## 1. Why the app exists

Be IPO Ready (beipoready.com, Surat) is an SME IPO advisory firm. The app has one commercial
purpose: **bring business owners, promoters and CFOs to the firm**. Everything shown to retail
investors (live IPO list, GMP, subscription, allotment) is marketing: it puts the Be IPO Ready
name in front of people every day and builds goodwill, so that when they, or someone they know,
think about listing a company, they already trust the brand.

Two audiences, one app:

| Audience | What they come for | What the firm gets |
|---|---|---|
| Retail investor | Current, upcoming and listed IPOs, GMP, allotment tracking, alerts | Daily brand exposure, goodwill, word of mouth |
| Business owner / promoter / CFO | Learn from real IPO stories, readiness score, eligibility, issue size and cost, a call with the advisors | Qualified leads for advisory services |

## 2. Objectives (what "done" means)

1. **Account first.** On first launch the user signs in with Google or with email and password.
   A small "continue without an account" path remains so a retail user is never blocked, and the
   anonymous account can be upgraded to a real one later without losing watchlist or PANs.
2. **Ask who they are.** Right after sign-in the app asks: *Investor* or *Business owner*. The
   answer is saved on the profile and sets the default perspective. It can be changed any time.
3. **Two perspectives in the header.** The home screen header carries a two-way switch:
   **Investor | Business**. Both show the same live IPO list. The Business perspective adds, for
   every IPO where the team has written one, a **Business Insight**: images, the founder and
   company story, where the business is located, how it got from a private company to a
   SEBI/exchange-approved listing, the firm's house view on the issue, and what a promoter can
   learn from it. The Business perspective also keeps the advisory tools one tap away.
4. **Insights are written by staff, not scraped.** A web admin panel (Next.js on Vercel) lets
   the team add and update an insight for any IPO in the database: text sections, hero image,
   gallery, location, verdict, takeaways, draft/publish. The panel also shows the leads the app
   collects and lets a super admin create or remove other admin accounts.
5. **Super admin.** `pareshsutharr@gmail.com` is the super admin. Other admins (editors) are
   created from the panel by the super admin. Passwords are never stored in the repository.
6. **Advisory tools stay central.** Readiness score, eligibility, issue size, issue cost,
   checklist and book-a-call (built 28 Oct) remain, reachable from the Business perspective, the
   Get Listed tab and the Profile.
7. **Premium, human look.** A refined palette (deep navy, warm paper white, restrained gold) and
   Poppins throughout (headings 700, body 400–600). No gradients-for-decoration,
   no emoji in UI, no generic "AI app" tropes. Real copy written for Indian promoters.
8. **Nothing breaks.** Type-check, lint and all tests pass. Existing features (alerts, allotment
   tracker, watchlist, delete-my-data) keep working for anonymous and signed-in users alike.

## 3. User flows

### First launch
Splash → **Welcome** (brand, one-line promise, "Continue with Google", "Continue with email",
small "Skip for now") → **Who are you?** (Investor / Business owner, one tap) → optional
notification permission → Home in the matching perspective.

### Returning user
Splash → Home in the last-used perspective. The role screen is shown again only if the profile
has no role (e.g. an older install).

### Investor perspective
Exactly today's home: Open / Upcoming / Closed / Listed, board filter, IPO rows, detail page with
timeline, subscription, GMP, financials, documents, allotment. If a published insight exists it
appears as a short "Research note" card inside the detail page.

### Business perspective
Same list. Rows that have a published insight show a small "Insight" marker. The detail page opens
with the **Business Insight** block first: hero image, headline, the company in one paragraph,
founder story, listing journey, location and vitals, house view with a clear disclaimer, and
"what this means for your company" takeaways that end in a call-to-action to the readiness tool
or a call. Below it, the normal investor sections. A slim strip under the header links to the
user's readiness score (or invites them to take it) and to Book a call.

### Admin panel (web)
Login → Dashboard (leads this week, insights published, upcoming IPOs without an insight) →
IPOs (search, filter by status/board, insight status) → Insight editor (all fields, image upload,
live phone preview, Save draft / Publish / Unpublish) → Leads (table, status, notes) →
Admins (super admin only: invite by email with a temporary password, role, remove).

## 4. Data model additions (Supabase)

- `profiles.role` (`investor` | `business`), `profiles.company_name`, `profiles.phone`.
- `public.admin_users` (`user_id`, `role` super_admin | editor, `created_by`). Readable by admins.
  Written only by the service role (the admin panel's server) or by the bootstrap trigger.
- `private.admin_allowlist` seeded with the super admin email: when that email signs up, the
  `handle_new_user` trigger makes it a super admin automatically. No password in the repo.
- `public.ipo_insights` one row per IPO: status, headline, summary, company_story,
  founder_story, listing_journey, location_city/state, founded_year, employees, verdict
  (`positive` | `neutral` | `cautious`), verdict_note, takeaways[], highlights[], hero_image_url,
  gallery[], author/updated_by, published_at. Public read of published rows; admins full access.
- Storage bucket `insights` (public read, admin write).
- `business_leads`: admins can read and update `status`/`notes` from the panel.
- Helper `public.is_admin()` / `public.is_super_admin()` used by all admin policies.

## 5. Guardrails

- The house view is editorial opinion, not SEBI-registered investment advice. Every verdict is
  shown with the disclaimer and the wording avoids "buy"/"sell".
- Anonymous users keep working. Sign-in is an upgrade, not a wall.
- Secrets (service role key, admin password) live only in Vercel/Supabase env, never in git.
- The admin panel verifies the caller's session and role on the server for every write.

## 6. Out of scope for this phase

iOS release, payments/premium, push for insights (easy follow-up: notify business users when a
new insight is published), multilingual copy.
