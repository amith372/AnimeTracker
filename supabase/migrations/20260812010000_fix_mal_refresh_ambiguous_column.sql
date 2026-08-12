-- Fixes a hard failure in mal_refresh_token_if_needed (20260807000002_mal_accounts.sql): every call
-- raised `column reference "access_token" is ambiguous` (SQLSTATE 42702), which meant *every*
-- MAL-proxying Edge Function failed at getValidMalAccessToken before doing any work at all —
-- mal-import, mal-push, and mal-monthly-sync alike.
--
-- Cause: the function is declared `returns table(access_token text, mal_linked boolean)`, and a
-- RETURNS TABLE column is a PL/pgSQL variable inside the body. public.mal_accounts also has an
-- `access_token` column, so the unqualified references in the initial SELECT and in the UPDATE's
-- RETURNING clause matched both a variable and a column, and plpgsql's default variable_conflict
-- setting is to raise rather than guess.
--
-- Fix: alias the table (`ma`) and qualify every column reference through it. The function's
-- signature, return shape, locking behavior and grants are all deliberately unchanged — callers
-- (supabase/functions/_shared/malAuth.ts) still read `access_token` / `mal_linked` off the row.
-- Kept as a separate migration rather than an edit to 20260807000002 so already-migrated projects
-- pick the fix up; `create or replace` makes it correct for fresh ones too.
create or replace function public.mal_refresh_token_if_needed(p_user_id uuid, p_client_id text)
returns table(access_token text, mal_linked boolean)
language plpgsql
as $$
declare
  v_refresh_token text;
  v_expires_at timestamptz;
  v_access_token text;
  v_body text;
  v_response extensions.http_response;
  v_json jsonb;
begin
  select ma.access_token, ma.refresh_token, ma.access_token_expires_at
  into v_access_token, v_refresh_token, v_expires_at
  from public.mal_accounts ma
  where ma.user_id = p_user_id
  for update;

  if not found then
    return query select null::text, false;
    return;
  end if;

  -- Same 5-minute margin as authRepository.ts's REFRESH_MARGIN_MS, so a token can't expire while a
  -- request built from this value is still in flight.
  if v_expires_at > now() + interval '5 minutes' then
    return query select v_access_token, true;
    return;
  end if;

  v_body := 'client_id=' || public.url_encode(p_client_id)
    || '&grant_type=refresh_token'
    || '&refresh_token=' || public.url_encode(v_refresh_token);

  select * into v_response
  from extensions.http_post(
    'https://myanimelist.net/v1/oauth2/token',
    v_body,
    'application/x-www-form-urlencoded'
  );

  if v_response.status = 400 or v_response.status = 401 then
    -- Dead refresh token, same as authRepository.ts's isDeadRefreshToken — MAL will never accept it
    -- again, so drop the link entirely rather than leaving a row that looks linked but can't be
    -- used. The user has to re-link from the client.
    delete from public.mal_accounts ma where ma.user_id = p_user_id;
    return query select null::text, false;
    return;
  end if;

  if v_response.status < 200 or v_response.status >= 300 then
    -- Transient (5xx / network-shaped) failure — same "don't log anyone out over this" rule as the
    -- client-side refresh had. Surface as a failure to the caller without touching the stored row.
    raise exception 'MAL token refresh failed (HTTP %)', v_response.status;
  end if;

  v_json := v_response.content::jsonb;

  update public.mal_accounts ma
  set access_token = v_json->>'access_token',
      refresh_token = v_json->>'refresh_token',
      access_token_expires_at = now() + make_interval(secs => (v_json->>'expires_in')::numeric)
  where ma.user_id = p_user_id
  returning ma.access_token into v_access_token;

  return query select v_access_token, true;
end;
$$;

revoke execute on function public.mal_refresh_token_if_needed(uuid, text) from public, anon, authenticated;
grant execute on function public.mal_refresh_token_if_needed(uuid, text) to service_role;
