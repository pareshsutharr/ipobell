-- Mark the leftovers of the removed Premium tier as unused (14 Nov 2026). Comments only: no data or behaviour changes.
-- They are kept because released app versions still select profiles.*; drop them in a later migration once
-- no supported app version reads these columns.
comment on table public.purchases is 'UNUSED since 27 Oct 2026 (Premium tier removed). Nothing reads or writes this table.';
comment on column public.profiles.is_premium is 'UNUSED since 27 Oct 2026 (Premium tier removed). Always false.';
comment on column public.profiles.premium_until is 'UNUSED since 27 Oct 2026 (Premium tier removed).';
comment on column public.profiles.premium_product_id is 'UNUSED since 27 Oct 2026 (Premium tier removed).';
