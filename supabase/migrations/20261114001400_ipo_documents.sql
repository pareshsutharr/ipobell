-- DRHP / RHP / prospectus files uploaded by the team, with their text page by page (14 Nov 2026).
--
-- The feed only links to offer documents on other sites. Staff now upload the PDF itself in the admin panel.
-- The text of every page is stored so summaries can be drafted from it and, later, questions can be answered
-- with a page reference.
--
--   storage bucket `ipo-documents`  the PDF (public read: these are public offer documents; admins write)
--   public.ipo_documents_admin      one row per uploaded file: type, version, where it is, how extraction went
--   public.ipo_document_pages       the text of each page (admins and the service role only; the app does not
--                                   read raw page text, so it cannot be copied in bulk with the public key)
--
-- Uploading a new file of the same type for the same IPO creates the next version and becomes the current one.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ipo-documents', 'ipo-documents', true, 52428800, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ipo-documents bucket: public read" on storage.objects;
drop policy if exists "ipo-documents bucket: admins insert" on storage.objects;
drop policy if exists "ipo-documents bucket: admins update" on storage.objects;
drop policy if exists "ipo-documents bucket: admins delete" on storage.objects;
create policy "ipo-documents bucket: public read" on storage.objects for select to anon, authenticated using (bucket_id = 'ipo-documents');
create policy "ipo-documents bucket: admins insert" on storage.objects for insert to authenticated with check (bucket_id = 'ipo-documents' and public.is_admin());
create policy "ipo-documents bucket: admins update" on storage.objects for update to authenticated using (bucket_id = 'ipo-documents' and public.is_admin());
create policy "ipo-documents bucket: admins delete" on storage.objects for delete to authenticated using (bucket_id = 'ipo-documents' and public.is_admin());

create table if not exists public.ipo_documents_admin (
  id            uuid primary key default gen_random_uuid(),
  ipo_id        uuid not null references public.ipos (id) on delete cascade,
  doc_type      text not null check (doc_type in ('drhp','rhp','prospectus')),
  version       integer not null default 0,                 -- set by trigger: 1, 2, 3 … per IPO and type
  is_current    boolean not null default true,              -- the newest version of this type for this IPO
  file_path     text not null check (file_path ~ '^[a-z0-9/_.-]+\.pdf$' and char_length(file_path) <= 200),   -- path inside the bucket
  file_name     text not null check (char_length(file_name) between 1 and 200),                               -- the name it was uploaded with
  file_size     bigint not null check (file_size > 0 and file_size <= 52428800),
  page_count    integer check (page_count is null or page_count between 1 and 5000),
  pages_with_text integer check (pages_with_text is null or pages_with_text >= 0),
  text_status   text not null default 'pending' check (text_status in ('pending','extracting','done','failed')),
  text_error    text check (text_error is null or char_length(text_error) <= 500),
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (ipo_id, doc_type, version)
);
create index if not exists ipo_documents_admin_ipo_idx on public.ipo_documents_admin (ipo_id, doc_type, version desc);
create unique index if not exists ipo_documents_admin_one_current on public.ipo_documents_admin (ipo_id, doc_type) where is_current;
drop trigger if exists ipo_documents_admin_set_updated_at on public.ipo_documents_admin;
create trigger ipo_documents_admin_set_updated_at before update on public.ipo_documents_admin
  for each row execute function public.set_updated_at();

-- Number the versions and keep exactly one "current" file per IPO and type.
create or replace function public.ipo_documents_admin_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- one upload at a time per IPO and type, so two simultaneous uploads cannot take the same version number
  perform pg_advisory_xact_lock(hashtextextended(new.ipo_id::text || ':' || new.doc_type, 0));
  select coalesce(max(d.version), 0) + 1 into new.version from public.ipo_documents_admin d where d.ipo_id = new.ipo_id and d.doc_type = new.doc_type;
  update public.ipo_documents_admin d set is_current = false where d.ipo_id = new.ipo_id and d.doc_type = new.doc_type and d.is_current;
  new.is_current := true;
  if (select auth.uid()) is not null then new.uploaded_by := (select auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.ipo_documents_admin_version() from public, anon, authenticated;
drop trigger if exists ipo_documents_admin_version on public.ipo_documents_admin;
create trigger ipo_documents_admin_version before insert on public.ipo_documents_admin
  for each row execute function public.ipo_documents_admin_version();

-- Deleting the current file makes the newest remaining version current again.
create or replace function public.ipo_documents_admin_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.is_current then
    update public.ipo_documents_admin d set is_current = true
     where d.id = (select x.id from public.ipo_documents_admin x where x.ipo_id = old.ipo_id and x.doc_type = old.doc_type order by x.version desc limit 1);
  end if;
  return old;
end;
$$;
revoke execute on function public.ipo_documents_admin_after_delete() from public, anon, authenticated;
drop trigger if exists ipo_documents_admin_after_delete on public.ipo_documents_admin;
create trigger ipo_documents_admin_after_delete after delete on public.ipo_documents_admin
  for each row execute function public.ipo_documents_admin_after_delete();

create table if not exists public.ipo_document_pages (
  document_id  uuid not null references public.ipo_documents_admin (id) on delete cascade,
  page_no      integer not null check (page_no between 1 and 5000),
  text         text not null default '' check (char_length(text) <= 60000),
  primary key (document_id, page_no)
);

alter table public.ipo_documents_admin enable row level security;
alter table public.ipo_document_pages enable row level security;
drop policy if exists "ipo_documents_admin: public read" on public.ipo_documents_admin;
drop policy if exists "ipo_documents_admin: admins read all" on public.ipo_documents_admin;
drop policy if exists "ipo_documents_admin: admins insert" on public.ipo_documents_admin;
drop policy if exists "ipo_documents_admin: admins update" on public.ipo_documents_admin;
drop policy if exists "ipo_documents_admin: admins delete" on public.ipo_documents_admin;
drop policy if exists "ipo_document_pages: admins read" on public.ipo_document_pages;
drop policy if exists "ipo_document_pages: admins insert" on public.ipo_document_pages;
drop policy if exists "ipo_document_pages: admins update" on public.ipo_document_pages;
drop policy if exists "ipo_document_pages: admins delete" on public.ipo_document_pages;
-- The app lists a document only once its file is fully uploaded and read. Admins see every row (a separate policy,
-- for signed-in users only: signed-out visitors are not allowed to call is_admin()).
create policy "ipo_documents_admin: public read" on public.ipo_documents_admin for select to anon, authenticated using (text_status = 'done');
create policy "ipo_documents_admin: admins read all" on public.ipo_documents_admin for select to authenticated using (public.is_admin());
create policy "ipo_documents_admin: admins insert" on public.ipo_documents_admin for insert to authenticated with check (public.is_admin());
create policy "ipo_documents_admin: admins update" on public.ipo_documents_admin for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ipo_documents_admin: admins delete" on public.ipo_documents_admin for delete to authenticated using (public.is_admin());
create policy "ipo_document_pages: admins read" on public.ipo_document_pages for select to authenticated using (public.is_admin());
create policy "ipo_document_pages: admins insert" on public.ipo_document_pages for insert to authenticated with check (public.is_admin());
create policy "ipo_document_pages: admins update" on public.ipo_document_pages for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "ipo_document_pages: admins delete" on public.ipo_document_pages for delete to authenticated using (public.is_admin());

revoke all on public.ipo_documents_admin, public.ipo_document_pages from anon, authenticated;
grant select on public.ipo_documents_admin to anon, authenticated;
grant insert, update, delete on public.ipo_documents_admin to authenticated;          -- admins only, by policy
grant select, insert, update, delete on public.ipo_document_pages to authenticated;   -- admins only, by policy
