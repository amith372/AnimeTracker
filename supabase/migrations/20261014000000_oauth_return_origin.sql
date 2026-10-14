-- Plan 7 / prd/4-dev-oauth-origin.md — let a web OAuth flow finish on the origin it started from.
--
-- mal-oauth-callback redirects the popup to `${SITE_URL}/oauth-complete`, which is fixed at deploy
-- time. The popup then postMessages its result to window.opener targeting its own origin, and the
-- opener drops anything from another one — so a flow started on a local dev server finishes on the
-- deployed site and its message is never delivered. MAL authorizes, the popup closes, nothing
-- happens, and there is no error anywhere to find it by.
--
-- The row already carries `platform` and `code_verifier` across this exact round trip; the origin
-- is the third thing that has to survive it.
--
-- Nullable and no default, deliberately: a null means "use SITE_URL", which is precisely today's
-- behaviour, so in-flight rows and every non-allowlisted caller keep working unchanged. The column
-- is only ever written with an origin that passed the allowlist in
-- supabase/functions/_shared/oauthOrigin.ts — never with the raw Origin header, which any
-- non-browser client can set to whatever it likes.
alter table public.mal_oauth_sessions
  add column if not exists return_origin text;

comment on column public.mal_oauth_sessions.return_origin is
  'Allowlisted origin to return the web OAuth popup to. Null means fall back to the SITE_URL secret. Only ever written by mal-oauth-start after validation; see supabase/functions/_shared/oauthOrigin.ts.';
