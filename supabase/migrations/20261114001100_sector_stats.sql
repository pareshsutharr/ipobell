-- Sector view (14 Nov 2026): per sector, how many IPOs and how the listed ones did.
-- Sector is entered by the team (public.ipo_admin_data); IPOs with none are the NULL-sector row ("Not specified").
-- Averages use only IPOs that have the figure; a sector with no listed IPO has NULL averages, not zero.

create or replace function public.ipo_sector_stats(p_board text default null)
returns table (
  sector text, total bigint, open bigint, upcoming bigint, closed bigint, listed bigint,
  avg_listing_gain numeric, listed_above_issue bigint, listed_with_price bigint,
  avg_subscription numeric, total_raised_cr numeric
)
language sql stable security invoker set search_path = ''
as $$
  select d.sector,
         count(*),
         count(*) filter (where d.status = 'open'),
         count(*) filter (where d.status = 'upcoming'),
         count(*) filter (where d.status = 'closed'),
         count(*) filter (where d.status = 'listed'),
         round(avg(d.listing_gain_percent) filter (where d.status = 'listed' and d.listing_price is not null and d.issue_price is not null), 2),
         count(*) filter (where d.status = 'listed' and d.listing_price is not null and d.issue_price is not null and d.listing_gain_percent > 0),
         count(*) filter (where d.status = 'listed' and d.listing_price is not null and d.issue_price is not null),
         round(avg(d.sub_total) filter (where d.sub_total is not null), 2),
         round(sum(d.issue_size_cr), 2)
    from public.ipo_directory d
   where p_board is null or d.board = p_board
   group by d.sector
   order by d.sector nulls last;
$$;
grant execute on function public.ipo_sector_stats(text) to anon, authenticated;
