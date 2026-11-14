-- Minimal stand-ins for the Supabase platform, for LOCAL TESTING ONLY.
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create schema vault; create schema cron; create schema net; create schema storage;
grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(), email text, is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb, raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text) $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as
  $$ insert into vault.secrets (name, secret) values (new_name, new_secret) returning id $$;

create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
  $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
     on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create function cron.unschedule(job_name text) returns boolean language plpgsql as
  $$ begin delete from cron.job where jobname = job_name; if not found then raise exception 'could not find valid entry for job %', job_name; end if; return true; end $$;

-- net: records requests instead of sending them; tests fill in responses by hand.
create table net.http_request_queue (id bigserial primary key, url text, headers jsonb, body jsonb, timeout_milliseconds int, created timestamptz default now());
create table net._http_response (id bigint primary key, status_code int, content_type text, headers jsonb, content text, timed_out boolean, error_msg text, created timestamptz not null default now());
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds int default 5000)
  returns bigint language sql as $$ insert into net.http_request_queue (url, headers, body, timeout_milliseconds) values (url, headers, body, timeout_milliseconds) returning id $$;

create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create publication supabase_realtime;
