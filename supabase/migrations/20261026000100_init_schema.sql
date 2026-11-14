-- IPOBell — initial schema
-- Postgres 17 / Supabase. Applied with `supabase db push` or the Management API.
-- Conventions: uuid PKs, created_at/updated_at on every table, RLS everywhere.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;          -- helpers that must never be exposed through the Data API
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ipos — one row per issue (slug is the API id)
-- ---------------------------------------------------------------------------
create table public.ipos (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,                       -- api id, used for upserts
  name                text not null,
  display_name        text,
  board               text not null check (board in ('mainboard','sme')),
  sub_type            text,                                       -- Equity / BSE SME / NSE SME
  status              text not null check (status in ('upcoming','open','closed','listed')),
  api_status          text,                                       -- raw: Upcoming / Open / Closed
  stage               text,                                       -- live / pre_rhp
  dates_tba           boolean not null default false,
  is_listed           boolean not null default false,
  logo_url            text,
  feature_image_url   text,
  web_url             text,

  -- dates
  open_date           date,
  close_date          date,
  allotment_date      date,
  refund_date         date,
  credit_to_demat_date date,
  listing_date        date,

  -- issue details
  price_band          text,
  price_min           numeric(12,2),
  price_max           numeric(12,2),
  issue_price         numeric(12,2),
  face_value          numeric(10,2),
  lot_size            integer,
  min_investment      numeric(14,2),
  issue_size_cr       numeric(14,2),                              -- ₹ crore, total
  sale_type           text,                                       -- Fresh capital only / OFS only / Fresh cum OFS
  listing_on          text,                                       -- "BSE, NSE"
  employee_discount   text,
  bse_scrip_code      text,
  nse_symbol          text,
  lot_calculator      jsonb not null default '[]'::jsonb,         -- retail/sHNI/bHNI tiers
  reservation         jsonb not null default '[]'::jsonb,         -- category-wise reservation
  shares_offered      jsonb not null default '{}'::jsonb,         -- {qib,nii,retail}

  -- grey market premium (latest)
  gmp                 numeric(10,2),
  gmp_percent         numeric(8,2),
  gmp_kostak          text,
  gmp_subject_to_sauda text,
  gmp_expected_price  numeric(12,2),
  gmp_updated_at      timestamptz,

  -- subscription summary (latest, times)
  sub_total           numeric(10,2),
  sub_qib             numeric(10,2),
  sub_nii             numeric(10,2),
  sub_retail          numeric(10,2),
  sub_employee        numeric(10,2),
  sub_shareholder     numeric(10,2),
  sub_anchor          numeric(10,2),
  sub_applications    bigint,
  sub_updated_at      timestamptz,

  -- listing performance
  listing_price       numeric(12,2),
  listing_gain_percent numeric(8,2),
  cmp                 numeric(12,2),
  cmp_updated_at      timestamptz,
  current_gain_percent numeric(8,2),

  -- company (from detail document)
  about               text,
  description         text,
  strengths           text[] not null default '{}',
  risks               text[] not null default '{}',
  objectives          jsonb not null default '[]'::jsonb,         -- [{object, amount}]
  objectives_text     text,
  financials          jsonb not null default '{}'::jsonb,         -- {headers, rows, unit, text}
  kpis                jsonb not null default '[]'::jsonb,         -- [{key,label,value}]
  promoters_text      text,
  promoters           jsonb not null default '[]'::jsonb,
  pre_issue_holding   text,
  post_issue_holding  text,
  holding_pattern_desc text,

  -- contacts & intermediaries
  company_contact     jsonb not null default '{}'::jsonb,         -- {address, phone, email, website}
  registrar           jsonb not null default '{}'::jsonb,         -- {name, slug, logo, website, status_page, driver, ...}
  lead_managers       jsonb not null default '[]'::jsonb,
  documents           jsonb not null default '{}'::jsonb,         -- {rhp, drhp, anchor, boa}

  -- anchors summary
  anchor_total_count  integer,
  anchor_total_cr     numeric(14,2),
  anchor_mf_count     integer,

  raw_data            jsonb not null default '{}'::jsonb,         -- everything the API returned, untouched
  list_synced_at      timestamptz,
  detail_synced_at    timestamptz,
  subscription_synced_at timestamptz,
  gmp_history_synced_at timestamptz,
  anchors_synced_at   timestamptz,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index ipos_status_idx        on public.ipos (status);
create index ipos_board_idx         on public.ipos (board);
create index ipos_open_date_idx     on public.ipos (open_date desc nulls last);
create index ipos_close_date_idx    on public.ipos (close_date);
create index ipos_allotment_date_idx on public.ipos (allotment_date);
create index ipos_listing_date_idx  on public.ipos (listing_date desc nulls last);
create index ipos_name_trgm_idx     on public.ipos using gin (name extensions.gin_trgm_ops);

create trigger ipos_set_updated_at before update on public.ipos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_subscriptions — snapshots of the category tree, one row per category per snapshot
-- ---------------------------------------------------------------------------
create table public.ipo_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  ipo_id          uuid not null references public.ipos (id) on delete cascade,
  category_key    text not null,                 -- QIB / NII / RETAIL / EMPLOYEE / SHAREHOLDER / TOTAL / BNII / SNII / FII / MF ...
  parent_key      text not null default '',      -- '' for top-level categories
  label           text,
  times_subscribed numeric(12,2),
  shares_offered  bigint,
  shares_applied  bigint,
  applications    bigint,
  demand_crore    numeric(14,2),
  snapshot_time   timestamptz not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (ipo_id, parent_key, category_key, snapshot_time)
);
create index ipo_subscriptions_ipo_time_idx on public.ipo_subscriptions (ipo_id, snapshot_time desc);
create trigger ipo_subscriptions_set_updated_at before update on public.ipo_subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_gmp_history — one reading per day (that day's last reading)
-- ---------------------------------------------------------------------------
create table public.ipo_gmp_history (
  id              uuid primary key default gen_random_uuid(),
  ipo_id          uuid not null references public.ipos (id) on delete cascade,
  recorded_on     date not null,
  gmp             numeric(10,2),
  gmp_percent     numeric(8,2),
  expected_price  numeric(12,2),
  kostak          text,
  subject_to_sauda text,
  recorded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (ipo_id, recorded_on)
);
create index ipo_gmp_history_ipo_idx on public.ipo_gmp_history (ipo_id, recorded_on);
create trigger ipo_gmp_history_set_updated_at before update on public.ipo_gmp_history
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_financials — flattened financial table (₹ crore)
-- ---------------------------------------------------------------------------
create table public.ipo_financials (
  id              uuid primary key default gen_random_uuid(),
  ipo_id          uuid not null references public.ipos (id) on delete cascade,
  period          text not null,                  -- "31 Mar 2026"
  period_order    integer not null default 0,     -- 0 = most recent
  revenue         numeric(16,2),
  total_income    numeric(16,2),
  profit          numeric(16,2),
  net_worth       numeric(16,2),
  total_assets    numeric(16,2),
  total_borrowing numeric(16,2),
  reserves        numeric(16,2),
  ebitda          numeric(16,2),
  raw             jsonb not null default '{}'::jsonb,   -- every metric as published, keyed by metric name
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (ipo_id, period)
);
create index ipo_financials_ipo_idx on public.ipo_financials (ipo_id, period_order);
create trigger ipo_financials_set_updated_at before update on public.ipo_financials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_documents
-- ---------------------------------------------------------------------------
create table public.ipo_documents (
  id          uuid primary key default gen_random_uuid(),
  ipo_id      uuid not null references public.ipos (id) on delete cascade,
  kind        text not null,                      -- rhp / drhp / anchor / boa / other
  title       text not null,
  url         text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (ipo_id, kind)
);
create index ipo_documents_ipo_idx on public.ipo_documents (ipo_id);
create trigger ipo_documents_set_updated_at before update on public.ipo_documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_anchors — anchor book allocations
-- ---------------------------------------------------------------------------
create table public.ipo_anchors (
  id                uuid primary key default gen_random_uuid(),
  ipo_id            uuid not null references public.ipos (id) on delete cascade,
  name              text not null,
  group_entity      text,
  shares_allotted   bigint,
  amount_cr         numeric(14,2),
  pct_allocated     numeric(8,2),
  pct_of_issue      numeric(8,2),
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ipo_anchors_ipo_idx on public.ipo_anchors (ipo_id, position);
create trigger ipo_anchors_set_updated_at before update on public.ipo_anchors
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  display_name    text,
  avatar_url      text,
  email           text,
  is_anonymous    boolean not null default true,
  is_premium      boolean not null default false,
  premium_until   timestamptz,
  premium_product_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- device_tokens
-- ---------------------------------------------------------------------------
create table public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  fcm_token     text not null unique,
  platform      text not null default 'android' check (platform in ('android','ios','web')),
  device_name   text,
  app_version   text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);
create index device_tokens_last_seen_idx on public.device_tokens (last_seen_at);
create trigger device_tokens_set_updated_at before update on public.device_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  new_ipo                boolean not null default true,
  opens_today            boolean not null default true,
  closes_today           boolean not null default true,
  closing_soon           boolean not null default true,
  allotment              boolean not null default true,
  refund_demat           boolean not null default true,
  listing                boolean not null default true,
  subscription_milestone boolean not null default true,
  gmp_change             boolean not null default true,
  only_watchlist         boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- watchlist
-- ---------------------------------------------------------------------------
create table public.watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  ipo_id      uuid not null references public.ipos (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, ipo_id)
);
create index watchlist_user_idx on public.watchlist (user_id);
create index watchlist_ipo_idx on public.watchlist (ipo_id);
create trigger watchlist_set_updated_at before update on public.watchlist
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_log — dedupe + audit (service role only)
-- ---------------------------------------------------------------------------
create table public.notification_log (
  id               uuid primary key default gen_random_uuid(),
  ipo_id           uuid references public.ipos (id) on delete set null,
  type             text not null,
  dedupe_key       text not null unique,
  title            text not null,
  body             text not null,
  data             jsonb not null default '{}'::jsonb,
  recipients_count integer not null default 0,
  success_count    integer not null default 0,
  failure_count    integer not null default 0,
  status           text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  error            text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index notification_log_ipo_idx on public.notification_log (ipo_id, created_at desc);
create index notification_log_type_idx on public.notification_log (type, created_at desc);
create trigger notification_log_set_updated_at before update on public.notification_log
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sync_runs — observability for the sync-ipos function (service role only)
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean,
  api_calls     integer not null default 0,
  ipos_upserted integer not null default 0,
  events        jsonb not null default '[]'::jsonb,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);
create trigger sync_runs_set_updated_at before update on public.sync_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- purchases — Play Billing receipts verified server-side
-- ---------------------------------------------------------------------------
create table public.purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  platform        text not null default 'android',
  product_id      text not null,
  purchase_token  text not null unique,
  order_id        text,
  status          text not null default 'pending',
  expires_at      timestamptz,
  auto_renewing   boolean,
  raw             jsonb not null default '{}'::jsonb,
  verified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index purchases_user_idx on public.purchases (user_id);
create trigger purchases_set_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auth.users → profile + default preferences
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

  return new;
end;
$$;

create or replace function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email        = new.email,
         is_anonymous = coalesce(new.is_anonymous, false),
         display_name = coalesce(display_name, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
         avatar_url   = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_updated
  after update of email, is_anonymous, raw_user_meta_data on auth.users
  for each row execute function private.handle_user_updated();

-- ---------------------------------------------------------------------------
-- watchlist limit: 50 IPOs per account
-- ---------------------------------------------------------------------------
create or replace function public.enforce_watchlist_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count   integer;
  v_premium boolean;
begin
  select coalesce(p.is_premium and (p.premium_until is null or p.premium_until > now()), false)
    into v_premium
    from public.profiles p where p.id = new.user_id;

  if coalesce(v_premium, false) then
    return new;
  end if;

  select count(*) into v_count from public.watchlist where user_id = new.user_id;
  if v_count >= 50 then
    raise exception 'WATCHLIST_LIMIT' using hint = 'You can watch up to 50 IPOs.';
  end if;
  return new;
end;
$$;

create trigger watchlist_enforce_limit before insert on public.watchlist
  for each row execute function public.enforce_watchlist_limit();

-- ---------------------------------------------------------------------------
-- Latest subscription snapshot per IPO (security invoker, public SELECT)
-- ---------------------------------------------------------------------------
create or replace view public.ipo_subscription_latest
with (security_invoker = true) as
select s.*
from public.ipo_subscriptions s
join (
  select ipo_id, max(snapshot_time) as snapshot_time
  from public.ipo_subscriptions
  group by ipo_id
) latest on latest.ipo_id = s.ipo_id and latest.snapshot_time = s.snapshot_time;

-- ---------------------------------------------------------------------------
-- Listing performance stats (for the "Past IPO performance" screen)
-- ---------------------------------------------------------------------------
create or replace function public.get_listing_stats(p_board text default null, p_months integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with listed as (
    select *
    from public.ipos
    where status = 'listed'
      and listing_price is not null
      and issue_price is not null
      and (p_board is null or board = p_board)
      and (p_months is null or p_months <= 0 or listing_date >= (current_date - (p_months || ' months')::interval))
  )
  select jsonb_build_object(
    'count',            count(*),
    'avg_listing_gain', round(avg(listing_gain_percent), 2),
    'median_listing_gain', round(percentile_cont(0.5) within group (order by listing_gain_percent)::numeric, 2),
    'positive_count',   count(*) filter (where listing_gain_percent > 0),
    'negative_count',   count(*) filter (where listing_gain_percent < 0),
    'flat_count',       count(*) filter (where listing_gain_percent = 0),
    'best',             (select jsonb_build_object('slug', slug, 'name', name, 'gain', listing_gain_percent) from listed order by listing_gain_percent desc nulls last limit 1),
    'worst',            (select jsonb_build_object('slug', slug, 'name', name, 'gain', listing_gain_percent) from listed order by listing_gain_percent asc nulls last limit 1),
    'avg_current_gain', round(avg(current_gain_percent), 2),
    'total_raised_cr',  round(sum(issue_size_cr), 2)
  )
  from listed;
$$;

-- ---------------------------------------------------------------------------
-- Notification recipients (service role only — lives in `private`)
-- ---------------------------------------------------------------------------
create or replace function private.notification_recipients(p_type text, p_ipo_id uuid)
returns table (user_id uuid, fcm_token text, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  select dt.user_id, dt.fcm_token, dt.platform
  from public.device_tokens dt
  join public.notification_preferences np on np.user_id = dt.user_id
  left join public.profiles p on p.id = dt.user_id
  where dt.last_seen_at > now() - interval '120 days'
    and case p_type
          when 'new_ipo'                then np.new_ipo
          when 'opens_today'            then np.opens_today
          when 'closes_today'           then np.closes_today
          when 'closing_soon'           then np.closing_soon
          when 'allotment'              then np.allotment
          when 'allotment_tomorrow'     then np.allotment
          when 'allotment_result'       then np.allotment
          when 'refund'                 then np.refund_demat
          when 'demat_credit'           then np.refund_demat
          when 'listing_today'          then np.listing
          when 'listing_tomorrow'       then np.listing
          when 'listed'                 then np.listing
          when 'subscription_milestone' then np.subscription_milestone
          when 'gmp_change'             then np.gmp_change
          else true
        end
    -- only-watchlist mode, and GMP alerts are always watchlist-scoped
    and (
      p_ipo_id is null
      or (not np.only_watchlist and p_type <> 'gmp_change')
      or exists (select 1 from public.watchlist w where w.user_id = dt.user_id and w.ipo_id = p_ipo_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Grants (tables are in `public`, which is exposed to the Data API)
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on public.ipos, public.ipo_subscriptions, public.ipo_gmp_history,
                public.ipo_financials, public.ipo_documents, public.ipo_anchors,
                public.ipo_subscription_latest
  to anon, authenticated;

grant select, insert, update, delete on public.profiles, public.device_tokens,
                public.notification_preferences, public.watchlist
  to authenticated;

grant select on public.purchases to authenticated;

revoke all on public.notification_log, public.sync_runs from anon, authenticated;

grant execute on function public.get_listing_stats(text, integer) to anon, authenticated;
revoke execute on function public.enforce_watchlist_limit() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ipos                     enable row level security;
alter table public.ipo_subscriptions        enable row level security;
alter table public.ipo_gmp_history          enable row level security;
alter table public.ipo_financials           enable row level security;
alter table public.ipo_documents            enable row level security;
alter table public.ipo_anchors              enable row level security;
alter table public.profiles                 enable row level security;
alter table public.device_tokens            enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.watchlist                enable row level security;
alter table public.notification_log         enable row level security;
alter table public.sync_runs                enable row level security;
alter table public.purchases                enable row level security;

-- public market data: anyone can read, nobody but the service role writes
create policy "ipos are public"              on public.ipos              for select to anon, authenticated using (true);
create policy "subscriptions are public"     on public.ipo_subscriptions for select to anon, authenticated using (true);
create policy "gmp history is public"        on public.ipo_gmp_history   for select to anon, authenticated using (true);
create policy "financials are public"        on public.ipo_financials    for select to anon, authenticated using (true);
create policy "documents are public"         on public.ipo_documents     for select to anon, authenticated using (true);
create policy "anchors are public"           on public.ipo_anchors       for select to anon, authenticated using (true);

-- profiles: own row only. is_premium/premium_until are protected by a trigger below.
create policy "profiles: read own"   on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "device_tokens: own" on public.device_tokens for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "notification_preferences: own" on public.notification_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "watchlist: own" on public.watchlist for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "purchases: read own" on public.purchases for select to authenticated
  using ((select auth.uid()) = user_id);

-- notification_log and sync_runs: no client policies at all (service role bypasses RLS)

-- clients may edit their profile but never their premium flags
create or replace function public.protect_premium_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated' then
    new.is_premium         := old.is_premium;
    new.premium_until      := old.premium_until;
    new.premium_product_id := old.premium_product_id;
    new.is_anonymous       := old.is_anonymous;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_premium_columns() from public, anon, authenticated;

create trigger profiles_protect_premium before update on public.profiles
  for each row execute function public.protect_premium_columns();

-- ---------------------------------------------------------------------------
-- Realtime: live subscription & GMP updates on the detail screen
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.ipos;
alter publication supabase_realtime add table public.ipo_subscriptions;
alter publication supabase_realtime add table public.ipo_gmp_history;

-- Service-role-only RPC wrapper (the `private` schema is not exposed through the Data API,
-- so Edge Functions call this public wrapper; anon/authenticated cannot execute it).
create or replace function public.notification_recipients(p_type text, p_ipo_id uuid)
returns table (user_id uuid, fcm_token text, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.notification_recipients(p_type, p_ipo_id);
$$;
revoke execute on function public.notification_recipients(text, uuid) from public, anon, authenticated;
grant execute on function public.notification_recipients(text, uuid) to service_role;
