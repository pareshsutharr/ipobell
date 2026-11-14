-- Be IPO Ready — "Get Listed" (business-owner tools + lead capture)
-- The app ships the website's tools natively (readiness score, eligibility check, issue size,
-- issue cost, SME checklist). When a business owner asks for a call-back or sends a result to the
-- team, the row lands here. The team reads it from the Supabase dashboard / CRM export; a
-- best-effort webhook also forwards each lead to beipoready.com/api/leads so web and app leads
-- end up in the same inbox.

create table public.business_leads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,
  source           text not null check (source in ('readiness-tool','eligibility-check','issue-size-calculator','issue-cost-estimator','sme-ipo-checklist','book-call','business-hub')),
  name             text not null check (char_length(name) between 2 and 80),
  company_name     text check (company_name is null or char_length(company_name) <= 120),
  phone            text check (phone is null or phone ~ '^\+?[0-9 ]{10,16}$'),
  email            text check (email is null or email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  message          text check (message is null or char_length(message) <= 2000),
  readiness_score  numeric(4,1),                 -- 0–10, readiness tool only
  payload          jsonb not null default '{}'::jsonb,  -- tool inputs / results, human-readable keys
  app_version      text,
  status           text not null default 'new' check (status in ('new','contacted','qualified','closed','spam')),
  forwarded_at     timestamptz,                  -- set when the webhook POST was accepted
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index business_leads_created_idx on public.business_leads (created_at desc);
create index business_leads_user_idx on public.business_leads (user_id, created_at desc);
create index business_leads_status_idx on public.business_leads (status) where status = 'new';
create trigger business_leads_set_updated_at before update on public.business_leads
  for each row execute function public.set_updated_at();

alter table public.business_leads enable row level security;
-- Users may read what they themselves sent (shown as "Sent to our team ✓" in the app). Inserts go
-- through the RPC below so validation and the rate limit cannot be bypassed. Staff use the dashboard.
create policy "leads: read own" on public.business_leads for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- RPC: submit_business_lead — validates, rate-limits (10 per user per day), inserts.
-- ---------------------------------------------------------------------------
create or replace function public.submit_business_lead(
  p_source text,
  p_name text,
  p_phone text default null,
  p_email text default null,
  p_company text default null,
  p_message text default null,
  p_payload jsonb default '{}'::jsonb,
  p_readiness_score numeric default null,
  p_app_version text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+ ]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_today integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_phone is null and v_email is null then
    raise exception 'CONTACT_REQUIRED' using hint = 'Add a phone number or an email so we can reach you.';
  end if;
  select count(*) into v_today from public.business_leads b where b.user_id = v_uid and b.created_at > now() - interval '1 day';
  if v_today >= 10 then
    raise exception 'LEAD_LIMIT' using hint = 'You have sent several requests today. Our team will call you back.';
  end if;

  insert into public.business_leads (user_id, source, name, company_name, phone, email, message, readiness_score, payload, app_version)
  values (v_uid, p_source, trim(p_name), nullif(trim(coalesce(p_company, '')), ''), v_phone, v_email, nullif(trim(coalesce(p_message, '')), ''),
          p_readiness_score, coalesce(p_payload, '{}'::jsonb), p_app_version)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_business_lead(text, text, text, text, text, text, jsonb, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Best-effort forward to the website's lead inbox (same endpoint the web tools use).
-- Fire-and-forget via pg_net; failures never block the insert. The weekly housekeeping job already
-- prunes net._http_response.
-- ---------------------------------------------------------------------------
create or replace function private.forward_business_lead()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_body jsonb;
begin
  v_body := jsonb_build_object(
    'name', new.name,
    'email', coalesce(new.email, ''),
    'phone', coalesce(new.phone, ''),
    'company_name', new.company_name,
    'source', 'app:' || new.source,
    'readiness_score', new.readiness_score,
    'tool_inputs', new.payload,
    'message', coalesce(new.message, '') || E'\n\n[Sent from the Be IPO Ready Android app' || coalesce(' v' || new.app_version, '') || ', lead ' || new.id::text || ']'
  );
  begin
    perform net.http_post(
      url := 'https://beipoready.com/api/leads',
      headers := '{"Content-Type":"application/json","User-Agent":"beipoready-app-supabase"}'::jsonb,
      body := v_body,
      timeout_milliseconds := 8000
    );
  exception when others then
    -- pg_net missing or misconfigured: keep the row, skip the forward
    null;
  end;
  return new;
end;
$$;
create trigger business_leads_forward after insert on public.business_leads
  for each row execute function private.forward_business_lead();
