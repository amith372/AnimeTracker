-- Fixes a gap in 20260807000000_series_schema.sql: RLS policies restrict *which rows* a role can
-- see, but Postgres also requires a base table-level GRANT before a role can touch a table at all.
-- Supabase's dashboard table editor grants this automatically; a table created via raw SQL (as
-- these were) does not, which is why `series`/`series_entries` returned "permission denied for
-- table series" even with RLS policies in place and a signed-in user. Not granted to `anon` — the
-- app never expects a signed-out request to touch user data, and RLS would deny it anyway, so no
-- reason to give the anon role standing access.
grant select, insert, update, delete on public.series to authenticated;
grant select, insert, update, delete on public.series_entries to authenticated;
