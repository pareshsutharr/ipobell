-- Be IPO Ready — "Check my IPO" allotment tracker
-- Users save PANs (encrypted at rest), attach them to IPO applications, and a server job checks the
-- registrar (MUFG Intime / Bigshare / …) from allotment day until a result is known, then pushes it.
--
-- Vault secret required once:  select vault.create_secret('<32+ random chars>', 'pan_key');

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- user_pans — PAN is stored only as pgp-encrypted bytes + last 4 chars for display
-- ---------------------------------------------------------------------------
create table public.user_pans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 40),
  pan_encrypted bytea not null,
  pan_hash      text not null,                 -- sha256(upper(pan) || user_id) → dedupe per user without plaintext
  pan_last4     text not null check (char_length(pan_last4) = 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, pan_hash)
);
create index user_pans_user_idx on public.user_pans (user_id);
create trigger user_pans_set_updated_at before update on public.user_pans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ipo_applications — one row per (user, IPO, PAN)
-- ---------------------------------------------------------------------------
create table public.ipo_applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  ipo_id          uuid not null references public.ipos (id) on delete cascade,
  pan_id          uuid not null references public.user_pans (id) on delete cascade,
  application_no  text,                          -- optional, for registrars that need it
  lots_applied    integer,
  status          text not null default 'pending'
                  check (status in ('pending','allotted','not_allotted','not_found','manual','error')),
  shares_allotted integer,
  shares_applied  integer,
  amount_refunded numeric(14,2),
  category        text,                          -- RII / HNI / … as reported by the registrar
  registrar       text,                          -- driver key used (mufg / bigshare / kfintech …)
  check_count     integer not null default 0,
  last_checked_at timestamptz,
  next_check_at   timestamptz,
  last_error      text,
  result_raw      jsonb,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, ipo_id, pan_id)
);
create index ipo_applications_user_idx on public.ipo_applications (user_id, created_at desc);
create index ipo_applications_due_idx on public.ipo_applications (status, next_check_at) where status in ('pending','error','not_found');
create trigger ipo_applications_set_updated_at before update on public.ipo_applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Encryption helpers (private — never exposed)
-- ---------------------------------------------------------------------------
create or replace function private.pan_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pan_key' limit 1;
$$;

create or replace function private.encrypt_pan(p_pan text) returns bytea
language sql stable security definer set search_path = '' as $$
  select extensions.pgp_sym_encrypt(upper(p_pan), private.pan_key());
$$;

create or replace function private.decrypt_pan(p_cipher bytea) returns text
language sql stable security definer set search_path = '' as $$
  select extensions.pgp_sym_decrypt(p_cipher, private.pan_key());
$$;

-- ---------------------------------------------------------------------------
-- Client RPCs (security definer so plaintext PAN never needs an INSERT policy)
-- ---------------------------------------------------------------------------
create or replace function public.add_pan(p_label text, p_pan text)
returns table (id uuid, label text, pan_last4 text, created_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_pan text := upper(regexp_replace(coalesce(p_pan, ''), '\s', '', 'g'));
  v_count integer;
  v_premium boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'INVALID_PAN' using hint = 'PAN must look like ABCDE1234F';
  end if;
  if private.pan_key() is null then raise exception 'PAN_KEY_MISSING'; end if;

  select coalesce(p.is_premium and (p.premium_until is null or p.premium_until > now()), false) into v_premium
    from public.profiles p where p.id = v_uid;
  select count(*) into v_count from public.user_pans up where up.user_id = v_uid;
  if v_count >= 10 then
    raise exception 'PAN_LIMIT' using hint = 'You can save up to 10 PANs.';
  end if;

  insert into public.user_pans (user_id, label, pan_encrypted, pan_hash, pan_last4)
  values (v_uid, trim(p_label), private.encrypt_pan(v_pan), encode(extensions.digest(v_pan || v_uid::text, 'sha256'), 'hex'), right(v_pan, 4))
  on conflict (user_id, pan_hash) do update set label = excluded.label
  returning user_pans.id into v_id;

  return query select up.id, up.label, up.pan_last4, up.created_at from public.user_pans up where up.id = v_id;
end;
$$;

-- Add an application; the job starts checking from the IPO's allotment date.
create or replace function public.add_application(p_ipo_id uuid, p_pan_id uuid, p_application_no text default null, p_lots integer default null)
returns setof public.ipo_applications
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_allot date;
  v_driver text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.user_pans up where up.id = p_pan_id and up.user_id = v_uid) then
    raise exception 'PAN_NOT_FOUND';
  end if;
  select allotment_date, registrar->>'driver' into v_allot, v_driver from public.ipos where id = p_ipo_id;
  if not found then raise exception 'IPO_NOT_FOUND'; end if;

  insert into public.ipo_applications (user_id, ipo_id, pan_id, application_no, lots_applied, registrar, next_check_at)
  values (
    v_uid, p_ipo_id, p_pan_id, nullif(trim(p_application_no), ''), p_lots, v_driver,
    -- first check at 10:00 IST on allotment day (or now, if that has passed)
    greatest(now(), coalesce(v_allot, current_date)::timestamptz + interval '4 hours 30 minutes')
  )
  on conflict (user_id, ipo_id, pan_id) do update
    set application_no = coalesce(excluded.application_no, public.ipo_applications.application_no),
        lots_applied   = coalesce(excluded.lots_applied, public.ipo_applications.lots_applied),
        status = case when public.ipo_applications.status in ('allotted','not_allotted') then public.ipo_applications.status else 'pending' end,
        next_check_at = greatest(now(), public.ipo_applications.next_check_at)
  returning id into v_id;

  return query select * from public.ipo_applications a where a.id = v_id;
end;
$$;

-- Returns the plaintext PAN for ONE of the caller's own PANs (used to prefill a registrar page / copy to clipboard).
create or replace function public.reveal_pan(p_pan_id uuid) returns text
language sql security definer set search_path = '' as $$
  select private.decrypt_pan(up.pan_encrypted)
  from public.user_pans up
  where up.id = p_pan_id and up.user_id = auth.uid();
$$;

-- Service-role helper for the checker: applications due now, with the decrypted PAN.
create or replace function public.due_applications(p_limit integer default 50)
returns table (
  application_id uuid, user_id uuid, ipo_id uuid, slug text, ipo_name text, registrar jsonb,
  allotment_date date, listing_date date, pan text, application_no text, status text, check_count integer, registrar_driver text
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.user_id, a.ipo_id, i.slug, i.name, i.registrar, i.allotment_date, i.listing_date,
         private.decrypt_pan(up.pan_encrypted), a.application_no, a.status, a.check_count, i.registrar->>'driver'
  from public.ipo_applications a
  join public.ipos i on i.id = a.ipo_id
  join public.user_pans up on up.id = a.pan_id
  where a.status in ('pending','error','not_found')
    and a.next_check_at <= now()
    and a.check_count < 60
    and (i.listing_date is null or i.listing_date >= current_date - 7)
  order by a.next_check_at
  limit p_limit;
$$;
revoke execute on function public.due_applications(integer) from public, anon, authenticated;
grant execute on function public.due_applications(integer) to service_role;

grant select, update, delete on public.user_pans to authenticated;
grant select, update, delete on public.ipo_applications to authenticated;
grant execute on function public.add_pan(text, text) to authenticated;
grant execute on function public.add_application(uuid, uuid, text, integer) to authenticated;
grant execute on function public.reveal_pan(uuid) to authenticated;

-- RLS: own rows only; inserts go through the RPCs
alter table public.user_pans enable row level security;
alter table public.ipo_applications enable row level security;
create policy "pans: read own"   on public.user_pans for select to authenticated using ((select auth.uid()) = user_id);
create policy "pans: update own" on public.user_pans for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "pans: delete own" on public.user_pans for delete to authenticated using ((select auth.uid()) = user_id);
create policy "applications: read own"   on public.ipo_applications for select to authenticated using ((select auth.uid()) = user_id);
create policy "applications: update own" on public.ipo_applications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "applications: delete own" on public.ipo_applications for delete to authenticated using ((select auth.uid()) = user_id);

-- clients may only edit the fields that are theirs
create or replace function public.protect_application_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select auth.role()) = 'authenticated' then
    new.status := old.status; new.shares_allotted := old.shares_allotted; new.shares_applied := old.shares_applied;
    new.amount_refunded := old.amount_refunded; new.category := old.category; new.check_count := old.check_count;
    new.last_checked_at := old.last_checked_at; new.last_error := old.last_error; new.result_raw := old.result_raw;
    new.notified_at := old.notified_at; new.user_id := old.user_id; new.ipo_id := old.ipo_id; new.pan_id := old.pan_id;
  end if;
  return new;
end $$;
revoke execute on function public.protect_application_columns() from public, anon, authenticated;
create trigger ipo_applications_protect before update on public.ipo_applications
  for each row execute function public.protect_application_columns();

-- Clients can never read/modify ciphertext directly
revoke update (pan_encrypted, pan_hash, pan_last4, user_id) on public.user_pans from authenticated;

-- Realtime so the app sees results land
alter publication supabase_realtime add table public.ipo_applications;

-- Cron: check due applications every 20 min, 10:00–22:00 IST (04:30–16:30 UTC)
select cron.schedule(
  'ipobell-check-allotments',
  '*/20 4-16 * * *',
  $$ select private.invoke_edge_function('check-allotments', jsonb_build_object('trigger', 'cron')); $$
);


-- service-role helper: decrypt the PAN behind one application (used by check-allotments "check now")
create or replace function public.decrypt_pan_admin(p_application_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select private.decrypt_pan(up.pan_encrypted)
  from public.ipo_applications a join public.user_pans up on up.id = a.pan_id
  where a.id = p_application_id;
$$;
revoke execute on function public.decrypt_pan_admin(uuid) from public, anon, authenticated;
grant execute on function public.decrypt_pan_admin(uuid) to service_role;


-- Assisted (in-app WebView) checks: the user solved the registrar's CAPTCHA; the app reports what the page showed.
create or replace function public.record_manual_result(p_application_id uuid, p_status text, p_shares integer default null, p_note text default null)
returns setof public.ipo_applications
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status not in ('allotted','not_allotted','not_found') then raise exception 'INVALID_STATUS'; end if;
  update public.ipo_applications
     set status = p_status,
         shares_allotted = case when p_status = 'allotted' then coalesce(p_shares, shares_allotted) else 0 end,
         last_checked_at = now(),
         check_count = check_count + 1,
         next_check_at = case when p_status = 'not_found' then now() + interval '40 minutes' else null end,
         last_error = null,
         result_raw = jsonb_build_object('source', 'assisted', 'note', left(coalesce(p_note, ''), 500), 'at', now())
   where id = p_application_id and user_id = v_uid;
  return query select * from public.ipo_applications a where a.id = p_application_id and a.user_id = v_uid;
end $$;
grant execute on function public.record_manual_result(uuid, text, integer, text) to authenticated;

-- 'partial' status (assisted check: fewer shares than applied)

alter table public.ipo_applications drop constraint if exists ipo_applications_status_check;
alter table public.ipo_applications add constraint ipo_applications_status_check
  check (status in ('pending','allotted','partial','not_allotted','not_found','manual','error'));

create or replace function public.record_manual_result(p_application_id uuid, p_status text, p_shares integer default null, p_note text default null)
returns setof public.ipo_applications
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status not in ('allotted','partial','not_allotted','not_found') then raise exception 'INVALID_STATUS'; end if;
  update public.ipo_applications
     set status = p_status,
         shares_allotted = case when p_status in ('allotted','partial') then coalesce(p_shares, shares_allotted) else 0 end,
         last_checked_at = now(),
         check_count = check_count + 1,
         next_check_at = case when p_status = 'not_found' then now() + interval '40 minutes' else null end,
         last_error = null,
         result_raw = jsonb_build_object('source', 'assisted', 'note', left(coalesce(p_note, ''), 500), 'at', now())
   where id = p_application_id and user_id = v_uid;
  return query select * from public.ipo_applications a where a.id = p_application_id and a.user_id = v_uid;
end $$;


-- Fix: the protect trigger also fired inside record_manual_result (JWT role is still 'authenticated' in a
-- security-definer function), silently discarding assisted-check results. The RPC now sets a transaction-local
-- flag that the trigger honours; direct client updates still cannot touch result columns.
create or replace function public.protect_application_columns()
returns trigger language plpgsql as $$
begin
  if (select auth.role()) = 'authenticated' and coalesce(current_setting('app.allow_result_write', true), '') <> 'on' then
    new.status := old.status; new.shares_allotted := old.shares_allotted; new.shares_applied := old.shares_applied;
    new.amount_refunded := old.amount_refunded; new.category := old.category; new.check_count := old.check_count;
    new.last_checked_at := old.last_checked_at; new.last_error := old.last_error; new.result_raw := old.result_raw;
    new.notified_at := old.notified_at; new.user_id := old.user_id; new.ipo_id := old.ipo_id; new.pan_id := old.pan_id;
  end if;
  return new;
end $$;

create or replace function public.record_manual_result(p_application_id uuid, p_status text, p_shares integer default null, p_note text default null)
returns setof public.ipo_applications
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_status not in ('allotted','partial','not_allotted','not_found') then raise exception 'INVALID_STATUS'; end if;
  perform set_config('app.allow_result_write', 'on', true);
  update public.ipo_applications
     set status = p_status,
         shares_allotted = case when p_status in ('allotted','partial') then coalesce(p_shares, shares_allotted) else 0 end,
         last_checked_at = now(),
         check_count = check_count + 1,
         next_check_at = case when p_status = 'not_found' then now() + interval '40 minutes' else null end,
         last_error = null,
         result_raw = jsonb_build_object('source', 'assisted', 'note', left(coalesce(p_note, ''), 500), 'at', now())
   where id = p_application_id and user_id = v_uid;
  perform set_config('app.allow_result_write', 'off', true);
  return query select * from public.ipo_applications a where a.id = p_application_id and a.user_id = v_uid;
end $$;
