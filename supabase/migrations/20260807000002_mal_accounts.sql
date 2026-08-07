-- Phase 8: server-side MAL token custody. Everything here is service-role-only by default (RLS
-- enabled, no policies granting the `authenticated`/`anon` roles anything) except a narrow,
-- column-restricted read of `mal_accounts` for the owning user via `mal_link_status` — enough for
-- the client to ask "is MAL linked to me?" without ever being able to see a token.

-- Needed for the server-side refresh lock (see mal_refresh_token_if_needed below) to call MAL's
-- token endpoint synchronously from within one Postgres transaction.
create extension if not exists http with schema extensions;

create table if not exists public.mal_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- Unique (nulls excepted) so mal-oauth-callback's sign-in variant can look up "does a Supabase
  -- account already exist for this MAL identity" by mal_user_id alone.
  mal_user_id bigint unique,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.mal_accounts enable row level security;

-- Row-level: an owner may see their own row exists at all. Column-level (below) is what actually
-- keeps the tokens hidden — a row-only policy would otherwise let a client `select access_token
-- from mal_accounts` for their own row, which defeats server-side custody entirely.
create policy "mal_accounts_owner_select" on public.mal_accounts
  for select
  using (auth.uid() = user_id);

revoke all on public.mal_accounts from authenticated, anon;
grant select (user_id, mal_user_id, created_at) on public.mal_accounts to authenticated;
-- No insert/update/delete grants for authenticated/anon at all — only service_role (which bypasses
-- RLS and column grants entirely) writes this table, from inside Edge Functions.

-- security_invoker so this view enforces the *querying* role's RLS + column grants above, not the
-- view owner's — otherwise a view owned by a privileged role could leak the excluded columns.
create or replace view public.mal_link_status
  with (security_invoker = true) as
  select user_id, mal_user_id, created_at as linked_at
  from public.mal_accounts;

grant select on public.mal_link_status to authenticated;

-- Short-lived rows bridging mal-oauth-start -> mal-oauth-callback (see src/account's linking flow
-- and the plan doc's two-variant OAuth design). user_id is null for the "sign in with MAL" variant
-- (no Supabase session yet when the flow starts) and set for the "link MAL to my account" variant.
create table if not exists public.mal_oauth_sessions (
  state text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  code_verifier text not null,
  platform text not null check (platform in ('mobile', 'web')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used boolean not null default false
);

alter table public.mal_oauth_sessions enable row level security;
revoke all on public.mal_oauth_sessions from authenticated, anon;
-- Deny-all: mal-oauth-start/callback run as service_role, which bypasses RLS. Nothing here is ever
-- read directly by a client.

-- One-time codes handed to the client at the end of the "sign in with MAL" callback (no Supabase
-- session existed yet, so the callback can't just attach cookies/headers the way the linking
-- variant can) — traded for a real Supabase session by mal-session-exchange. Never put the actual
-- session tokens in a redirect URL; this table plus a short TTL is what keeps that trade safe.
create table if not exists public.mal_session_handoffs (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  used boolean not null default false
);

alter table public.mal_session_handoffs enable row level security;
revoke all on public.mal_session_handoffs from authenticated, anon;

-- Percent-encodes a value for a application/x-www-form-urlencoded body. Postgres has no builtin
-- for this; MAL's token endpoint only ever receives a client id, an auth code/refresh token, and a
-- redirect URI, none of which are attacker-controlled by the time they reach this function, but
-- encoding properly (rather than assuming "OAuth tokens are always URL-safe") is cheap and correct.
create or replace function public.url_encode(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text := '';
  ch text;
  i int;
begin
  for i in 1..length(input) loop
    ch := substr(input, i, 1);
    if ch ~ '[A-Za-z0-9\-._~]' then
      result := result || ch;
    else
      result := result || '%' || upper(to_hex(ascii(ch)));
    end if;
  end loop;
  return result;
end;
$$;

-- The server-side replacement for authRepository.ts's in-memory `inFlightRefresh` lock, which only
-- ever coordinated concurrent requests on one device — useless once two devices (or a phone and a
-- browser tab) can both trigger a refresh. `SELECT ... FOR UPDATE` on the mal_accounts row, plus
-- doing MAL's HTTP round trip *inside* this same function/transaction via the http extension, means
-- a second concurrent caller genuinely blocks at the row lock until the first caller's refresh has
-- committed — then sees the already-fresh token and (via the expiry re-check after acquiring the
-- lock) skips refreshing again, instead of racing MAL's refresh-token rotation and invalidating
-- each other.
--
-- Only callable by service_role (see revoke/grant below) — this returns/writes raw MAL tokens,
-- never exposed to a client role.
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
  select access_token, refresh_token, access_token_expires_at
  into v_access_token, v_refresh_token, v_expires_at
  from public.mal_accounts
  where user_id = p_user_id
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
    delete from public.mal_accounts where user_id = p_user_id;
    return query select null::text, false;
    return;
  end if;

  if v_response.status < 200 or v_response.status >= 300 then
    -- Transient (5xx / network-shaped) failure — same "don't log anyone out over this" rule as the
    -- client-side refresh had. Surface as a failure to the caller without touching the stored row.
    raise exception 'MAL token refresh failed (HTTP %)', v_response.status;
  end if;

  v_json := v_response.content::jsonb;

  update public.mal_accounts
  set access_token = v_json->>'access_token',
      refresh_token = v_json->>'refresh_token',
      access_token_expires_at = now() + make_interval(secs => (v_json->>'expires_in')::numeric)
  where user_id = p_user_id
  returning access_token into v_access_token;

  return query select v_access_token, true;
end;
$$;

revoke execute on function public.mal_refresh_token_if_needed(uuid, text) from public, anon, authenticated;
grant execute on function public.mal_refresh_token_if_needed(uuid, text) to service_role;
