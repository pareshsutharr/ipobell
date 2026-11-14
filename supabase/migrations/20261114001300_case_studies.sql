-- Case studies (14 Nov 2026).
-- The Get Listed tab showed one case study written into the app. Case studies now live here and are written in
-- the admin panel; the app lists the published ones. Published rows are public; drafts are visible to admins only.

create table if not exists public.case_studies (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  status         text not null default 'draft' check (status in ('draft','published')),
  title          text not null check (char_length(title) between 3 and 140),     -- e.g. "Aaron Industries"
  exchange       text check (exchange is null or exchange in ('NSE Emerge','BSE SME','Mainboard')),
  listing_year   integer check (listing_year is null or listing_year between 1990 and 2100),
  city           text check (city is null or char_length(city) <= 80),
  summary        text not null check (char_length(summary) between 10 and 400),  -- shown on the card
  body           text check (body is null or char_length(body) <= 12000),        -- long form, paragraphs separated by blank lines
  highlights     jsonb not null default '[]'::jsonb check (jsonb_typeof(highlights) = 'array' and pg_column_size(highlights) < 4096),   -- [{label, value}]
  hero_image_url text check (hero_image_url is null or hero_image_url ~ '^https://'),
  ipo_id         uuid references public.ipos (id) on delete set null,            -- optional link to the IPO page
  sort_order     integer not null default 100,                                   -- lower shows first
  published_at   timestamptz,
  updated_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists case_studies_published_idx on public.case_studies (sort_order, published_at desc) where status = 'published';

create or replace function public.case_studies_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;
revoke execute on function public.case_studies_stamp() from public, anon, authenticated;
drop trigger if exists case_studies_stamp on public.case_studies;
create trigger case_studies_stamp before insert or update on public.case_studies
  for each row execute function public.case_studies_stamp();

alter table public.case_studies enable row level security;
drop policy if exists "case_studies: published are public" on public.case_studies;
drop policy if exists "case_studies: admins read all" on public.case_studies;
drop policy if exists "case_studies: admins insert" on public.case_studies;
drop policy if exists "case_studies: admins update" on public.case_studies;
drop policy if exists "case_studies: admins delete" on public.case_studies;
create policy "case_studies: published are public" on public.case_studies for select to anon, authenticated using (status = 'published');
create policy "case_studies: admins read all" on public.case_studies for select to authenticated using (public.is_admin());
create policy "case_studies: admins insert" on public.case_studies for insert to authenticated with check (public.is_admin());
create policy "case_studies: admins update" on public.case_studies for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "case_studies: admins delete" on public.case_studies for delete to authenticated using (public.is_admin());
revoke all on public.case_studies from anon, authenticated;
grant select on public.case_studies to anon, authenticated;
grant insert, update, delete on public.case_studies to authenticated;   -- narrowed to admins by the policies above

-- The case study the app already showed, word for word, so nothing disappears when the app switches to this table.
insert into public.case_studies (slug, status, title, exchange, listing_year, city, summary, sort_order)
values ('aaron-industries', 'published', 'Aaron Industries', 'NSE Emerge', 2018, 'Surat',
        'A Surat elevator manufacturer listed in 2018 with a ₹4.9 Cr issue at ₹38 a share. Revenue has since grown from about ₹9 Cr to over ₹75 Cr, and the stock has multiplied many times over.',
        10)
on conflict (slug) do nothing;
