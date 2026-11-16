-- Data score and promoted IPOs (16 Nov 2026). Plan steps 5.2 and 5.3.
--
-- BOTH ARE OFF. The plan holds these two features for legal advice, so each has a switch that starts off and
-- only a super admin can turn on. While a switch is off the app shows nothing of that feature, and
-- public.promoted_ipos() returns no rows whatever is flagged.
--
--   public.feature_switches    two rows: data_score, promoted_ipos. Everyone can read; super admins update.
--   ipo_admin_data             is_promoted (already there) + promoted_until. Only a super admin can change them.
--   public.promoted_ipos()     the IPOs to show under the "Promoted" label: flagged, not past promoted_until,
--                              upcoming or open, at most 2, and only while the switch is on.

create table if not exists public.feature_switches (
  key          text primary key check (key in ('data_score','promoted_ipos')),
  enabled      boolean not null default false,
  description  text,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

create or replace function public.feature_switches_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.feature_switches_stamp() from public, anon, authenticated;
drop trigger if exists feature_switches_stamp on public.feature_switches;
create trigger feature_switches_stamp before insert or update on public.feature_switches
  for each row execute function public.feature_switches_stamp();

alter table public.feature_switches enable row level security;
drop policy if exists "feature_switches: public read" on public.feature_switches;
drop policy if exists "feature_switches: super admins update" on public.feature_switches;
create policy "feature_switches: public read" on public.feature_switches for select to anon, authenticated using (true);
create policy "feature_switches: super admins update" on public.feature_switches for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.feature_switches from anon, authenticated;
grant select on public.feature_switches to anon, authenticated;
grant update (enabled) on public.feature_switches to authenticated;   -- narrowed to super admins by the policy; rows cannot be added or removed

insert into public.feature_switches (key, enabled, description) values
  ('data_score', false, 'Shows the data score (growth, margin, debt, valuation, with the formula) on IPO pages. Held for legal advice: turn on only after sign-off.'),
  ('promoted_ipos', false, 'Shows IPOs flagged as promoted in a separate block with a "Promoted" label. Held for legal review: turn on only after sign-off.')
on conflict (key) do nothing;

-- Switch changes appear in the change log like other admin edits.
drop trigger if exists zz_log_admin_change on public.feature_switches;
create trigger zz_log_admin_change after insert or update or delete on public.feature_switches
  for each row execute function private.log_admin_change();

-- Promotion: an optional end date, and only a super admin may start, stop or extend one.
alter table public.ipo_admin_data add column if not exists promoted_until date;
comment on column public.ipo_admin_data.is_promoted is 'Paid or sponsored placement. Shown only under a "Promoted" label, only while feature_switches.promoted_ipos is on.';

create or replace function public.ipo_admin_data_promotion_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if (select auth.uid()) is null then return new; end if;   -- SQL editor / service role
  if tg_op = 'INSERT' then
    v_changed := new.is_promoted or new.promoted_until is not null;
  else
    v_changed := new.is_promoted is distinct from old.is_promoted or new.promoted_until is distinct from old.promoted_until;
  end if;
  if v_changed and not public.is_super_admin() then
    raise exception 'ONLY_SUPER_ADMIN_PROMOTES' using errcode = 'P0001', hint = 'Only a super admin can mark an IPO as promoted or change its end date.';
  end if;
  return new;
end;
$$;
revoke execute on function public.ipo_admin_data_promotion_guard() from public, anon, authenticated;
drop trigger if exists a_ipo_admin_data_promotion_guard on public.ipo_admin_data;
create trigger a_ipo_admin_data_promotion_guard before insert or update on public.ipo_admin_data
  for each row execute function public.ipo_admin_data_promotion_guard();

create or replace function public.promoted_ipos()
returns table (ipo_id uuid, slug text, promoted_until date)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.slug, d.promoted_until
    from public.ipo_admin_data d
    join public.ipos i on i.id = d.ipo_id
   where d.is_promoted
     and (d.promoted_until is null or d.promoted_until >= (now() at time zone 'Asia/Kolkata')::date)
     and i.status in ('upcoming', 'open')
     and exists (select 1 from public.feature_switches s where s.key = 'promoted_ipos' and s.enabled)
   order by i.open_date asc nulls last, i.slug
   limit 2;
$$;
revoke execute on function public.promoted_ipos() from public;
grant execute on function public.promoted_ipos() to anon, authenticated;
