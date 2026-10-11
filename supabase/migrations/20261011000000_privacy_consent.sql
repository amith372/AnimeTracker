-- Plan 1 step 5½: one-time privacy consent per account.
--
-- A column on user_library_meta rather than a table of its own: that's already the singleton
-- row-per-account (20260812000000_direct_postgres.sql), it's already read on every cold start by
-- the Library's onboarding gate, and the consent check has to run *before* the app opens. Riding
-- the existing row means the gate costs no extra round trip — which matters here specifically,
-- since there is no local database and every read is a real network hop (see CLAUDE.md's "What
-- this is").
--
-- Null means "not consented yet", which is exactly what an existing account's row says today
-- without a backfill — so existing accounts see the notice once on next launch, which is the
-- intended behaviour, not a migration gap. Deliberately not `not null default now()`: defaulting
-- it would record consent nobody ever gave.
--
-- No new policy or grant: the owner-all policy and the select/insert/update grants on
-- user_library_meta already cover this column, and the deliberate absence of a delete grant for
-- `authenticated` still holds (a client may supersede this row, never remove it).
alter table public.user_library_meta
  add column if not exists privacy_consented_at timestamptz;
