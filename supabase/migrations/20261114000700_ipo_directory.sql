-- State-wise view support (14 Nov 2026).
--
-- public.ipo_directory = the IPO list columns the app already reads, plus the team-entered state, sector, industry
-- and listing platform from public.ipo_admin_data. One place to filter and page by state or sector.
-- security_invoker: the view adds no access of its own; both underlying tables are already public-read.
-- An IPO with nothing entered has state / sector NULL; clients show that as "Not specified".

create or replace view public.ipo_directory
with (security_invoker = true)
as
select
  i.id, i.slug, i.name, i.display_name, i.board, i.sub_type, i.status, i.dates_tba, i.is_listed, i.logo_url,
  i.open_date, i.close_date, i.allotment_date, i.listing_date,
  i.price_band, i.price_min, i.price_max, i.issue_price, i.issue_size_cr, i.lot_size, i.min_investment,
  i.gmp, i.gmp_percent, i.gmp_expected_price, i.gmp_updated_at,
  i.sub_total, i.sub_retail, i.sub_nii, i.sub_qib, i.sub_updated_at,
  i.listing_price, i.listing_gain_percent, i.cmp, i.current_gain_percent, i.registrar,
  d.state, d.sector, d.industry, d.listing_platform
from public.ipos i
left join public.ipo_admin_data d on d.ipo_id = i.id;

comment on view public.ipo_directory is 'IPO list columns plus team-entered state / sector / industry / listing platform (NULL = not entered).';
grant select on public.ipo_directory to anon, authenticated;

-- How many IPOs each state has, split by status. The NULL-state row counts IPOs with no state entered.
create or replace function public.ipo_state_counts(p_board text default null)
returns table (state text, total bigint, open bigint, upcoming bigint, closed bigint, listed bigint)
language sql stable security invoker set search_path = ''
as $$
  select d.state,
         count(*),
         count(*) filter (where d.status = 'open'),
         count(*) filter (where d.status = 'upcoming'),
         count(*) filter (where d.status = 'closed'),
         count(*) filter (where d.status = 'listed')
    from public.ipo_directory d
   where p_board is null or d.board = p_board
   group by d.state
   order by d.state nulls last;
$$;
grant execute on function public.ipo_state_counts(text) to anon, authenticated;
