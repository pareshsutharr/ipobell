-- Keep the untouched feed payload out of the public table (14 Nov 2026).
--
-- public.ipos is readable by everyone (the app needs it) and it carried `raw_data`: the complete upstream
-- payload for every IPO. Anyone with the app's public key could copy the licensed feed in bulk, and every
-- Realtime change event shipped it to phones that never use it.
--
-- Now the payload lives in public.ipo_raw_data, which only the service role can read. A BEFORE trigger on
-- public.ipos moves whatever the sync writes into `raw_data` across and stores `{}` in its place, so:
--   - the sync function needs no change and it does not matter whether this migration or a function deploy
--     lands first;
--   - released app versions that `select *` keep working (they get `raw_data: {}`, a field they never read).
-- The column itself stays for now; it can be dropped once no deployed function writes to it.

create table if not exists public.ipo_raw_data (
  slug        text primary key,           -- same key the sync upserts on; no FK so it can be written before the ipos row exists
  list        jsonb,                      -- row from the list endpoint
  detail      jsonb,                      -- document from the detail endpoint
  updated_at  timestamptz not null default now()
);
comment on table public.ipo_raw_data is 'Untouched feed payload per IPO, for debugging and re-mapping. Service role only: never grant this to anon/authenticated.';

alter table public.ipo_raw_data enable row level security;   -- no policies: clients get nothing
revoke all on public.ipo_raw_data from public, anon, authenticated;
grant all on public.ipo_raw_data to service_role;

create or replace function private.stash_ipo_raw_data()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_data is not null and new.raw_data <> '{}'::jsonb then
    insert into public.ipo_raw_data as r (slug, list, detail, updated_at)
    values (new.slug, new.raw_data -> 'list', new.raw_data -> 'detail', now())
    on conflict (slug) do update
      set list = coalesce(excluded.list, r.list),
          detail = coalesce(excluded.detail, r.detail),
          updated_at = now()
      where coalesce(excluded.list, r.list) is distinct from r.list
         or coalesce(excluded.detail, r.detail) is distinct from r.detail;
  end if;
  new.raw_data := '{}'::jsonb;
  return new;
end;
$$;
revoke execute on function private.stash_ipo_raw_data() from public, anon, authenticated;

drop trigger if exists ipos_stash_raw_data on public.ipos;
create trigger ipos_stash_raw_data
  before insert or update of raw_data on public.ipos
  for each row execute function private.stash_ipo_raw_data();

create or replace function private.drop_ipo_raw_data()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.ipo_raw_data where slug = old.slug;
  return old;
end;
$$;
revoke execute on function private.drop_ipo_raw_data() from public, anon, authenticated;

drop trigger if exists ipos_drop_raw_data on public.ipos;
create trigger ipos_drop_raw_data
  after delete on public.ipos
  for each row execute function private.drop_ipo_raw_data();

-- Move what is already stored. The update fires the trigger above, which copies each payload and blanks the column.
update public.ipos set raw_data = raw_data where raw_data <> '{}'::jsonb;
