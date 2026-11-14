-- Investor interest signal and checklist sync (14 Nov 2026).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Interest signal: how many people watch an IPO and how many opened its page in the last 30 days.
--    Only totals leave the database, never who. Numbers below 3 are returned as NULL so a count can never
--    point at one or two individual people.
-- ---------------------------------------------------------------------------------------------------------
create index if not exists analytics_events_ipo_view_idx
  on public.analytics_events ((props ->> 'ipo_id'), created_at desc)
  where event = 'ipo_view';

create or replace function public.ipo_interest(p_ipo_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_watchers bigint;
  v_viewers  bigint;
begin
  select count(*) into v_watchers from public.watchlist w where w.ipo_id = p_ipo_id;
  select count(distinct coalesce(e.user_id::text, e.device_id)) into v_viewers
    from public.analytics_events e
   where e.event = 'ipo_view'
     and e.props ->> 'ipo_id' = p_ipo_id::text
     and e.created_at > now() - interval '30 days';
  return jsonb_build_object(
    'watchers',   case when v_watchers >= 3 then v_watchers end,
    'viewers_30d', case when v_viewers  >= 3 then v_viewers  end
  );
end;
$$;
revoke execute on function public.ipo_interest(uuid) from public;
grant execute on function public.ipo_interest(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. SME IPO checklist ticks, saved to the account so they follow the user to another device.
--    One row per user; `done` is { "<phase>:<index>": true }.
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.checklist_progress (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  done        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(done) = 'object' and pg_column_size(done) < 8192),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
drop trigger if exists checklist_progress_set_updated_at on public.checklist_progress;
create trigger checklist_progress_set_updated_at before update on public.checklist_progress
  for each row execute function public.set_updated_at();

alter table public.checklist_progress enable row level security;
drop policy if exists "checklist: own" on public.checklist_progress;
create policy "checklist: own" on public.checklist_progress for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.checklist_progress from anon, authenticated;
grant select, insert, update, delete on public.checklist_progress to authenticated;
