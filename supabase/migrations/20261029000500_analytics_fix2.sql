-- Analytics fix 2 (29 Oct 2026): hour-of-day grouping used an aggregate in GROUP BY.
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
        select jsonb_build_object('hour', h.hour, 'events', h.events) as x
        from (select extract(hour from created_at at time zone 'Asia/Kolkata')::int as hour, count(*) as events from ev group by 1) h) s)
  ) into r;
  return r;
end;
$$;
