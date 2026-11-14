-- IPOBell — scheduling with pg_cron + pg_net
--
-- Before running: store the project URL and the cron secret in Supabase Vault.
-- The cron secret must equal the CRON_SECRET Edge Function secret.
--
--   select vault.create_secret('https://ehpjxstddpkxijfjelax.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'cron_secret');
--
-- (The Management API / deploy script in this repo does this for you.)

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Helper: POST to an Edge Function with the cron secret. Lives in `private` so it is not exposed.
create or replace function private.invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url'  limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret'  limit 1;

  if v_url is null or v_secret is null then
    raise exception 'vault secrets project_url / cron_secret are missing';
  end if;

  select net.http_post(
    url     := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := p_body,
    timeout_milliseconds := 120000
  ) into v_id;

  return v_id;
end;
$$;

-- Remove earlier versions when re-running this file
do $$
declare j record;
begin
  for j in select jobname from cron.job where jobname like 'ipobell-%' loop
    perform cron.unschedule(j.jobname);
  end loop;
end $$;

-- sync-ipos: every 15 minutes 08:30–18:29 IST (03:00–12:59 UTC)
select cron.schedule(
  'ipobell-sync-market-hours',
  '*/15 3-12 * * *',
  $$ select private.invoke_edge_function('sync-ipos', jsonb_build_object('trigger', 'cron-market')); $$
);

-- sync-ipos: hourly outside market hours
select cron.schedule(
  'ipobell-sync-off-hours',
  '0 0-2,13-23 * * *',
  $$ select private.invoke_edge_function('sync-ipos', jsonb_build_object('trigger', 'cron-offhours')); $$
);

-- sync-ipos: once a day pull the full history (months=0) so listed IPOs keep their CMP fresh
select cron.schedule(
  'ipobell-sync-full-daily',
  '20 1 * * *',             -- 06:50 IST
  $$ select private.invoke_edge_function('sync-ipos', jsonb_build_object('trigger', 'cron-full', 'full', true)); $$
);

-- daily-reminders: morning digest at 08:30 IST (03:00 UTC): opens / closes / allotment / refund / listing today
select cron.schedule(
  'ipobell-reminders-morning',
  '0 3 * * *',
  $$ select private.invoke_edge_function('daily-reminders', jsonb_build_object('mode', 'morning')); $$
);

-- daily-reminders: "closing in 2 hours" at 15:00 IST (09:30 UTC) — retail bidding closes 17:00 IST
select cron.schedule(
  'ipobell-reminders-closing-soon',
  '30 9 * * *',
  $$ select private.invoke_edge_function('daily-reminders', jsonb_build_object('mode', 'closing_soon')); $$
);

-- daily-reminders: evening at 19:00 IST (13:30 UTC): allotment / listing tomorrow
select cron.schedule(
  'ipobell-reminders-evening',
  '30 13 * * *',
  $$ select private.invoke_edge_function('daily-reminders', jsonb_build_object('mode', 'evening')); $$
);

-- housekeeping: prune old pg_net responses, sync runs and notification logs weekly
select cron.schedule(
  'ipobell-housekeeping',
  '0 20 * * 0',
  $$
    delete from net._http_response where created < now() - interval '2 days';
    delete from public.sync_runs where started_at < now() - interval '30 days';
    delete from public.notification_log where created_at < now() - interval '180 days';
    delete from public.device_tokens where last_seen_at < now() - interval '180 days';
  $$
);

-- Anonymous accounts that never registered a device or watched anything are dropped after 90 days.
create or replace function private.cleanup_stale_anonymous_users() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  with gone as (
    delete from auth.users u
    where u.is_anonymous = true
      and u.created_at < now() - interval '90 days'
      and not exists (select 1 from public.device_tokens d where d.user_id = u.id)
      and not exists (select 1 from public.watchlist w where w.user_id = u.id)
    returning 1
  ) select count(*) into n from gone;
  return n;
end $$;

select cron.unschedule('ipobell-housekeeping');
select cron.schedule('ipobell-housekeeping', '0 20 * * 0', $$
    delete from net._http_response where created < now() - interval '2 days';
    delete from public.sync_runs where started_at < now() - interval '30 days';
    delete from public.notification_log where created_at < now() - interval '180 days';
    delete from public.device_tokens where last_seen_at < now() - interval '180 days';
    select private.cleanup_stale_anonymous_users();
$$);
