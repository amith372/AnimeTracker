-- Phase 7 (accounts, no sync yet): server-side mirror of src/db/schema.ts's `series` and
-- `series_entries` tables. Nothing writes here yet — this schema exists so RLS/ownership is in
-- place before Phase 9/10 wire up the outbox/pull sync engine. `sync_meta` and `api_cache` stay
-- local-only (see CLAUDE.md's Data model section) and have no Postgres equivalent.
--
-- Identity: natural keys (user_id, root_mal_id) / (series_id, mal_id), not client-generated UUIDs
-- — the same identity src/domain/seriesGrouping.ts already treats as canonical, which makes
-- concurrent-device upserts idempotent later without an id-reconciliation step.
--
-- version/updated_at/updated_by_device_id/deleted_at exist for the future sync protocol (Phase
-- 9/10), not used by anything yet: `version` is the authoritative last-write-wins compare (never
-- client-supplied — a trigger bumps it, since relying on updated_at alone is vulnerable to clock
-- skew between a phone and a browser tab); deleted_at is a soft-delete tombstone, required because
-- a hard DELETE is invisible to an incremental `WHERE updated_at > watermark` pull.

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cover_url text,
  genres jsonb not null default '[]'::jsonb,
  root_mal_id bigint not null,
  type text not null check (type in ('SERIES', 'STANDALONE_MOVIE')),
  manual_status text not null check (manual_status in ('PLAN', 'CURRENTLY_WATCHING', 'DROPPED', 'WATCHED_FORGOT', 'NONE')),
  new_season_available boolean not null default false,
  new_season_aired_at timestamptz,
  liked boolean not null default false,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_device_id uuid,
  deleted_at timestamptz,
  unique (user_id, root_mal_id)
);

create index if not exists idx_series_user_updated on public.series (user_id, updated_at);

create table if not exists public.series_entries (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  -- Denormalized from series.user_id so RLS on this table is a flat auth.uid() = user_id check
  -- with no join required.
  user_id uuid not null references auth.users(id) on delete cascade,
  mal_id bigint not null,
  kind text not null check (kind in ('TV_SEASON', 'MOVIE')),
  order_index integer not null,
  title text not null,
  episode_count integer not null default 0,
  watch_state text not null default 'UNWATCHED' check (watch_state in ('UNWATCHED', 'WATCHED', 'WONT_WATCH')),
  airing_status text not null check (airing_status in ('FINISHED', 'AIRING', 'NOT_YET_AIRED')),
  -- Per-arc watched-checkbox state — only ever non-null for the one MAL id 21 (One Piece) entry.
  -- See src/domain/arcs.ts; watch_state stays the real source of truth, this is opaque to sync.
  watched_arc_keys jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_device_id uuid,
  deleted_at timestamptz,
  unique (series_id, mal_id)
);

create index if not exists idx_series_entries_series_id on public.series_entries (series_id);
create index if not exists idx_series_entries_user_updated on public.series_entries (user_id, updated_at);

-- Bumps version and updated_at on every UPDATE, server-side only — a client can never set its own
-- version and outrank a real concurrent edit from another device.
create or replace function public.bump_series_version()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_series_bump_version on public.series;
create trigger trg_series_bump_version
  before update on public.series
  for each row
  execute function public.bump_series_version();

drop trigger if exists trg_series_entries_bump_version on public.series_entries;
create trigger trg_series_entries_bump_version
  before update on public.series_entries
  for each row
  execute function public.bump_series_version();

alter table public.series enable row level security;
alter table public.series_entries enable row level security;

create policy "series_owner_all" on public.series
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "series_entries_owner_all" on public.series_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
