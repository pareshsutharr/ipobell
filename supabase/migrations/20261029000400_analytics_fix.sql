-- Analytics fixes (29 Oct 2026): top_ipos subquery grouping error; audience resolved per user
-- (profile role, else the role most often reported by the device) instead of per event.
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

  with user_aud as (
    select u.user_id, coalesce(p.role, u.ev_role, 'unknown') as audience
      from (select e.user_id, mode() within group (order by e.role) filter (where e.role is not null) as ev_role
              from public.analytics_events e where e.created_at >= p_from and e.created_at < p_to group by e.user_id) u
      left join public.profiles p on p.id = u.user_id),
  ev as (
    select e.*, coalesce(ua.audience, 'unknown') as audience
      from public.analytics_events e
      left join user_aud ua on ua.user_id = e.user_id
     where e.created_at >= p_from and e.created_at < p_to
  ),
  firsts as (
    select user_id, min(created_at) as first_seen from public.analytics_events group by user_id
  ),
  wl as (
    select props ->> 'slug' as slug, count(*) as n from ev where event = 'watchlist' and props ->> 'action' = 'add' group by 1
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
        select jsonb_build_object('slug', i.slug, 'name', i.name, 'board', i.board,
          'views', i.views, 'users', i.users, 'business_views', i.business_views,
          'watchlist_adds', coalesce(wl.n, 0)) as x
        from (select props ->> 'slug' as slug, max(props ->> 'name') as name, max(props ->> 'board') as board,
                     count(*) as views, count(distinct user_id) as users, count(*) filter (where perspective = 'business') as business_views
                from ev where event = 'ipo_view' and props ? 'slug' group by props ->> 'slug' order by count(*) desc limit 25) i
        left join wl on wl.slug = i.slug) s),
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
  user_aud as (
    select u.user_id, coalesce(p.role, u.ev_role, 'unknown') as audience
      from (select e.user_id, mode() within group (order by e.role) filter (where e.role is not null) as ev_role
              from public.analytics_events e where e.created_at >= p_from and e.created_at < p_to group by e.user_id) u
      left join public.profiles p on p.id = u.user_id),
  ev as (
    select e.*, coalesce(ua.audience, 'unknown') as audience, (e.created_at at time zone 'Asia/Kolkata')::date as d
      from public.analytics_events e left join user_aud ua on ua.user_id = e.user_id
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
  with user_aud as (
    select u.user_id, coalesce(p.role, u.ev_role, 'unknown') as audience
      from (select e.user_id, mode() within group (order by e.role) filter (where e.role is not null) as ev_role
              from public.analytics_events e where e.created_at >= p_from and e.created_at < p_to group by e.user_id) u
      left join public.profiles p on p.id = u.user_id),
  ev as (
    select e.*, coalesce(ua.audience, 'unknown') as audience
      from public.analytics_events e left join user_aud ua on ua.user_id = e.user_id
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
