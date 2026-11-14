-- Custom notification filters (14 Nov 2026): board, sector and issue size.
--
-- A user can narrow which IPOs they hear about. The filters are applied where recipients are chosen
-- (private.notification_recipients), so every sender (sync-ipos, daily-reminders, send-notifications) follows
-- them without code changes.
--
-- Rules:
--   - No filter set (the default, and every existing user) = exactly the behaviour before this migration.
--   - An IPO on the user's watchlist always gets through: they starred it themselves.
--   - A fact that is not known yet never blocks an alert: an IPO with no sector entered, or no issue size
--     announced, still passes that filter. Missing data must not silently swallow alerts.

alter table public.notification_preferences
  add column if not exists filter_board         text check (filter_board is null or filter_board in ('sme','mainboard')),
  add column if not exists filter_sectors       text[] check (filter_sectors is null or (cardinality(filter_sectors) <= 20)),
  add column if not exists filter_min_issue_cr  numeric(14,2) check (filter_min_issue_cr is null or filter_min_issue_cr >= 0),
  add column if not exists filter_max_issue_cr  numeric(14,2) check (filter_max_issue_cr is null or filter_max_issue_cr >= 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_preferences_issue_range') then
    alter table public.notification_preferences add constraint notification_preferences_issue_range
      check (filter_min_issue_cr is null or filter_max_issue_cr is null or filter_min_issue_cr <= filter_max_issue_cr);
  end if;
end $$;

comment on column public.notification_preferences.filter_board is 'Only this board (sme / mainboard). NULL = both.';
comment on column public.notification_preferences.filter_sectors is 'Only these sectors (names from the admin sector list). NULL or empty = all.';
comment on column public.notification_preferences.filter_min_issue_cr is 'Only issues of at least this size, in Rs crore. NULL = no lower limit.';
comment on column public.notification_preferences.filter_max_issue_cr is 'Only issues of at most this size, in Rs crore. NULL = no upper limit.';

-- Does one IPO pass one user's filters? Kept as its own function so it can be tested directly.
create or replace function private.ipo_passes_filters(
  p_filter_board text, p_filter_sectors text[], p_filter_min numeric, p_filter_max numeric,
  p_board text, p_sector text, p_issue_size_cr numeric
) returns boolean
language sql immutable set search_path = ''
as $$
  select (p_filter_board is null or p_board = p_filter_board)
     and (p_filter_sectors is null or cardinality(p_filter_sectors) = 0 or p_sector is null or p_sector = any (p_filter_sectors))
     and (p_filter_min is null or p_issue_size_cr is null or p_issue_size_cr >= p_filter_min)
     and (p_filter_max is null or p_issue_size_cr is null or p_issue_size_cr <= p_filter_max);
$$;

create or replace function private.notification_recipients(p_type text, p_ipo_id uuid)
returns table (user_id uuid, fcm_token text, platform text)
language sql
stable
security definer
set search_path = ''
as $$
  select dt.user_id, dt.fcm_token, dt.platform
  from public.device_tokens dt
  join public.notification_preferences np on np.user_id = dt.user_id
  left join public.profiles p on p.id = dt.user_id
  left join public.ipos i on i.id = p_ipo_id
  left join public.ipo_admin_data ad on ad.ipo_id = p_ipo_id
  where dt.last_seen_at > now() - interval '120 days'
    and case p_type
          when 'new_ipo'                then np.new_ipo
          when 'opens_today'            then np.opens_today
          when 'closes_today'           then np.closes_today
          when 'closing_soon'           then np.closing_soon
          when 'allotment'              then np.allotment
          when 'allotment_tomorrow'     then np.allotment
          when 'allotment_result'       then np.allotment
          when 'refund'                 then np.refund_demat
          when 'demat_credit'           then np.refund_demat
          when 'listing_today'          then np.listing
          when 'listing_tomorrow'       then np.listing
          when 'listed'                 then np.listing
          when 'subscription_milestone' then np.subscription_milestone
          when 'gmp_change'             then np.gmp_change
          else true
        end
    -- only-watchlist mode, and GMP alerts are always watchlist-scoped
    and (
      p_ipo_id is null
      or (not np.only_watchlist and p_type <> 'gmp_change')
      or exists (select 1 from public.watchlist w where w.user_id = dt.user_id and w.ipo_id = p_ipo_id)
    )
    -- board / sector / issue-size filters; a watchlisted IPO always passes
    and (
      p_ipo_id is null
      or i.id is null
      or exists (select 1 from public.watchlist w where w.user_id = dt.user_id and w.ipo_id = p_ipo_id)
      or private.ipo_passes_filters(np.filter_board, np.filter_sectors, np.filter_min_issue_cr, np.filter_max_issue_cr, i.board, ad.sector, i.issue_size_cr)
    );
$$;
