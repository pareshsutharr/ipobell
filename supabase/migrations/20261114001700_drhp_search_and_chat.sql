-- Ask-the-DRHP: search over the stored page text, and the question log (14 Nov 2026).
--
-- Search is PostgreSQL full-text search over public.ipo_document_pages, one result per page, so every answer can
-- name the page it came from. The `ask-drhp` Edge Function turns a question into search terms (including the
-- words offer documents use for the same thing, e.g. "where will the money go" → "objects of the issue"), calls
-- public.search_document_pages, and gives the matching pages to the model.
--
-- No embeddings / pgvector here: keyword search needs no extra service or cost, is tested end to end, and page
-- level results are what a citation needs. Semantic search can be added later behind the same function.

alter table public.ipo_document_pages
  add column if not exists tsv tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored;
create index if not exists ipo_document_pages_tsv_idx on public.ipo_document_pages using gin (tsv);

-- The document questions are answered from: the newest stage the team has uploaded and read.
create or replace function private.answer_document(p_ipo_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select d.id
    from public.ipo_documents_admin d
   where d.ipo_id = p_ipo_id and d.is_current and d.text_status = 'done'
   order by case d.doc_type when 'prospectus' then 0 when 'rhp' then 1 else 2 end, d.version desc
   limit 1;
$$;

-- Pages of an IPO's offer document that best match the search terms.
--   p_terms    free text; a page matches if it contains ANY of the words (after stemming)
--   p_phrases  exact phrases; each one found on a page lifts that page (this is what makes "objects of the issue"
--              beat a page that merely mentions "issue" many times)
-- Returns the page text (capped) so the caller needs no second query.
create or replace function public.search_document_pages(p_ipo_id uuid, p_terms text, p_phrases text[] default '{}', p_limit integer default 8)
returns table (document_id uuid, doc_type text, doc_version integer, page_no integer, score real, text text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_doc uuid := private.answer_document(p_ipo_id);
  v_query tsquery;
  v_words text;
begin
  if v_doc is null then return; end if;
  -- OR together the stemmed words of the question. (plainto_tsquery would AND them, and a natural question
  -- rarely has all its words on one page.)
  select string_agg(quote_literal(w), ' | ') into v_words
    from unnest(tsvector_to_array(to_tsvector('english', left(coalesce(p_terms, ''), 2000)))) as w;
  if v_words is null then return; end if;
  v_query := to_tsquery('english', v_words);

  return query
  select d.id, d.doc_type, d.version, p.page_no,
         (ts_rank_cd(p.tsv, v_query, 32)
           + 0.6 * (select count(*) from unnest(coalesce(p_phrases, '{}'))  as ph
                     where char_length(ph) between 3 and 80 and p.tsv @@ phraseto_tsquery('english', ph)))::real as score,
         left(p.text, 7000)
    from public.ipo_document_pages p
    join public.ipo_documents_admin d on d.id = p.document_id
   where p.document_id = v_doc
     and char_length(p.text) >= 200            -- covers and blank pages cannot answer anything
     and (p.tsv @@ v_query
          or exists (select 1 from unnest(coalesce(p_phrases, '{}')) as ph where char_length(ph) between 3 and 80 and p.tsv @@ phraseto_tsquery('english', ph)))
   order by score desc, p.page_no
   limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;
revoke execute on function private.answer_document(uuid) from public, anon, authenticated;
revoke execute on function public.search_document_pages(uuid, text, text[], integer) from public, anon, authenticated;
grant execute on function public.search_document_pages(uuid, text, text[], integer) to service_role;

-- Can questions be asked about this IPO? (The app shows the entry point only when true.)
create or replace function public.ipo_has_answer_document(p_ipo_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.answer_document(p_ipo_id) is not null; $$;
revoke execute on function public.ipo_has_answer_document(uuid) from public;
grant execute on function public.ipo_has_answer_document(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Question log: one row per question. It is the daily limit counter, the cache of repeated questions, and the
-- record the team reads to see what people ask. Written only by the Edge Function (service role).
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.drhp_chat_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete set null,
  ipo_id        uuid not null references public.ipos (id) on delete cascade,
  document_id   uuid references public.ipo_documents_admin (id) on delete set null,
  question      text not null check (char_length(question) between 1 and 500),
  question_key  text not null,                    -- normalised question, for the cache
  answer        text check (answer is null or char_length(answer) <= 6000),
  pages         integer[] not null default '{}',  -- pages cited
  found         boolean not null default false,   -- the document had an answer
  intent        text,                             -- eligibility / cost / readiness, when the question is a business owner's
  cached        boolean not null default false,   -- served from an earlier identical question
  outcome       text not null default 'answered' check (outcome in ('answered','not_found','refused','error')),
  created_at    timestamptz not null default now()
);
create index if not exists drhp_chat_log_user_day_idx on public.drhp_chat_log (user_id, created_at desc);
create index if not exists drhp_chat_log_cache_idx on public.drhp_chat_log (document_id, question_key, created_at desc) where outcome in ('answered','not_found') and not cached;
create index if not exists drhp_chat_log_ipo_idx on public.drhp_chat_log (ipo_id, created_at desc);

alter table public.drhp_chat_log enable row level security;
drop policy if exists "chat_log: read own" on public.drhp_chat_log;
drop policy if exists "chat_log: admins read" on public.drhp_chat_log;
create policy "chat_log: read own" on public.drhp_chat_log for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_log: admins read" on public.drhp_chat_log for select to authenticated using (public.is_admin());
revoke all on public.drhp_chat_log from anon, authenticated;
grant select on public.drhp_chat_log to authenticated;   -- own rows, or all for admins, by policy; no client can write

-- Keep one year.
create or replace function private.prune_drhp_chat_log() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.drhp_chat_log where created_at < now() - interval '1 year';
  get diagnostics n = row_count;
  return n;
end $$;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ipobell-prune-chat-log') then
    perform cron.unschedule('ipobell-prune-chat-log');
  end if;
end $$;
select cron.schedule('ipobell-prune-chat-log', '55 21 * * 0', $$ select private.prune_drhp_chat_log(); $$);
