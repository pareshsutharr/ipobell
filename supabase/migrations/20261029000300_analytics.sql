-- Product analytics (29 Oct 2026).
-- The app batches events into public.analytics_events through track_events(); staff read aggregates in the
-- admin panel through the analytics_* RPCs (admin-only). Nothing here is exposed to ordinary users.
--
-- Event taxonomy (app/src/lib/analytics/index.ts is the source of truth; keep in sync):
--   app_open {cold}                      screen_view {path, params}             sign_in {method}
--   role_selected {role}                 perspective_switch {to}                ipo_view {slug, name, board, status}
--   insight_view {slug, ipo_id, verdict} latest_insight_tap {slug}              watchlist {action, slug}
--   search {query, results}              tool_start {tool}                      tool_complete {tool, …summary}
--   lead_submit {source, has_phone, has_email}                                  external_link {url, host, label}
--   share {slug}  calendar_add {slug}    allotment_check {slug, registrar}      notification_pref {key, value}
--   push_open {type, slug}
-- Tools: readiness | eligibility | issue_size | issue_cost | checklist | book_call

create table if not exists public.analytics_events (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users (id) on delete set null,
  device_id    text,
  session_id   text,
  event        text not null,
  screen       text,
  props        jsonb not null default '{}'::jsonb,
  role         text,
  perspective  text,
  platform     text,
  app_version  text,
  client_ts    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_events_user_idx    on public.analytics_events (user_id, created_at desc);
create index if not exists analytics_events_event_idx   on public.analytics_events (event, created_at desc);
create index if not exists analytics_events_device_idx  on public.analytics_events (device_id, created_at desc);
create index if not exists analytics_events_slug_idx    on public.analytics_events ((props ->> 'slug')) where props ? 'slug';

alter table public.analytics_events enable row level security;
create policy "analytics: admins read" on public.analytics_events for select to authenticated using (public.is_admin());
grant select on public.analytics_events to authenticated;
-- inserts only through the RPC below (no insert grant)

-- ---------------------------------------------------------------------------
-- Ingest: batched, validated, rate-limited. Called by the app with the user's JWT.
-- ---------------------------------------------------------------------------
create or replace function public.track_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_count  integer;
  v_recent integer;
  v_now    timestamptz := now();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;
  v_count := jsonb_array_length(p_events);
  if v_count = 0 then return 0; end if;
  if v_count > 100 then
    raise exception 'BATCH_TOO_LARGE' using hint = 'Send at most 100 events per call';
  end if;

  select count(*) into v_recent from public.analytics_events
   where user_id = v_uid and created_at > v_now - interval '1 hour';
  if v_recent > 3000 then
    return 0; -- silently drop: a runaway client, not a reason to error in the app
  end if;

  insert into public.analytics_events (user_id, device_id, session_id, event, screen, props, role, perspective, platform, app_version, client_ts)
  select
    v_uid,
    left(e ->> 'device_id', 64),
    left(e ->> 'session_id', 64),
    left(e ->> 'event', 64),
    left(e ->> 'screen', 200),
    case when jsonb_typeof(e -> 'props') = 'object' then e -> 'props' else '{}'::jsonb end,
    left(e ->> 'role', 20),
    left(e ->> 'perspective', 20),
    left(e ->> 'platform', 20),
    left(e ->> 'app_version', 32),
    nullif(e ->> 'ts', '')::timestamptz
  from jsonb_array_elements(p_events) as e
  where coalesce(e ->> 'event', '') <> ''
    and pg_column_size(e) < 8192;

  return v_count;
end;
$$;
grant execute on function public.track_events(jsonb) to authenticated;
revoke execute on function public.track_events(jsonb) from anon;

-- ---------------------------------------------------------------------------
-- Read side (admin only). Each function raises when the caller is not an admin.
-- ---------------------------------------------------------------------------
create or replace function private.require_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
end;
$$;

-- Audience of a user: their declared role, else 'unknown'
create or replace view public.analytics_audience
with (security_invoker = true) as
  select e.id as event_id, coalesce(e.role, p.role, 'unknown') as audience
    from public.analytics_events e
    left join public.profiles p on p.id = e.user_id;

create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := '{}'::jsonb;
begin
  perform private.require_admin();

  with ev as (
    select e.*, coalesce(e.role, p.role, 'unknown') as audience
      from public.analytics_events e
      left join public.profiles p on p.id = e.user_id
     where e.created_at >= p_from and e.created_at < p_to
  ),
  firsts as (
    select user_id, min(created_at) as first_seen from public.analytics_events group by user_id
  )
  select jsonb_build_object(
    'totals', (select jsonb_build_object(
        'users',            count(distinct user_id),
        'new_users',        count(distinct user_id) filter (where user_id in (select user_id from firsts where first_seen >= p_from)),
        'sessions',         count(distinct session_id),
        'events',           count(*),
        'screen_views',     count(*) filter (where event = 'screen_view'),
        'ipo_views',        count(*) filter (where event = 'ipo_view'),
        'insight_views',    count(*) filter (where event = 'insight_view'),
        'tool_starts',      count(*) filter (where event = 'tool_start'),
        'tool_completions', count(*) filter (where event = 'tool_complete'),
        'leads',            count(*) filter (where event = 'lead_submit'),
        'external_links',   count(*) filter (where event = 'external_link'),
        'watchlist_adds',   count(*) filter (where event = 'watchlist' and props ->> 'action' = 'add'),
        'searches',         count(*) filter (where event = 'search')
      ) from ev),
    'by_audience', (select coalesce(jsonb_agg(x order by x -> 'users' desc), '[]'::jsonb) from (
        select jsonb_build_object('audience', audience,
          'users', count(distinct user_id), 'sessions', count(distinct session_id), 'events', count(*),
          'ipo_views', count(*) filter (where event = 'ipo_view'),
          'tool_completions', count(*) filter (where event = 'tool_complete'),
          'leads', count(*) filter (where event = 'lead_submit')) as x
        from ev group by audience) s),
    'by_perspective', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('perspective', coalesce(perspective, 'unknown'), 'screen_views', count(*) filter (where event = 'screen_view'), 'users', count(distinct user_id)) as x
        from ev group by perspective) s),
    'top_screens', (select coalesce(jsonb_agg(x order by (x ->> 'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('screen', coalesce(screen, props ->> 'path', '?'), 'views', count(*), 'users', count(distinct user_id)) as x
        from ev where event = 'screen_view' group by coalesce(screen, props ->> 'path', '?') order by count(*) desc limit 25) s),
    'top_ipos', (select coalesce(jsonb_agg(x order by (x ->> 'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('slug', props ->> 'slug', 'name', max(props ->> 'name'), 'board', max(props ->> 'board'),
          'views', count(*), 'users', count(distinct user_id),
          'business_views', count(*) filter (where perspective = 'business'),
          'watchlist_adds', (select count(*) from ev w where w.event = 'watchlist' and w.props ->> 'action' = 'add' and w.props ->> 'slug' = ev.props ->> 'slug')) as x
        from ev where event = 'ipo_view' and props ? 'slug' group by props ->> 'slug' order by count(*) desc limit 25) s),
    'top_insights', (select coalesce(jsonb_agg(x order by (x ->> 'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('slug', props ->> 'slug', 'views', count(*), 'users', count(distinct user_id)) as x
        from ev where event = 'insight_view' group by props ->> 'slug' order by count(*) desc limit 15) s),
    'top_events', (select coalesce(jsonb_agg(x order by (x ->> 'count')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('event', event, 'count', count(*), 'users', count(distinct user_id)) as x
        from ev group by event order by count(*) desc limit 40) s),
    'tools', (select coalesce(jsonb_agg(x order by (x ->> 'started')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('tool', t.tool,
          'started',   (select count(distinct session_id) from ev where event = 'tool_start'    and props ->> 'tool' = t.tool),
          'completed', (select count(distinct session_id) from ev where event = 'tool_complete' and props ->> 'tool' = t.tool),
          'leads',     (select count(*) from ev where event = 'lead_submit' and props ->> 'tool' = t.tool),
          'users',     (select count(distinct user_id) from ev where event in ('tool_start','tool_complete') and props ->> 'tool' = t.tool)) as x
        from (values ('readiness'),('eligibility'),('issue_size'),('issue_cost'),('checklist'),('book_call')) as t(tool)) s),
    'readiness_bands', (select coalesce(jsonb_agg(x order by (x ->> 'count')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('band', props ->> 'band', 'count', count(*), 'avg_percent', round(avg((props ->> 'percent')::numeric), 1)) as x
        from ev where event = 'tool_complete' and props ->> 'tool' = 'readiness' group by props ->> 'band') s),
    'eligibility_outcomes', (select coalesce(jsonb_agg(x order by (x ->> 'count')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('recommended', coalesce(props ->> 'recommended', 'none'), 'count', count(*)) as x
        from ev where event = 'tool_complete' and props ->> 'tool' = 'eligibility' group by props ->> 'recommended') s),
    'external_links', (select coalesce(jsonb_agg(x order by (x ->> 'clicks')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('label', coalesce(props ->> 'label', props ->> 'host', props ->> 'url'), 'url', max(props ->> 'url'), 'clicks', count(*), 'users', count(distinct user_id)) as x
        from ev where event = 'external_link' group by coalesce(props ->> 'label', props ->> 'host', props ->> 'url') order by count(*) desc limit 25) s),
    'searches', (select coalesce(jsonb_agg(x order by (x ->> 'count')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('query', lower(props ->> 'query'), 'count', count(*)) as x
        from ev where event = 'search' and length(coalesce(props ->> 'query','')) >= 2 group by lower(props ->> 'query') order by count(*) desc limit 20) s),
    'sign_in_methods', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('method', props ->> 'method', 'users', count(distinct user_id)) as x
        from ev where event = 'sign_in' group by props ->> 'method') s),
    'platforms', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object('platform', coalesce(platform, 'unknown'), 'users', count(distinct user_id)) as x
        from ev group by platform) s),
    'app_versions', (select coalesce(jsonb_agg(x order by (x ->> 'users')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('version', coalesce(app_version, 'unknown'), 'users', count(distinct user_id)) as x
        from ev group by app_version) s),
    'hours', (select coalesce(jsonb_agg(x order by (x ->> 'hour')::int), '[]'::jsonb) from (
        select jsonb_build_object('hour', extract(hour from created_at at time zone 'Asia/Kolkata')::int, 'events', count(*)) as x
        from ev group by 1) s)
  ) into r;
  return r;
end;
$$;
grant execute on function public.analytics_overview(timestamptz, timestamptz) to authenticated;

create or replace function public.analytics_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, users bigint, new_users bigint, sessions bigint, events bigint, screen_views bigint, ipo_views bigint, tool_completions bigint, leads bigint, business_users bigint, investor_users bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  with firsts as (select user_id, min(created_at) as first_seen from public.analytics_events group by user_id),
  ev as (
    select e.*, coalesce(e.role, p.role, 'unknown') as audience, (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.analytics_events e left join public.profiles p on p.id = e.user_id
     where e.created_at >= p_from and e.created_at < p_to)
  select d,
         count(distinct user_id),
         count(distinct user_id) filter (where user_id in (select f.user_id from firsts f where (f.first_seen at time zone 'Asia/Kolkata')::date = ev.d)),
         count(distinct session_id),
         count(*),
         count(*) filter (where event = 'screen_view'),
         count(*) filter (where event = 'ipo_view'),
         count(*) filter (where event = 'tool_complete'),
         count(*) filter (where event = 'lead_submit'),
         count(distinct user_id) filter (where audience = 'business'),
         count(distinct user_id) filter (where audience = 'investor')
    from ev group by d order by d;
end;
$$;
grant execute on function public.analytics_daily(timestamptz, timestamptz) to authenticated;

create or replace function public.analytics_users(p_from timestamptz, p_to timestamptz, p_audience text default null, p_search text default null, p_limit integer default 200)
returns table (
  user_id uuid, device_id text, display_name text, email text, phone text, company_name text, city text,
  audience text, is_anonymous boolean, first_seen timestamptz, last_seen timestamptz,
  sessions bigint, events bigint, screen_views bigint, ipo_views bigint, insight_views bigint,
  tools_used text[], tool_completions bigint, leads bigint, external_links bigint, watchlist_adds bigint,
  last_screen text, last_perspective text, platform text, app_version text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  with ev as (
    select e.*, coalesce(e.role, p.role, 'unknown') as audience
      from public.analytics_events e left join public.profiles p on p.id = e.user_id
     where e.created_at >= p_from and e.created_at < p_to),
  agg as (
    select ev.user_id,
           max(ev.device_id) as device_id,
           max(ev.audience) as audience,
           min(ev.created_at) as first_in_range,
           max(ev.created_at) as last_seen,
           count(distinct ev.session_id) as sessions,
           count(*) as events,
           count(*) filter (where ev.event = 'screen_view') as screen_views,
           count(*) filter (where ev.event = 'ipo_view') as ipo_views,
           count(*) filter (where ev.event = 'insight_view') as insight_views,
           array_remove(array_agg(distinct ev.props ->> 'tool') filter (where ev.event in ('tool_start','tool_complete')), null) as tools_used,
           count(*) filter (where ev.event = 'tool_complete') as tool_completions,
           count(*) filter (where ev.event = 'lead_submit') as leads,
           count(*) filter (where ev.event = 'external_link') as external_links,
           count(*) filter (where ev.event = 'watchlist' and ev.props ->> 'action' = 'add') as watchlist_adds,
           (array_agg(coalesce(ev.screen, ev.props ->> 'path') order by ev.created_at desc) filter (where ev.event = 'screen_view'))[1] as last_screen,
           (array_agg(ev.perspective order by ev.created_at desc))[1] as last_perspective,
           max(ev.platform) as platform,
           max(ev.app_version) as app_version
      from ev group by ev.user_id)
  select a.user_id, a.device_id, p.display_name, p.email, coalesce(p.phone, l.phone) as phone, coalesce(p.company_name, l.company_name) as company_name, p.city,
         a.audience, coalesce(p.is_anonymous, true) as is_anonymous,
         (select min(created_at) from public.analytics_events f where f.user_id = a.user_id) as first_seen,
         a.last_seen, a.sessions, a.events, a.screen_views, a.ipo_views, a.insight_views,
         a.tools_used, a.tool_completions, a.leads, a.external_links, a.watchlist_adds,
         a.last_screen, a.last_perspective, a.platform, a.app_version
    from agg a
    left join public.profiles p on p.id = a.user_id
    left join lateral (select bl.phone, bl.company_name from public.business_leads bl where bl.user_id = a.user_id order by bl.created_at desc limit 1) l on true
   where (p_audience is null or a.audience = p_audience)
     and (p_search is null or p_search = '' or p.display_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%' or l.company_name ilike '%' || p_search || '%' or l.phone ilike '%' || p_search || '%')
   order by a.last_seen desc
   limit least(coalesce(p_limit, 200), 1000);
end;
$$;
grant execute on function public.analytics_users(timestamptz, timestamptz, text, text, integer) to authenticated;

create or replace function public.analytics_user_events(p_user_id uuid, p_limit integer default 300)
returns table (id bigint, created_at timestamptz, session_id text, event text, screen text, props jsonb, perspective text, platform text, app_version text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select e.id, e.created_at, e.session_id, e.event, e.screen, e.props, e.perspective, e.platform, e.app_version
    from public.analytics_events e
   where e.user_id = p_user_id
   order by e.created_at desc
   limit least(coalesce(p_limit, 300), 2000);
end;
$$;
grant execute on function public.analytics_user_events(uuid, integer) to authenticated;

-- Housekeeping: keep 18 months of raw events.
create or replace function private.prune_analytics_events()
returns void language sql security definer set search_path = '' as $$
  delete from public.analytics_events where created_at < now() - interval '18 months';
$$;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ipobell-prune-analytics';
    perform cron.schedule('ipobell-prune-analytics', '30 21 * * 0', $cron$ select private.prune_analytics_events(); $cron$);
  end if;
end $$;

comment on table public.analytics_events is 'App product analytics (screen views, IPO views, tool usage, leads, link clicks). Read in the admin panel → Analytics.';
