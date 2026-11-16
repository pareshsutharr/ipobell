-- Balance sheet upload and health report (16 Nov 2026).
--
-- A business owner picks a file of financial statements in the app. The figures are read on the phone, the
-- owner checks them, and the app shows ratios and SME rule checks. With the owner's consent the file and the
-- checked figures are saved so a Be IPO Ready advisor can look at them before a call.
--
--   storage bucket `balance-sheets`   private. Path: <user id>/<report id>.<ext>. The owner reads, adds and
--                                     deletes their own files; admins can read; nobody else.
--   public.balance_sheet_reports      one row per saved report: the file, the figures (₹ crore), the consent.
--                                     Never updated: a new upload is a new report. At most 5 per person.
--   retention                         90 days, then the `purge-balance-sheets` Edge Function removes the file
--                                     and the row (storage files must be removed through the Storage API).
--                                     The owner can delete a report at any time in the app.
--   public.balance_sheet_purge_list() what the purge function has to remove (service role only).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('balance-sheets', 'balance-sheets', false, 10485760,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "balance-sheets bucket: owner reads" on storage.objects;
drop policy if exists "balance-sheets bucket: owner adds" on storage.objects;
drop policy if exists "balance-sheets bucket: owner deletes" on storage.objects;
drop policy if exists "balance-sheets bucket: admins read" on storage.objects;
create policy "balance-sheets bucket: owner reads" on storage.objects for select to authenticated
  using (bucket_id = 'balance-sheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "balance-sheets bucket: owner adds" on storage.objects for insert to authenticated
  with check (bucket_id = 'balance-sheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "balance-sheets bucket: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'balance-sheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "balance-sheets bucket: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'balance-sheets' and public.is_admin());

create table if not exists public.balance_sheet_reports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_path        text not null unique
                   check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(xlsx|xls|csv|pdf)$'),      -- path inside the bucket
  file_name        text not null check (char_length(file_name) between 1 and 200),                -- the name it was uploaded with
  file_size        bigint not null check (file_size > 0 and file_size <= 10485760),
  file_kind        text not null check (file_kind in ('xlsx','xls','csv','pdf')),
  figures          jsonb not null default '[]'::jsonb                                              -- up to 3 years, ₹ crore, as checked by the owner
                   check (jsonb_typeof(figures) = 'array' and jsonb_array_length(figures) <= 3 and pg_column_size(figures) < 4096),
  figures_source   text not null default 'file' check (figures_source in ('file','typed')),       -- read from the file, or typed (PDF)
  consent_version  text not null check (char_length(consent_version) between 1 and 40),           -- which consent text was shown
  consented_at     timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '90 days'),
  created_at       timestamptz not null default now()
);
create index if not exists balance_sheet_reports_user_idx on public.balance_sheet_reports (user_id, created_at desc);
create index if not exists balance_sheet_reports_expiry_idx on public.balance_sheet_reports (expires_at);

-- The server, not the app, decides whose report it is, when consent was given and when it expires.
create or replace function public.balance_sheet_reports_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is not null then new.user_id := v_uid; end if;
  if new.user_id is null then
    raise exception 'SIGN_IN_REQUIRED' using errcode = 'P0001';
  end if;
  if split_part(new.file_path, '/', 1) <> new.user_id::text then
    raise exception 'WRONG_FOLDER' using errcode = 'P0001', hint = 'The file is not in your own folder.';
  end if;
  new.consented_at := now();
  new.created_at := now();
  new.expires_at := now() + interval '90 days';
  -- one person at a time, so two uploads at once cannot both slip under the limit
  perform pg_advisory_xact_lock(hashtextextended('balance_sheet_reports:' || new.user_id::text, 0));
  select count(*) into v_count from public.balance_sheet_reports r where r.user_id = new.user_id;
  if v_count >= 5 then
    raise exception 'REPORT_LIMIT' using errcode = 'P0001', hint = 'You have 5 saved reports. Delete one to save another.';
  end if;
  return new;
end;
$$;
revoke execute on function public.balance_sheet_reports_guard() from public, anon, authenticated;
drop trigger if exists balance_sheet_reports_guard on public.balance_sheet_reports;
create trigger balance_sheet_reports_guard before insert on public.balance_sheet_reports
  for each row execute function public.balance_sheet_reports_guard();

alter table public.balance_sheet_reports enable row level security;
drop policy if exists "balance_sheet_reports: owner reads" on public.balance_sheet_reports;
drop policy if exists "balance_sheet_reports: owner adds" on public.balance_sheet_reports;
drop policy if exists "balance_sheet_reports: owner deletes" on public.balance_sheet_reports;
drop policy if exists "balance_sheet_reports: admins read" on public.balance_sheet_reports;
create policy "balance_sheet_reports: owner reads" on public.balance_sheet_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "balance_sheet_reports: owner adds" on public.balance_sheet_reports for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "balance_sheet_reports: owner deletes" on public.balance_sheet_reports for delete to authenticated using ((select auth.uid()) = user_id);
create policy "balance_sheet_reports: admins read" on public.balance_sheet_reports for select to authenticated using (public.is_admin());
revoke all on public.balance_sheet_reports from anon, authenticated;
grant select, insert, delete on public.balance_sheet_reports to authenticated;   -- no update: a report is never edited

-- What has to be removed: reports past their 90 days, and files in the bucket that no report points at
-- (left behind by a failed upload, a deleted account or a removed guest account). Files younger than a day
-- are left alone so an upload in progress is never removed.
create or replace function public.balance_sheet_purge_list()
returns table (reason text, report_id uuid, file_path text)
language sql stable security definer set search_path = ''
as $$
  select 'expired'::text, r.id, r.file_path
    from public.balance_sheet_reports r
   where r.expires_at <= now()
  union all
  select 'orphan'::text, null::uuid, o.name
    from storage.objects o
   where o.bucket_id = 'balance-sheets'
     and o.created_at < now() - interval '1 day'
     and not exists (select 1 from public.balance_sheet_reports r where r.file_path = o.name)
   limit 1000;
$$;
revoke execute on function public.balance_sheet_purge_list() from public, anon, authenticated;
grant execute on function public.balance_sheet_purge_list() to service_role;

-- Leads from this tool.
alter table public.business_leads drop constraint if exists business_leads_source_check;
alter table public.business_leads add constraint business_leads_source_check
  check (source in ('readiness-tool','eligibility-check','issue-size-calculator','issue-cost-estimator','sme-ipo-checklist','book-call','business-hub','balance-sheet-check'));

-- Every night at 02:55 IST.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-purge-balance-sheets') then
    perform cron.unschedule('ipobell-purge-balance-sheets');
  end if;
end $$;
select cron.schedule(
  'ipobell-purge-balance-sheets',
  '25 21 * * *',
  $$ select private.invoke_edge_function('purge-balance-sheets', '{}'::jsonb); $$
);
