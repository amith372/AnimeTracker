-- Direct-Postgres cutover: local SQLite + the outbox/pull sync engine (Phases 9-11) are being
-- deleted entirely — both the mobile app and the web build now read/write Postgres directly, no
-- offline support. This migration adds the three pieces of server-side support that local SQLite
-- used to provide with no Postgres equivalent: the MAL response cache (api_cache), "has the user
-- completed onboarding import" (user_library_meta, replacing the old per-device sync_meta), and a
-- single-round-trip insert for one new series (add_series, the addSeries()-sized counterpart to
-- 20260807000004_replace_library_and_realtime.sql's replace_library()).

-- 1. api_cache — shared, not per-user. MAL anime detail/recommendations data is user-independent
-- (guardrail #3: cache results, don't hammer MAL), so one user's fetch warming the cache benefits
-- every other user and every guest browsing Discover. This is the first migration in this repo to
-- grant `anon` anything (20260807000001_grants.sql deliberately withheld it from the library
-- tables) — that's intentional here, not a copy-paste mistake: this table holds no user data, only
-- a mirror of MAL's own public catalog.
create table if not exists public.api_cache (
  key text primary key,
  json jsonb not null,
  fetched_at timestamptz not null default now(),
  -- Confines writes to the two key shapes apiCache.ts actually produces (detail:v4:<malId>,
  -- recs:v1:<malId>) — no arbitrary-key spraying from a compromised or malicious client.
  constraint api_cache_key_shape check (key ~ '^(detail|recs):v[0-9]+:[0-9]+$'),
  -- A malformed or huge payload shouldn't be able to bloat a table every signed-in user shares.
  constraint api_cache_json_size check (pg_column_size(json) < 200000)
);

create index if not exists idx_api_cache_fetched_at on public.api_cache (fetched_at);

-- fetched_at is server-authored, never client-supplied: a client that wrote fetched_at = now() +
-- '10 years' would pin a poisoned row past every TTL check forever. Same idiom as
-- bump_series_version (20260807000000_series_schema.sql).
create or replace function public.stamp_api_cache_fetched_at()
returns trigger
language plpgsql
as $$
begin
  new.fetched_at := now();
  return new;
end;
$$;

drop trigger if exists trg_api_cache_stamp on public.api_cache;
create trigger trg_api_cache_stamp
  before insert or update on public.api_cache
  for each row
  execute function public.stamp_api_cache_fetched_at();

alter table public.api_cache enable row level security;

-- Any signed-in user or guest can read the shared cache; only a signed-in user can write it (a
-- guest's cache write always fails, which apiCache.ts treats as fire-and-forget/best-effort, not
-- an error — see that file's header comment). No delete policy for authenticated at all: one user
-- must never be able to wipe a cache everyone shares. Pruning is a scheduled service_role job (below).
create policy "api_cache_read_all" on public.api_cache
  for select
  to authenticated, anon
  using (true);

create policy "api_cache_write_auth" on public.api_cache
  for insert
  to authenticated
  with check (true);

create policy "api_cache_upd_auth" on public.api_cache
  for update
  to authenticated
  using (true)
  with check (true);

grant select on public.api_cache to anon;
grant select, insert, update on public.api_cache to authenticated;
grant select, insert, update, delete on public.api_cache to service_role;

-- Scheduled prune, same shape as 20260808000000_monthly_sync_cron.sql's job (pg_cron/pg_net are
-- already created by that migration, but `if not exists` keeps this one runnable standalone too).
create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'prune-api-cache',
  '0 4 * * *', -- 04:00 UTC daily
  $$delete from public.api_cache where fetched_at < now() - interval '30 days'$$
);

-- 2. user_library_meta — replaces the old local-only sync_meta table (schema.ts's SyncMeta had no
-- Postgres equivalent; its mere existence locally meant "onboarding import done"). Server-side and
-- per-account rather than per-device fixes a real bug the old design had: signing into an
-- already-imported account on a second device used to bounce back through onboarding/reconcile
-- (since sync_meta was local to whichever device ran the import) and wipe-and-reimport via
-- replace_library. A row here is visible to every device the account signs into.
create table if not exists public.user_library_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  initial_import_completed_at timestamptz,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_library_meta enable row level security;

create policy "user_library_meta_owner_all" on public.user_library_meta
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete grant: a row here should only ever be superseded (upserted), never removed by a client.
grant select, insert, update on public.user_library_meta to authenticated;
grant select, insert, update, delete on public.user_library_meta to service_role;

-- 3. add_series(payload) — addSeries()'s counterpart to replace_library(): inserts one new series
-- plus its entries in a single round trip / single transaction. Necessary now that ids are
-- server-assigned uuids (they used to be client-visible autoincrement local ids) and a series row
-- with no entries would derive as "Watched" and be unfixable from the UI, since there'd be nothing
-- to tick (see AnimeRepository.ts's insertSeriesTx doc comment for the original reasoning — same
-- hazard applies here, just against Postgres instead of SQLite). `security invoker`, same as
-- replace_library: runs under the caller's own JWT/RLS, so a caller can only ever insert rows
-- owned by themselves.
create or replace function public.add_series(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  entry jsonb;
  new_series_id uuid;
begin
  if auth.uid() is null then
    raise exception 'add_series requires an authenticated caller';
  end if;

  insert into public.series (
    user_id, title, cover_url, genres, root_mal_id, type, manual_status,
    new_season_available, new_season_aired_at, liked
  ) values (
    auth.uid(),
    payload->>'title',
    payload->>'cover_url',
    coalesce(payload->'genres', '[]'::jsonb),
    (payload->>'root_mal_id')::bigint,
    payload->>'type',
    payload->>'manual_status',
    coalesce((payload->>'new_season_available')::boolean, false),
    (payload->>'new_season_aired_at')::timestamptz,
    coalesce((payload->>'liked')::boolean, false)
  )
  returning id into new_series_id;

  for entry in select * from jsonb_array_elements(coalesce(payload->'entries', '[]'::jsonb))
  loop
    insert into public.series_entries (
      series_id, user_id, mal_id, kind, order_index, title, episode_count,
      watch_state, airing_status, watched_arc_keys
    ) values (
      new_series_id,
      auth.uid(),
      (entry->>'mal_id')::bigint,
      entry->>'kind',
      (entry->>'order_index')::integer,
      entry->>'title',
      coalesce((entry->>'episode_count')::integer, 0),
      coalesce(entry->>'watch_state', 'UNWATCHED'),
      entry->>'airing_status',
      entry->'watched_arc_keys'
    );
  end loop;

  return new_series_id;
end;
$$;

grant execute on function public.add_series(jsonb) to authenticated;
