-- Sync watchdog (14 Nov 2026).
-- Every 30 minutes the `sync-watchdog` Edge Function reads public.sync_runs and e-mails staff when the IPO data
-- sync keeps failing or has had no successful run for 2 hours in market time (4 hours otherwise), and once more
-- when it recovers. Needs the function deployed and the SMTP_* secrets that notify-lead already uses.

-- Who is e-mailed. Super admins can edit this row; an empty list falls back to LEAD_NOTIFY_DEFAULT_EMAIL.
insert into public.app_settings (key, value, description)
values ('sync_alerts', '{"enabled": true, "emails": []}'::jsonb,
        'Who gets an e-mail when the IPO data sync fails. Empty list = the default lead notification address.')
on conflict (key) do nothing;

-- Internal state so one outage produces one e-mail (plus a reminder every 6 hours), not one every 30 minutes.
insert into public.app_settings (key, value, description)
values ('sync_watchdog_state', '{"alerting": false, "last_alert_at": null}'::jsonb,
        'Internal: whether a sync alert is currently open. Written by the sync-watchdog function.')
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-sync-watchdog') then
    perform cron.unschedule('ipobell-sync-watchdog');
  end if;
end $$;

-- :10 and :40 so it reads the result of the :00 / :15 / :30 / :45 sync runs rather than racing them.
select cron.schedule(
  'ipobell-sync-watchdog',
  '10,40 * * * *',
  $$ select private.invoke_edge_function('sync-watchdog', '{}'::jsonb); $$
);
