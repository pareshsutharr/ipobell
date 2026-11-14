-- Lead e-mail notifications (29 Oct 2026).
-- Every business_leads insert (readiness score, eligibility, issue size/cost, checklist, book-a-call, hub form)
-- calls the `notify-lead` Edge Function through pg_net, which e-mails the full lead to the addresses in
-- app_settings.lead_notifications (default beipoready@gmail.com). Super admins edit the list in the admin panel.

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description)
values ('lead_notifications', '{"enabled": true, "emails": ["beipoready@gmail.com"]}'::jsonb,
        'Who gets an e-mail when an app user submits a business lead.')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
create policy "settings: admins read"   on public.app_settings for select to authenticated using (public.is_admin());
create policy "settings: super write"   on public.app_settings for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "settings: super insert"  on public.app_settings for insert to authenticated with check (public.is_super_admin());
grant select, insert, update on public.app_settings to authenticated;

alter table public.business_leads
  add column if not exists notified_at  timestamptz,
  add column if not exists notify_error text;

-- Fire-and-forget: the function does the e-mailing and stamps notified_at / notify_error on the row.
create or replace function private.notify_business_lead()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    perform private.invoke_edge_function('notify-lead', jsonb_build_object('lead_id', new.id));
  exception when others then
    -- vault / pg_net not configured: keep the row, the lead is still visible in the admin panel
    null;
  end;
  return new;
end;
$$;
drop trigger if exists business_leads_notify on public.business_leads;
create trigger business_leads_notify after insert on public.business_leads
  for each row execute function private.notify_business_lead();

comment on table public.app_settings is 'Small key/value store for admin-editable settings (lead notification recipients, …).';
