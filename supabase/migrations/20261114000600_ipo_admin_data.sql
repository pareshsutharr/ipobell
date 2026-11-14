-- Admin-entered facts per IPO (14 Nov 2026): state, sector, industry, listing platform.
--
-- The data feed has no state or sector, so staff enter them in the admin panel. They live in their own table,
-- not in public.ipos, because sync-ipos rewrites public.ipos from the feed on every run and must never be able
-- to overwrite hand-entered values. The sync function does not know this table exists.
--
-- Everyone can read (the app filters and groups by these); only admins can write. A missing row or a null
-- field means "not entered yet": the app shows "Not specified", it does not guess.

create table if not exists public.ipo_admin_data (
  ipo_id            uuid primary key references public.ipos (id) on delete cascade,
  state             text check (state is null or state in (
                      'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh',
                      'Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha',
                      'Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
                      'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir',
                      'Ladakh','Lakshadweep','Puducherry')),          -- registered office: 28 states + 8 union territories
  sector            text check (sector is null or char_length(sector) between 2 and 60),        -- from the admin panel's sector list
  industry          text check (industry is null or char_length(industry) between 2 and 120),   -- free text, more specific than sector
  listing_platform  text check (listing_platform is null or listing_platform in ('nse_emerge','bse_sme','mainboard')),
  is_promoted       boolean not null default false,   -- reserved for a later, legally reviewed "Promoted" label; nothing reads it yet
  updated_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists ipo_admin_data_state_idx on public.ipo_admin_data (state) where state is not null;
create index if not exists ipo_admin_data_sector_idx on public.ipo_admin_data (sector) where sector is not null;

comment on table public.ipo_admin_data is 'Facts entered by staff in the admin panel (state, sector, industry, listing platform). Never written by sync-ipos.';

-- Tidy input and stamp who changed it.
create or replace function public.ipo_admin_data_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.state := nullif(btrim(new.state), '');
  new.sector := nullif(btrim(new.sector), '');
  new.industry := nullif(btrim(new.industry), '');
  new.listing_platform := nullif(btrim(new.listing_platform), '');
  new.updated_at := now();
  if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.ipo_admin_data_stamp() from public, anon, authenticated;

drop trigger if exists ipo_admin_data_stamp on public.ipo_admin_data;
create trigger ipo_admin_data_stamp before insert or update on public.ipo_admin_data
  for each row execute function public.ipo_admin_data_stamp();

alter table public.ipo_admin_data enable row level security;
drop policy if exists "ipo_admin_data: public read" on public.ipo_admin_data;
drop policy if exists "ipo_admin_data: admins insert" on public.ipo_admin_data;
drop policy if exists "ipo_admin_data: admins update" on public.ipo_admin_data;
drop policy if exists "ipo_admin_data: admins delete" on public.ipo_admin_data;
create policy "ipo_admin_data: public read"   on public.ipo_admin_data for select to anon, authenticated using (true);
create policy "ipo_admin_data: admins insert" on public.ipo_admin_data for insert to authenticated with check (public.is_admin());
create policy "ipo_admin_data: admins update" on public.ipo_admin_data for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ipo_admin_data: admins delete" on public.ipo_admin_data for delete to authenticated using (public.is_admin());

revoke all on public.ipo_admin_data from anon, authenticated;
grant select on public.ipo_admin_data to anon, authenticated;
grant insert, update, delete on public.ipo_admin_data to authenticated;   -- narrowed to admins by the policies above
