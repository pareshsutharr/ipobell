-- App error reporting (14 Nov 2026).
-- The app sends JavaScript errors (uncaught errors, screens that failed to render, errors reported by hand) to
-- public.report_errors(); staff read them in the admin panel → Errors. Same pattern as analytics: inserts only
-- through a security-definer RPC that validates, truncates and rate-limits; admins read; old rows are pruned.
--
-- Not covered: crashes in native code before JavaScript starts. Those need a native crash SDK.

create table if not exists public.app_errors (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete set null,
  fingerprint  text not null,                 -- same error on many phones → same fingerprint
  fatal        boolean not null default false,
  kind         text not null default 'error' check (kind in ('uncaught','render','handled','error')),
  message      text not null,
  stack        text,
  screen       text,
  context      jsonb not null default '{}'::jsonb,
  platform     text,
  app_version  text,
  device_id    text,
  client_ts    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);
create index if not exists app_errors_user_idx on public.app_errors (user_id, created_at desc);

alter table public.app_errors enable row level security;
drop policy if exists "app_errors: admins read" on public.app_errors;
create policy "app_errors: admins read" on public.app_errors for select to authenticated using (public.is_admin());
revoke all on public.app_errors from anon, authenticated;
grant select on public.app_errors to authenticated;   -- narrowed to admins by the policy above

-- Ingest. Called by the app with the user's JWT (guest accounts included).
create or replace function public.report_errors(p_errors jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_recent integer;
  v_room   integer;
  v_count  integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_errors is null or jsonb_typeof(p_errors) <> 'array' then return 0; end if;
  if jsonb_array_length(p_errors) > 20 then
    raise exception 'BATCH_TOO_LARGE' using hint = 'Send at most 20 errors per call';
  end if;

  -- 60 per user per hour: an error loop on one phone must not fill the table
  select count(*) into v_recent from public.app_errors where user_id = v_uid and created_at > now() - interval '1 hour';
  v_room := greatest(0, 60 - v_recent);
  if v_room = 0 then return 0; end if;

  with incoming as (
    select e, ord from jsonb_array_elements(p_errors) with ordinality as t(e, ord)
     where jsonb_typeof(e) = 'object' and coalesce(btrim(e ->> 'message'), '') <> ''
     order by ord
     limit v_room
  ), ins as (
    insert into public.app_errors (user_id, fingerprint, fatal, kind, message, stack, screen, context, platform, app_version, device_id, client_ts)
    select
      v_uid,
      left(coalesce(nullif(e ->> 'fingerprint', ''), md5(left(e ->> 'message', 300))), 64),
      coalesce((e ->> 'fatal') = 'true', false),
      case when e ->> 'kind' in ('uncaught','render','handled') then e ->> 'kind' else 'error' end,
      left(e ->> 'message', 1000),
      left(e ->> 'stack', 6000),
      left(e ->> 'screen', 200),
      case when jsonb_typeof(e -> 'context') = 'object' and pg_column_size(e -> 'context') < 4096 then e -> 'context' else '{}'::jsonb end,
      left(e ->> 'platform', 20),
      left(e ->> 'app_version', 32),
      left(e ->> 'device_id', 64),
      case when (e ->> 'ts') ~ '^\d{4}-\d{2}-\d{2}T' then (e ->> 'ts')::timestamptz else null end
    from incoming
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;
revoke execute on function public.report_errors(jsonb) from public, anon;
grant execute on function public.report_errors(jsonb) to authenticated;

-- Admin view: one line per distinct error.
create or replace function public.app_error_groups(p_since timestamptz default now() - interval '7 days', p_limit integer default 100)
returns table (
  fingerprint text, message text, kind text, occurrences bigint, users bigint, fatal_count bigint,
  first_seen timestamptz, last_seen timestamptz, versions text[], last_screen text, sample_stack text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return query
  select e.fingerprint,
         (array_agg(e.message order by e.created_at desc))[1],
         (array_agg(e.kind order by e.created_at desc))[1],
         count(*),
         count(distinct coalesce(e.user_id::text, e.device_id)),
         count(*) filter (where e.fatal),
         min(e.created_at),
         max(e.created_at),
         (select array_agg(v order by v desc) from (select distinct x.app_version as v from public.app_errors x where x.fingerprint = e.fingerprint and x.created_at >= p_since and x.app_version is not null) d),
         (array_agg(e.screen order by e.created_at desc))[1],
         (array_agg(e.stack order by e.created_at desc))[1]
    from public.app_errors e
   where e.created_at >= p_since
   group by e.fingerprint
   order by max(e.created_at) desc
   limit least(greatest(p_limit, 1), 500);
end;
$$;
revoke execute on function public.app_error_groups(timestamptz, integer) from public, anon;
grant execute on function public.app_error_groups(timestamptz, integer) to authenticated;

-- Keep 90 days.
create or replace function private.prune_app_errors() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.app_errors where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-prune-app-errors') then
    perform cron.unschedule('ipobell-prune-app-errors');
  end if;
end $$;
select cron.schedule('ipobell-prune-app-errors', '45 21 * * 0', $$ select private.prune_app_errors(); $$);
