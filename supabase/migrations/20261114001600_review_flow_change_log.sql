-- Review flow and change log (14 Nov 2026).
--
-- 1. House views (ipo_insights) follow the same rule as DRHP summaries: editors write drafts, only a super admin
--    publishes, and a published insight can be changed only by a super admin.
--    This CHANGES existing behaviour: until now any admin could publish an insight.
-- 2. public.admin_change_log records who changed what in the content the app shows: which table, which row,
--    insert / update / delete, which columns changed, and for status changes the old and new status.
--    It stores no before/after text, so it stays small and holds nothing sensitive.

-- ---------------------------------------------------------------------------------------------------------
-- 1. ipo_insights: only a super admin publishes
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.ipo_insights_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or public.is_super_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'PUBLISHED_IS_LOCKED' using hint = 'This insight is published. Only a super admin can delete it.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    raise exception 'PUBLISHED_IS_LOCKED' using hint = 'This insight is published. Ask a super admin to unpublish it before editing.';
  end if;
  if new.status = 'published' then
    raise exception 'ONLY_SUPER_ADMIN_PUBLISHES' using hint = 'Save it as a draft. A super admin reviews and publishes.';
  end if;
  return new;
end;
$$;
revoke execute on function public.ipo_insights_guard() from public, anon, authenticated;
drop trigger if exists a_ipo_insights_guard on public.ipo_insights;
-- "a_" so it runs before the existing stamp trigger (triggers fire in name order)
create trigger a_ipo_insights_guard before insert or update or delete on public.ipo_insights
  for each row execute function public.ipo_insights_guard();

-- ---------------------------------------------------------------------------------------------------------
-- 2. change log
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.admin_change_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_key     text not null,                 -- the row's id / ipo_id / key
  ipo_id      uuid,                          -- set when the row belongs to an IPO (kept after the IPO or row is deleted)
  action      text not null check (action in ('insert','update','delete')),
  changed     text[] not null default '{}',  -- column names that changed (updates only)
  old_status  text,
  new_status  text,
  actor_id    uuid,                          -- null = a server-side job
  actor_email text,
  created_at  timestamptz not null default now()
);
create index if not exists admin_change_log_created_idx on public.admin_change_log (created_at desc);
create index if not exists admin_change_log_ipo_idx on public.admin_change_log (ipo_id, created_at desc) where ipo_id is not null;
create index if not exists admin_change_log_actor_idx on public.admin_change_log (actor_id, created_at desc);

alter table public.admin_change_log enable row level security;
drop policy if exists "change_log: admins read" on public.admin_change_log;
create policy "change_log: admins read" on public.admin_change_log for select to authenticated using (public.is_admin());
revoke all on public.admin_change_log from anon, authenticated;
grant select on public.admin_change_log to authenticated;   -- admins only, by policy; rows are written by the trigger below

create or replace function private.log_admin_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_row jsonb := coalesce(v_new, v_old);
  v_uid uuid := (select auth.uid());
  v_changed text[] := '{}';
  v_key text;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into v_changed
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key
       and n.key not in ('updated_at', 'updated_by', 'published_at', 'published_by', 'created_at');
    if cardinality(v_changed) = 0 then
      return new;   -- nothing a person would call a change (for example a re-save with identical content)
    end if;
  end if;
  v_key := coalesce(v_row ->> 'id', v_row ->> 'ipo_id', v_row ->> 'key', '?');
  insert into public.admin_change_log (table_name, row_key, ipo_id, action, changed, old_status, new_status, actor_id, actor_email)
  values (
    tg_table_name, v_key,
    case when v_row ? 'ipo_id' and (v_row ->> 'ipo_id') ~* '^[0-9a-f-]{36}$' then (v_row ->> 'ipo_id')::uuid else null end,
    lower(tg_op), v_changed,
    coalesce(v_old ->> 'status', v_old ->> 'text_status'), coalesce(v_new ->> 'status', v_new ->> 'text_status'),
    v_uid, (select u.email from auth.users u where u.id = v_uid)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.log_admin_change() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['ipo_admin_data', 'ipo_insights', 'ipo_drhp_summaries', 'ipo_documents_admin', 'case_studies', 'business_rules']
  loop
    execute format('drop trigger if exists zz_log_admin_change on public.%I', t);
    execute format('create trigger zz_log_admin_change after insert or update or delete on public.%I for each row execute function private.log_admin_change()', t);
  end loop;
end $$;

-- Keep two years.
create or replace function private.prune_admin_change_log() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.admin_change_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end $$;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-prune-change-log') then
    perform cron.unschedule('ipobell-prune-change-log');
  end if;
end $$;
select cron.schedule('ipobell-prune-change-log', '50 21 * * 0', $$ select private.prune_admin_change_log(); $$);
