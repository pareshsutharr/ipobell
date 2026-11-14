-- Business rules editable without an app release (14 Nov 2026).
--
-- The calculators in the app (issue size, issue cost, eligibility) used numbers compiled into the app: sector
-- P/E multiples, growth premium, cost line items, eligibility limits. Those change with the market and with
-- SEBI / exchange circulars, and every change needed a new build. They now live here; the admin panel edits
-- them and the app reads them.
--
-- Safety: the app keeps a bundled copy and validates every value it reads. A value that is missing, malformed
-- or implausible is ignored for that key and the bundled number is used, so a mistake here cannot break a
-- calculator. Everyone can read; only super admins can write.
-- The seed below is the app's bundled values on 14 Nov 2026 (app/src/__tests__/business-rules.test.ts checks
-- the two stay identical).

create table if not exists public.business_rules (
  key          text primary key check (key in ('sector_pe','growth_premium','issue_size','issue_cost','eligibility')),
  value        jsonb not null check (jsonb_typeof(value) in ('object','array') and pg_column_size(value) < 16384),
  description  text,
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

create or replace function public.business_rules_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if (select auth.uid()) is not null then new.updated_by := (select auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.business_rules_stamp() from public, anon, authenticated;
drop trigger if exists business_rules_stamp on public.business_rules;
create trigger business_rules_stamp before insert or update on public.business_rules
  for each row execute function public.business_rules_stamp();

alter table public.business_rules enable row level security;
drop policy if exists "business_rules: public read" on public.business_rules;
drop policy if exists "business_rules: super admins insert" on public.business_rules;
drop policy if exists "business_rules: super admins update" on public.business_rules;
create policy "business_rules: public read" on public.business_rules for select to anon, authenticated using (true);
create policy "business_rules: super admins insert" on public.business_rules for insert to authenticated with check (public.is_super_admin());
create policy "business_rules: super admins update" on public.business_rules for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.business_rules from anon, authenticated;
grant select on public.business_rules to anon, authenticated;
grant insert, update on public.business_rules to authenticated;   -- narrowed to super admins by the policies above

insert into public.business_rules (key, value, description) values
  ('sector_pe', '[{"sector":"IT / Software Services","pe":28},{"sector":"FMCG / Consumer Goods","pe":32},{"sector":"Pharma / Healthcare","pe":30},{"sector":"Manufacturing / Engineering","pe":15},{"sector":"Infrastructure / EPC","pe":12},{"sector":"Textile / Apparel","pe":12},{"sector":"Financial Services / NBFC","pe":18},{"sector":"Retail / E-commerce","pe":20},{"sector":"Agro / Food Processing","pe":14},{"sector":"Renewable Energy","pe":22},{"sector":"Chemicals / Specialty","pe":18},{"sector":"Other","pe":15}]'::jsonb, 'Sector P/E multiples used by the issue size calculator. Change the numbers only; the sector names are fixed.'),
  ('growth_premium', '[{"minCagrPct":30,"premiumPct":25},{"minCagrPct":20,"premiumPct":15},{"minCagrPct":10,"premiumPct":5}]'::jsonb, 'Growth premium tiers: revenue CAGR at or above minCagrPct adds premiumPct to the sector multiple.'),
  ('issue_size', '{"dilutionLowPct":20,"dilutionHighPct":30,"bandPct":10}'::jsonb, 'Public float range and valuation band assumed by the issue size calculator, in percent.'),
  ('issue_cost', '{"referenceIssueLakhs":3500,"items":[{"label":"Selling, Marketing and Underwriting Fees","lakhs":185,"hint":"Brokerage, syndicate and underwriting commission"},{"label":"BRLM Fees","lakhs":50,"hint":"Book running lead manager"},{"label":"Advertising & P.R. expenses","lakhs":50},{"label":"Registrars (Fees) + Postage and DP charges","lakhs":10},{"label":"Stock Exchange Fee & Other Misc. Charges","lakhs":10},{"label":"Market Making Fees","lakhs":30,"hint":"Mandatory for SME issues for 3 years post listing"},{"label":"Legal Counsel","lakhs":5},{"label":"Printing (Forms, Prospectus, Banners, posters etc)","lakhs":10}],"stages":[{"label":"Signing of Mandate","lakhs":10.75},{"label":"Completion of DRHP & Filing","lakhs":11.25},{"label":"On NSE Approval","lakhs":1},{"label":"On IPO Opening","lakhs":8},{"label":"On IPO Completion","lakhs":319}]}'::jsonb, 'Issue cost line items and payment stages, in Rs lakh, for a reference issue of referenceIssueLakhs. Items and stages must add up to the same total.'),
  ('eligibility', '{"smeCapitalMinCr":1,"smeCapitalMaxCr":25,"ofsMaxPct":20,"gcpMaxPct":15,"gcpMaxCr":10,"netWorthMinCr":1,"ntaMinCr":3,"leverageMax":3,"opProfitMinCr":1,"opProfitMinYears":2}'::jsonb, 'Numeric limits used by the eligibility check (Rs crore, percent, ratio, years).')
on conflict (key) do nothing;
