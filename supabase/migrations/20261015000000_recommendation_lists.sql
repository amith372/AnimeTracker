-- Plan 9 step 3: keep the finished "For you" list, and recompute only when taste changes.
--
-- Why a table of its own rather than a column on taste_profiles, which already holds one row per
-- account and already stores a `source_fingerprint`:
--
--  1. `taste_profiles.profile` is `not null`, so an account with fewer than MIN_TASTE_VERDICTS
--     verdicts has no row there at all -- and those are exactly the small libraries whose
--     recommendations still work (the MAL-tally and genre halves need no model). Sharing the row
--     would mean either denying the cache to them or making `profile` nullable, and loosening a
--     constraint on a live table to make room for unrelated data is the worse trade.
--  2. The two fingerprints answer the same question but are not the same string: this one carries a
--     row-shape version segment, so changing what a stored row looks like can invalidate every
--     stored list without touching when a taste profile regenerates.
--  3. The profile is a short description written by a model; this is a large derived blob rebuilt
--     from the whole MAL pipeline. Different lifecycles, different sizes, different writers.
create table if not exists public.recommendation_lists (
  -- Primary key, not just a foreign key: one list per account, so a recompute is an upsert that
  -- supersedes the old one rather than accumulating history nothing reads. Same shape as
  -- taste_profiles for the same reason.
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The finished list exactly as the screen renders it: ReconcileSeries[] (see
  -- src/domain/reconcileSeries.ts), already ranked, diversified, grouped and excluded. Stored whole
  -- rather than as ids because rebuilding it from ids is the expensive thing this exists to avoid --
  -- every one of those ids costs a cached detail read, which is the entire problem plan 9 addresses.
  series jsonb not null,
  -- Plan 1 step 7's degrade line: one sentence saying the model's picks aren't in this list, or
  -- null when they are. Stored with the list because it describes that list, and a restored list
  -- carrying no notice would silently claim the model's picks are in it.
  generator_notice text,
  -- src/domain/recommendationCache.ts's recommendationListFingerprint() at the moment the list was
  -- computed: a row-shape version segment plus tasteFingerprint(). Comparing it against the live
  -- library is what makes a list stale -- so a like, a drop or a *finishing* episode tick rebuilds
  -- it and every other tick costs nothing. Not null, because a row with no fingerprint would be
  -- permanently stale and recompute forever.
  source_fingerprint text not null,
  generated_at timestamptz not null default now(),
  -- The same bound taste_profiles and api_cache put on their payloads, scaled to what this holds:
  -- MAX_RECOMMENDATIONS is 60 grouped series of a few hundred bytes each, so ~40KB is the real
  -- size and 400KB is a ceiling nothing legitimate approaches.
  constraint recommendation_lists_series_size check (pg_column_size(series) < 400000)
);

alter table public.recommendation_lists enable row level security;

-- Strictly the owner's own row. This is derived from one person's library -- which shows they
-- finished, liked and dropped -- so it is as personal as the taste profile itself and gets the
-- same policy. It must never go anywhere near api_cache, which is `anon`-readable by design.
create policy "recommendation_lists_owner_all" on public.recommendation_lists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete grant for `authenticated`, matching taste_profiles and user_library_meta: a client
-- supersedes this row by recomputing, never removes it. Deleting it for real belongs to the account
-- deletion, which runs as service_role (supabase/functions/delete-account) and is covered by the
-- grant below -- and by the `on delete cascade` above, since that function deletes the auth.users
-- row first.
grant select, insert, update on public.recommendation_lists to authenticated;
grant select, insert, update, delete on public.recommendation_lists to service_role;
