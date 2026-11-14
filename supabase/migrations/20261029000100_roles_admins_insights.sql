-- Phase 2 (29 Oct 2026): user roles, admin accounts, staff-written Business Insights per IPO,
-- admin access to leads, and the `insights` storage bucket.
--
-- Design notes
--  * `profiles.role` is the person's self-declared audience (investor / business). It only drives UI.
--  * `public.admin_users` is the staff list. Rows are written by the admin panel's server (service
--    role) or by the bootstrap trigger below. Clients can never insert/update it.
--  * `private.admin_allowlist` holds emails that become admins automatically on sign-up. The super
--    admin email is seeded here so no password ever lives in the repository.
--  * `public.ipo_insights` is one editorial row per IPO. Published rows are public; drafts are admin-only.

-- ---------------------------------------------------------------------------
-- profiles: audience role + business contact fields
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role          text check (role in ('investor','business')),
  add column if not exists company_name  text,
  add column if not exists phone         text,
  add column if not exists city          text;

-- ---------------------------------------------------------------------------
-- admin accounts
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'editor' check (role in ('super_admin','editor')),
  display_name text,
  email       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger admin_users_set_updated_at before update on public.admin_users
  for each row execute function public.set_updated_at();

create table if not exists private.admin_allowlist (
  email       text primary key,
  role        text not null default 'editor' check (role in ('super_admin','editor')),
  created_at  timestamptz not null default now()
);
insert into private.admin_allowlist (email, role)
values ('pareshsutharr@gmail.com', 'super_admin')
on conflict (email) do update set role = excluded.role;

-- Promote an existing auth user if the super admin already signed up before this migration ran.
insert into public.admin_users (user_id, role, email, display_name)
select u.id, a.role, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
  from auth.users u
  join private.admin_allowlist a on lower(a.email) = lower(u.email)
on conflict (user_id) do update set role = excluded.role;

-- Role helpers used by RLS. `stable` + security definer so policies can call them cheaply.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()));
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()) and au.role = 'super_admin');
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_super_admin() from anon;

-- Bootstrap: allow-listed emails become admins the moment their auth user is created.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  insert into public.profiles (id, email, display_name, avatar_url, is_anonymous)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.is_anonymous, false)
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  if new.email is not null then
    select a.role into v_role from private.admin_allowlist a where lower(a.email) = lower(new.email);
    if v_role is not null then
      insert into public.admin_users (user_id, role, email, display_name)
      values (new.id, v_role, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
      on conflict (user_id) do update set role = excluded.role;
    end if;
  end if;

  return new;
end;
$$;

-- Also catch anonymous → email upgrades (updateUser) for allow-listed addresses.
create or replace function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  update public.profiles
     set email        = new.email,
         is_anonymous = coalesce(new.is_anonymous, false),
         display_name = coalesce(display_name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
         avatar_url   = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
   where id = new.id;

  if new.email is not null and new.email is distinct from old.email then
    select a.role into v_role from private.admin_allowlist a where lower(a.email) = lower(new.email);
    if v_role is not null then
      insert into public.admin_users (user_id, role, email)
      values (new.id, v_role, new.email)
      on conflict (user_id) do update set role = excluded.role;
    end if;
  end if;
  return new;
end;
$$;

alter table public.admin_users enable row level security;
-- Admins see the staff list; nobody else does. Writes go through the service role only.
create policy "admin_users: admins read" on public.admin_users for select to authenticated using (public.is_admin());
grant select on public.admin_users to authenticated;

-- ---------------------------------------------------------------------------
-- ipo_insights — staff-written Business Insight per IPO
-- ---------------------------------------------------------------------------
create table if not exists public.ipo_insights (
  id              uuid primary key default gen_random_uuid(),
  ipo_id          uuid not null unique references public.ipos (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft','published')),

  headline        text,                 -- one-line hook, e.g. "From a 12-person workshop in Adajan to NSE Emerge"
  summary         text,                 -- 2–3 sentences shown on cards
  company_story   text,                 -- what the business does, how it makes money
  founder_story   text,                 -- the promoter's journey
  listing_journey text,                 -- how they went from private company to SEBI/exchange approval
  lessons         text,                 -- what a promoter can learn (free text)

  location_city   text,
  location_state  text,
  founded_year    integer check (founded_year is null or founded_year between 1800 and 2100),
  employees       text,
  sector          text,

  verdict         text check (verdict is null or verdict in ('positive','neutral','cautious')),
  verdict_note    text,                 -- the house view in one paragraph

  takeaways       text[] not null default '{}',    -- bullet points for business owners
  highlights      jsonb  not null default '[]'::jsonb,  -- [{label, value}]
  hero_image_url  text,
  gallery         jsonb  not null default '[]'::jsonb,  -- [{url, caption}]
  video_url       text,

  show_to_investors boolean not null default true,   -- also surface a short "Research note" in the investor view

  author_id       uuid references auth.users (id) on delete set null,
  updated_by      uuid references auth.users (id) on delete set null,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ipo_insights_status_idx on public.ipo_insights (status, published_at desc);
create trigger ipo_insights_set_updated_at before update on public.ipo_insights
  for each row execute function public.set_updated_at();

-- Keep published_at in step with status.
create or replace function public.ipo_insights_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (old is null or old.status is distinct from 'published') then
    new.published_at = coalesce(new.published_at, now());
  end if;
  if new.status = 'draft' then
    new.published_at = null;
  end if;
  new.updated_by = coalesce((select auth.uid()), new.updated_by);
  if old is null then
    new.author_id = coalesce(new.author_id, (select auth.uid()));
  end if;
  return new;
end;
$$;
revoke execute on function public.ipo_insights_stamp() from public, anon, authenticated;
create trigger ipo_insights_stamp before insert or update on public.ipo_insights
  for each row execute function public.ipo_insights_stamp();

alter table public.ipo_insights enable row level security;
create policy "insights: published are public" on public.ipo_insights
  for select to anon, authenticated using (status = 'published');
create policy "insights: admins read all" on public.ipo_insights
  for select to authenticated using (public.is_admin());
create policy "insights: admins write" on public.ipo_insights
  for insert to authenticated with check (public.is_admin());
create policy "insights: admins update" on public.ipo_insights
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "insights: admins delete" on public.ipo_insights
  for delete to authenticated using (public.is_admin());
grant select on public.ipo_insights to anon, authenticated;
grant insert, update, delete on public.ipo_insights to authenticated;

-- Realtime: the app invalidates its insight query when staff publish.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ipo_insights;
  end if;
exception when duplicate_object then null;
end $$;

-- Lightweight list of IPOs that have a published insight (for list markers).
create or replace view public.ipo_insight_markers
with (security_invoker = true) as
  select i.ipo_id, i.verdict, i.headline, i.hero_image_url, i.published_at
    from public.ipo_insights i
   where i.status = 'published';
grant select on public.ipo_insight_markers to anon, authenticated;

-- ---------------------------------------------------------------------------
-- business_leads: the admin panel reads and triages them
-- ---------------------------------------------------------------------------
alter table public.business_leads add column if not exists notes text;
alter table public.business_leads add column if not exists assigned_to uuid references auth.users (id) on delete set null;

create policy "leads: admins read" on public.business_leads for select to authenticated using (public.is_admin());
create policy "leads: admins update" on public.business_leads for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant update (status, notes, assigned_to) on public.business_leads to authenticated;

-- Admins may also read profiles (to see who a lead is) but still cannot touch premium columns.
create policy "profiles: admins read" on public.profiles for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- storage: `insights` bucket (public read, admin write)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('insights', 'insights', true, 8388608, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "insights bucket: public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'insights');
create policy "insights bucket: admins insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'insights' and public.is_admin());
create policy "insights bucket: admins update" on storage.objects
  for update to authenticated using (bucket_id = 'insights' and public.is_admin());
create policy "insights bucket: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'insights' and public.is_admin());

-- ---------------------------------------------------------------------------
-- profile self-service: role + business fields are the user's own to set
-- (covered by the existing "profiles: update own" policy; premium columns stay frozen by trigger)
-- ---------------------------------------------------------------------------
comment on column public.profiles.role is 'Self-declared audience: investor | business. Drives the default perspective in the app.';
comment on table public.ipo_insights is 'Staff-written Business Insight for an IPO (shown in the Business perspective of the app).';
