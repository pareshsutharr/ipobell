-- Analytics (29 Oct 2026): audience filter on overview/daily; per-user tool journeys (drop-offs).
drop function if exists public.analytics_overview(timestamptz, timestamptz);
drop function if exists public.analytics_daily(timestamptz, timestamptz);
create or replace function public.analytics_overview(p_from timestamptz, p_to timestamptz, p_audience text default null)
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
       and (p_audience is null or p_audience = '' or coalesce(ua.audience, 'unknown') = p_audience)
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
grant execute on function public.analytics_overview(timestamptz, timestamptz, text) to authenticated;

create or replace function public.analytics_daily(p_from timestamptz, p_to timestamptz, p_audience text default null)
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
     where e.created_at >= p_from and e.created_at < p_to
       and (p_audience is null or p_audience = '' or coalesce(ua.audience, 'unknown') = p_audience))
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
grant execute on function public.analytics_daily(timestamptz, timestamptz, text) to authenticated;

-- Per person × tool: started / completed / submitted, with the last result they saw and contact details.
-- Lets the team find people who began a tool and stopped, or finished it without sending their details.
create or replace function public.analytics_tool_journeys(
  p_from timestamptz, p_to timestamptz,
  p_tool text default null, p_stage text default null, p_audience text default null, p_limit integer default 500)
returns table (
  user_id uuid, display_name text, email text, phone text, company_name text, audience text, is_anonymous boolean,
  tool text, first_started timestamptz, last_activity timestamptz, starts bigint,
  completed boolean, completed_at timestamptz, result jsonb,
  lead_submitted boolean, lead_at timestamptz, lead_id uuid, stage text,
  last_screen text, platform text, app_version text
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
     where e.created_at >= p_from and e.created_at < p_to
       and e.event in ('tool_start', 'tool_complete', 'lead_submit', 'screen_view')
       and (p_audience is null or p_audience = '' or coalesce(ua.audience, 'unknown') = p_audience)),
  per as (
    select ev.user_id, ev.props ->> 'tool' as tool,
           max(ev.audience) as audience,
           min(ev.created_at) filter (where ev.event = 'tool_start') as first_started,
           max(ev.created_at) as last_activity,
           count(*) filter (where ev.event = 'tool_start') as starts,
           bool_or(ev.event = 'tool_complete') as completed,
           max(ev.created_at) filter (where ev.event = 'tool_complete') as completed_at,
           (array_agg(ev.props order by ev.created_at desc) filter (where ev.event = 'tool_complete'))[1] as result,
           bool_or(ev.event = 'lead_submit') as lead_event,
           max(ev.created_at) filter (where ev.event = 'lead_submit') as lead_event_at,
           max(ev.platform) as platform, max(ev.app_version) as app_version
      from ev where ev.props ? 'tool' and ev.event in ('tool_start','tool_complete','lead_submit')
     group by ev.user_id, ev.props ->> 'tool'),
  leads as (
    select bl.user_id,
           case bl.source when 'readiness-tool' then 'readiness' when 'eligibility-check' then 'eligibility'
                          when 'issue-size-calculator' then 'issue_size' when 'issue-cost-estimator' then 'issue_cost'
                          when 'sme-ipo-checklist' then 'checklist' else 'book_call' end as tool,
           max(bl.created_at) as lead_at, (array_agg(bl.id order by bl.created_at desc))[1] as lead_id,
           max(bl.phone) as phone, max(bl.company_name) as company_name, max(bl.email) as email
      from public.business_leads bl
     where bl.user_id is not null and bl.created_at >= p_from and bl.created_at < p_to + interval '1 day'
     group by bl.user_id, 2),
  last_scr as (
    select ev.user_id, (array_agg(coalesce(ev.screen, ev.props ->> 'path') order by ev.created_at desc))[1] as last_screen
      from ev where ev.event = 'screen_view' group by ev.user_id)
  select per.user_id, p.display_name, coalesce(p.email, l.email) as email, coalesce(p.phone, l.phone) as phone,
         coalesce(p.company_name, l.company_name) as company_name, per.audience, coalesce(p.is_anonymous, true) as is_anonymous,
         per.tool, per.first_started, per.last_activity, per.starts,
         per.completed, per.completed_at, coalesce(per.result, '{}'::jsonb) as result,
         (per.lead_event or l.lead_id is not null) as lead_submitted, coalesce(l.lead_at, per.lead_event_at) as lead_at, l.lead_id,
         case when (per.lead_event or l.lead_id is not null) then 'submitted' when per.completed then 'completed' else 'started' end as stage,
         ls.last_screen, per.platform, per.app_version
    from per
    left join public.profiles p on p.id = per.user_id
    left join leads l on l.user_id = per.user_id and l.tool = per.tool
    left join last_scr ls on ls.user_id = per.user_id
   where (p_tool is null or p_tool = '' or per.tool = p_tool)
     and (p_stage is null or p_stage = ''
          or (p_stage = 'started'   and not per.completed and not (per.lead_event or l.lead_id is not null))
          or (p_stage = 'completed' and per.completed and not (per.lead_event or l.lead_id is not null))
          or (p_stage = 'submitted' and (per.lead_event or l.lead_id is not null))
          or (p_stage = 'not_submitted' and not (per.lead_event or l.lead_id is not null)))
   order by per.last_activity desc
   limit least(coalesce(p_limit, 500), 2000);
end;
$$;
grant execute on function public.analytics_tool_journeys(timestamptz, timestamptz, text, text, text, integer) to authenticated;
