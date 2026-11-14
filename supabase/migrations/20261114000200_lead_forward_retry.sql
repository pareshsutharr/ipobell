-- Lead forwarding: record the outcome and retry (14 Nov 2026).
--
-- Before: the after-insert trigger POSTed each lead to https://beipoready.com/api/leads through pg_net and
-- forgot about it. A website outage lost the forward silently and `forwarded_at` was never set.
-- Now: the trigger remembers the pg_net request id; a job every 5 minutes reads the response and either stamps
-- `forwarded_at` (HTTP 2xx) or records `forward_error` and sends again, up to 5 attempts with a growing wait
-- (5, 10, 20, 40 minutes). The lead row and the staff e-mail never depended on the forward and still do not.
--
-- Leads created before this migration have no request id and are left alone (re-sending them would duplicate
-- enquiries the website already received).

alter table public.business_leads
  add column if not exists forward_request_id      bigint,
  add column if not exists forward_attempts        integer not null default 0,
  add column if not exists forward_last_attempt_at timestamptz,
  add column if not exists forward_error           text;

create index if not exists business_leads_forward_pending_idx
  on public.business_leads (forward_last_attempt_at)
  where forwarded_at is null and forward_request_id is not null;

comment on column public.business_leads.forwarded_at is 'Set when beipoready.com/api/leads answered HTTP 2xx.';
comment on column public.business_leads.forward_error is 'Why the last forward attempt failed (HTTP status, timeout, network error). Null once forwarded.';

-- Send (or re-send) one lead to the website and remember the request id. Never raises.
create or replace function private.send_lead_forward(p_lead_id uuid)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  l public.business_leads%rowtype;
  v_request bigint;
begin
  select * into l from public.business_leads where id = p_lead_id;
  if not found then return null; end if;

  begin
    select net.http_post(
      url := 'https://beipoready.com/api/leads',
      headers := '{"Content-Type":"application/json","User-Agent":"beipoready-app-supabase"}'::jsonb,
      body := jsonb_build_object(
        'name', l.name,
        'email', coalesce(l.email, ''),
        'phone', coalesce(l.phone, ''),
        'company_name', l.company_name,
        'source', 'app:' || l.source,
        'readiness_score', l.readiness_score,
        'tool_inputs', l.payload,
        'message', coalesce(l.message, '') || E'\n\n[Sent from the Be IPO Ready Android app' || coalesce(' v' || l.app_version, '') || ', lead ' || l.id::text || ']'
      ),
      timeout_milliseconds := 8000
    ) into v_request;
  exception when others then
    -- pg_net missing or misconfigured: keep the row, record why, let the retry job try again
    update public.business_leads
       set forward_attempts = forward_attempts + 1, forward_last_attempt_at = now(), forward_request_id = coalesce(forward_request_id, 0),
           forward_error = left('could not queue request: ' || sqlerrm, 500)
     where id = p_lead_id;
    return null;
  end;

  update public.business_leads
     set forward_request_id = v_request, forward_attempts = forward_attempts + 1, forward_last_attempt_at = now()
   where id = p_lead_id;
  return v_request;
end;
$$;

create or replace function private.forward_business_lead()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.send_lead_forward(new.id);
  return new;
end;
$$;
-- (trigger business_leads_forward from 20261028000100 keeps pointing at this function)

-- Read pg_net responses for leads that are not confirmed yet; confirm, or record the error and retry.
create or replace function private.reconcile_lead_forwards(p_max_attempts integer default 5)
returns table (confirmed integer, retried integer, gave_up integer)
language plpgsql security definer set search_path = ''
as $$
declare
  r record;
  v_confirmed integer := 0;
  v_retried integer := 0;
  v_gave_up integer := 0;
  v_error text;
  v_wait interval;
begin
  for r in
    select b.id, b.forward_attempts, b.forward_last_attempt_at, b.forward_error,
           h.id as response_id, h.status_code, h.timed_out, h.error_msg
      from public.business_leads b
      left join net._http_response h on h.id = b.forward_request_id
     where b.forwarded_at is null
       and b.forward_request_id is not null
       and b.created_at > now() - interval '3 days'
     order by b.created_at
     limit 200
  loop
    if r.response_id is not null and r.status_code between 200 and 299 then
      update public.business_leads set forwarded_at = now(), forward_error = null where id = r.id;
      v_confirmed := v_confirmed + 1;
      continue;
    end if;

    if r.response_id is not null then
      v_error := case
        when r.timed_out then 'timed out'
        when r.status_code is not null then 'HTTP ' || r.status_code
        else coalesce(nullif(r.error_msg, ''), 'request failed')
      end;
    elsif r.forward_last_attempt_at < now() - interval '4 minutes' then
      -- no response row: pg_net never delivered it, or the response was pruned before we looked
      v_error := coalesce(r.forward_error, 'no response recorded');
    else
      continue; -- still in flight
    end if;

    if r.forward_attempts >= p_max_attempts then
      if r.forward_error is distinct from left(v_error || ' (gave up after ' || r.forward_attempts || ' attempts)', 500) then
        update public.business_leads set forward_error = left(v_error || ' (gave up after ' || r.forward_attempts || ' attempts)', 500) where id = r.id;
        v_gave_up := v_gave_up + 1;
      end if;
      continue;
    end if;

    -- wait 5, 10, 20, 40 minutes after attempts 1..4
    v_wait := make_interval(mins => 5 * (2 ^ (greatest(r.forward_attempts, 1) - 1))::integer);
    if r.forward_last_attempt_at > now() - v_wait then
      update public.business_leads set forward_error = left(v_error, 500) where id = r.id and forward_error is distinct from left(v_error, 500);
      continue;
    end if;

    update public.business_leads set forward_error = left(v_error, 500) where id = r.id;
    perform private.send_lead_forward(r.id);
    v_retried := v_retried + 1;
  end loop;

  return query select v_confirmed, v_retried, v_gave_up;
end;
$$;

revoke execute on function private.send_lead_forward(uuid) from public, anon, authenticated;
revoke execute on function private.reconcile_lead_forwards(integer) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-lead-forward-retry') then
    perform cron.unschedule('ipobell-lead-forward-retry');
  end if;
end $$;

select cron.schedule(
  'ipobell-lead-forward-retry',
  '*/5 * * * *',
  $$ select private.reconcile_lead_forwards(); $$
);
