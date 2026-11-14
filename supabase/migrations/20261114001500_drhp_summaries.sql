-- DRHP summaries (14 Nov 2026): a one-page summary and a longer one per IPO, written by the team.
--
-- Editors write and save drafts. Only a super admin publishes, and only a super admin can change a summary once
-- it is published (unpublish it first to hand it back to an editor). The app shows published summaries only.
-- A summary may be drafted with AI from the uploaded document, but a person always reviews and publishes it.

create table if not exists public.ipo_drhp_summaries (
  ipo_id              uuid primary key references public.ipos (id) on delete cascade,
  status              text not null default 'draft' check (status in ('draft','published')),
  short_md            text check (short_md is null or char_length(short_md) <= 4000),      -- the one-page summary
  long_md             text check (long_md is null or char_length(long_md) <= 30000),       -- business, strengths, financials in more depth
  use_of_funds        jsonb not null default '[]'::jsonb check (jsonb_typeof(use_of_funds) = 'array' and pg_column_size(use_of_funds) < 8192),   -- [{purpose, amount, page}]
  risks               jsonb not null default '[]'::jsonb check (jsonb_typeof(risks) = 'array' and pg_column_size(risks) < 8192),                 -- [{text, page}]
  source_document_id  uuid references public.ipo_documents_admin (id) on delete set null,  -- the file it was written from
  ai_drafted          boolean not null default false,                                      -- the first draft came from the AI button
  updated_by          uuid references auth.users (id) on delete set null,
  published_by        uuid references auth.users (id) on delete set null,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Who may do what, enforced here so it holds whatever the admin panel does.
create or replace function public.ipo_drhp_summaries_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_super boolean := v_uid is not null and public.is_super_admin();
begin
  -- Server-side jobs (no signed-in user, service role) are not restricted.
  if v_uid is not null and not v_super then
    if tg_op = 'UPDATE' and old.status = 'published' then
      raise exception 'PUBLISHED_IS_LOCKED' using hint = 'This summary is published. Ask a super admin to unpublish it before editing.';
    end if;
    if new.status = 'published' then
      raise exception 'ONLY_SUPER_ADMIN_PUBLISHES' using hint = 'Save it as a draft. A super admin reviews and publishes.';
    end if;
  end if;

  new.updated_at := now();
  if v_uid is not null then new.updated_by := v_uid; end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if coalesce(btrim(new.short_md), '') = '' then
      raise exception 'SUMMARY_EMPTY' using hint = 'Write the one-page summary before publishing.';
    end if;
    new.published_at := now();
    new.published_by := v_uid;
  elsif new.status = 'draft' then
    new.published_at := null;
    new.published_by := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.ipo_drhp_summaries_guard() from public, anon, authenticated;
drop trigger if exists ipo_drhp_summaries_guard on public.ipo_drhp_summaries;
create trigger ipo_drhp_summaries_guard before insert or update on public.ipo_drhp_summaries
  for each row execute function public.ipo_drhp_summaries_guard();

-- Deleting follows the same rule: an editor cannot delete what is published.
create or replace function public.ipo_drhp_summaries_guard_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and old.status = 'published' and not public.is_super_admin() then
    raise exception 'PUBLISHED_IS_LOCKED' using hint = 'This summary is published. Only a super admin can delete it.';
  end if;
  return old;
end;
$$;
revoke execute on function public.ipo_drhp_summaries_guard_delete() from public, anon, authenticated;
drop trigger if exists ipo_drhp_summaries_guard_delete on public.ipo_drhp_summaries;
create trigger ipo_drhp_summaries_guard_delete before delete on public.ipo_drhp_summaries
  for each row execute function public.ipo_drhp_summaries_guard_delete();

alter table public.ipo_drhp_summaries enable row level security;
drop policy if exists "drhp_summaries: published are public" on public.ipo_drhp_summaries;
drop policy if exists "drhp_summaries: admins read all" on public.ipo_drhp_summaries;
drop policy if exists "drhp_summaries: admins insert" on public.ipo_drhp_summaries;
drop policy if exists "drhp_summaries: admins update" on public.ipo_drhp_summaries;
drop policy if exists "drhp_summaries: admins delete" on public.ipo_drhp_summaries;
create policy "drhp_summaries: published are public" on public.ipo_drhp_summaries for select to anon, authenticated using (status = 'published');
create policy "drhp_summaries: admins read all" on public.ipo_drhp_summaries for select to authenticated using (public.is_admin());
create policy "drhp_summaries: admins insert" on public.ipo_drhp_summaries for insert to authenticated with check (public.is_admin());
create policy "drhp_summaries: admins update" on public.ipo_drhp_summaries for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "drhp_summaries: admins delete" on public.ipo_drhp_summaries for delete to authenticated using (public.is_admin());
revoke all on public.ipo_drhp_summaries from anon, authenticated;
grant select on public.ipo_drhp_summaries to anon, authenticated;
grant insert, update, delete on public.ipo_drhp_summaries to authenticated;   -- admins only, by policy

-- The app follows a publish within seconds, like insights.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ipo_drhp_summaries') then
    alter publication supabase_realtime add table public.ipo_drhp_summaries;
  end if;
end $$;
