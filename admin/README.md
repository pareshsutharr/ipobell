# Be IPO Ready — admin panel

Next.js 16 (App Router) + Tailwind v4 + Supabase. The editorial desk for the app: write a **Business
Insight** for any IPO, triage **leads** from the app's tools, and (super admin) manage **team access**.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `https://ehpjxstddpkxijfjelax.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | the publishable/anon key (same as the app's `EXPO_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | needed only by `POST/DELETE /api/admins` (create/remove admins). Everything else works without it. |
| `GEMINI_API_KEY` | **server only** | enables **Draft with AI** in the insight editor (`POST /api/insights/generate`: text via Gemini with Google Search grounding, then real photos/YouTube links found on the company site and press pages, each verified; `POST /api/insights/import-image` copies a chosen photo into the `insights` bucket). Get a key at https://aistudio.google.com/apikey. Without it the button shows a "not set up" message. |
| `GEMINI_MODEL` | server only, optional | override the model (default tries `gemini-2.5-flash`, then `gemini-flash-latest`, then `gemini-3.8-flash`; 2.5 Flash is the only one the free tier allows Google Search grounding on, and it is 10x faster). |

Locally: copy the two public values into `admin/.env.local` (git-ignored). Never put the service-role key in
anything prefixed `NEXT_PUBLIC_`.

## Run locally

```bash
cd admin
npm install
npm run dev        # http://localhost:3000
npm run build      # type-check + production build
```

## Deploy to Vercel

```bash
vercel --cwd admin            # first time: link to a new project, framework auto-detected
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add GEMINI_API_KEY production
vercel --cwd admin --prod
```

The panel sets `robots: noindex`. Put it on a subdomain such as `admin.beipoready.com` if you like.

## First sign-in (super admin)

1. Apply `supabase/migrations/20261029000100_roles_admins_insights.sql` to the project. It seeds
   `private.admin_allowlist` with `pareshsutharr@gmail.com` as `super_admin`.
2. Open the panel → **First time here? Create your account** → sign up with that email and a password of your
   choice. The `handle_new_user` trigger inserts the matching `admin_users` row automatically. (If "Confirm
   email" is on in Supabase Auth, confirm from the inbox, then sign in.)
3. Go to **Team access** to add editors. Each gets a temporary password; they can change it from Supabase's
   normal password-reset flow later.

Anyone else who signs up gets "This account has no admin access" and is signed out again.

## How access control works

- `src/proxy.ts` refreshes the Supabase session cookie on each request and redirects signed-out visitors
  to `/login` (optimistic check only).
- `src/app/(dashboard)/layout.tsx` calls `requireAdmin()`: it loads the caller's `admin_users` row through
  the user's own session. RLS returns rows only to admins, so a missing row means no access → `/login?error=noaccess`.
- `/admins` additionally calls `requireSuperAdmin()`; the sidebar hides the entry for editors.
- All insight / lead writes go straight to Supabase from the browser under the user's JWT, guarded by the RLS
  policies in the migration (`public.is_admin()`).
- `/api/admins` is the only place the service-role key is used: it re-checks that the caller is a
  `super_admin` with the service-role client, then creates the auth user (`email_confirm: true`) and upserts
  `admin_users`. Deleting removes the `admin_users` row only, never the auth user, and refuses to remove
  yourself or the last super admin.

## Structure

```
src/
  proxy.ts                         session refresh + redirect
  lib/
    types.ts                       row types mirroring the SQL
    format.ts                      dates, ₹, %
    auth.ts                        requireAdmin / requireSuperAdmin
    supabase/{client,server,admin,env}.ts
  components/
    ui.tsx                         Button, Card, Badge, PageHeader, EmptyState, ErrorBanner, Stat
    Sidebar.tsx
    insight/InsightEditor.tsx      form + uploads + save/publish/unpublish/delete + Draft with AI + suggested media
    media-discovery.ts             (lib) finds + verifies photos and YouTube videos for an insight
    insight/PhonePreview.tsx       static render of what the app shows
    leads/LeadsTable.tsx           table + drawer (status, notes)
    admins/AdminsManager.tsx
  app/
    login/                         sign in / create account
    auth/signout/route.ts
    (dashboard)/                   layout with sidebar; page.tsx = overview
      ipos/                        list + filters; [id]/ = insight editor
      leads/
      admins/
    api/admins/route.ts            POST (create/grant), DELETE (revoke)
```

Images are uploaded from the browser to the public `insights` bucket at `<ipo_id>/<uuid>.<ext>`; the stored
value is the public URL. Deleting an insight does not delete its files.
