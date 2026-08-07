-- Fixes the same gap the Phase 7 grants migration fixed for series/series_entries, this time for
-- Phase 8's tables: service_role bypasses RLS, but Postgres still requires a base table-level
-- GRANT before any role can touch a table at all — RLS bypass and table grants are separate
-- mechanisms. Confirmed live: mal-oauth-start's insert into mal_oauth_sessions failed with
-- "permission denied for table mal_oauth_sessions" even running as service_role, because these
-- tables were only ever RLS-enabled, never explicitly granted to service_role.
grant select, insert, update, delete on public.mal_accounts to service_role;
grant select, insert, update, delete on public.mal_oauth_sessions to service_role;
grant select, insert, update, delete on public.mal_session_handoffs to service_role;
