-- Peer data for the valuation range and "compare my company" tools (14 Nov 2026).
--
-- public.sector_peers(sector) lists the IPOs the team has tagged with that sector, each with the ratios the feed
-- reports (P/E, margins, returns, debt/equity) and the figures of its latest full financial year. The app works
-- out medians and ranges from these rows; nothing is averaged or estimated here.
-- Ratios are stored by the feed as text ("13.03", "34.09%"); private.kpi_number() reads the number or gives NULL.

create or replace function private.kpi_number(p_kpis jsonb, p_key text)
returns numeric
language sql immutable set search_path = ''
as $$
  select case
           when v ~ '^-?[0-9]+(\.[0-9]+)?$' then v::numeric
           else null
         end
    from (
      select replace(replace(btrim(coalesce((select k ->> 'value' from jsonb_array_elements(case when jsonb_typeof(p_kpis) = 'array' then p_kpis else '[]'::jsonb end) k where k ->> 'key' = p_key limit 1), '')), '%', ''), ',', '') as v
    ) t;
$$;

create or replace function public.sector_peers(p_sector text)
returns table (
  slug text, name text, board text, status text, listing_date date, issue_size_cr numeric,
  pe numeric, pat_margin numeric, roce numeric, ronw numeric, debt_equity numeric,
  period text, revenue numeric, profit numeric, net_worth numeric, total_borrowing numeric
)
language sql stable security definer set search_path = ''
as $$
  select i.slug, coalesce(i.display_name, i.name), i.board, i.status, i.listing_date, i.issue_size_cr,
         private.kpi_number(i.kpis, 'pe'), private.kpi_number(i.kpis, 'pat_margin'), private.kpi_number(i.kpis, 'roce'),
         private.kpi_number(i.kpis, 'ronw'), private.kpi_number(i.kpis, 'debt_equity'),
         f.period, coalesce(f.revenue, f.total_income), f.profit, f.net_worth, f.total_borrowing
    from public.ipo_admin_data d
    join public.ipos i on i.id = d.ipo_id
    left join lateral (
      -- latest full financial year (period ending 31 March); a newer part-year is skipped
      select x.period, x.revenue, x.total_income, x.profit, x.net_worth, x.total_borrowing
        from public.ipo_financials x
       where x.ipo_id = i.id and x.period ~* '(^|[^0-9])31\s*(st)?\s*mar|mar(ch)?\.?\s*31'
       order by x.period_order asc
       limit 1
    ) f on true
   where d.sector = p_sector
   order by i.listing_date desc nulls last, i.slug
   limit 200;
$$;
revoke execute on function private.kpi_number(jsonb, text) from public, anon, authenticated;
revoke execute on function public.sector_peers(text) from public;
grant execute on function public.sector_peers(text) to anon, authenticated;
