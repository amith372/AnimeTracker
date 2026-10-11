-- Plan 1 step 6: the generated taste profile, one row per account.
--
-- A table of its own rather than more columns on user_library_meta, which is where step 5½'s
-- privacy consent went. The reason is the opposite of that one's: consent had to ride the existing
-- row because it is read on every cold start by the app's gate, and a second query would be a
-- second network hop before anything can draw (there is no local database — CLAUDE.md's "What this
-- is"). The profile is read by one screen, lazily, and is comparatively large; putting it on the
-- row every cold start fetches would make every launch pay for a jsonb blob nothing on the Library
-- screen looks at.
--
-- It must not live in api_cache either, and that is a hard rule rather than a preference: that
-- table is shared by every account and readable by `anon` (20260812000000_direct_postgres.sql), so
-- a per-user profile in it would be world-readable to every signed-in user and every guest.
create table if not exists public.taste_profiles (
  -- Primary key, not just a foreign key: one profile per account, so a regenerate is an upsert
  -- that supersedes the old one rather than accumulating history nothing reads.
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The model's own output, narrowed by parseTasteProfile client-side before anything renders it.
  -- jsonb rather than text columns because the shape is the model's to fill and ours to validate,
  -- and because step 7 reads it back whole and hands it straight to the generator prompt.
  profile jsonb not null,
  generated_at timestamptz not null default now(),
  -- src/domain/tasteProfile.ts's tasteFingerprint() at the moment of generation: a digest of which
  -- series are liked / finished / dropped. Comparing it against the live library is what makes a
  -- profile stale, so an episode tick short of completion costs nothing and a drop costs one call.
  -- Not null, because a row with no fingerprint would be permanently stale and regenerate forever.
  source_fingerprint text not null,
  -- The same bound api_cache puts on its payload, for the same reason: a model that returns
  -- something enormous shouldn't be able to bloat a table, and nothing legitimate here is close.
  constraint taste_profiles_profile_size check (pg_column_size(profile) < 20000)
);

alter table public.taste_profiles enable row level security;

-- Strictly the owner's own row, the same policy shape the library tables use. There is no shared
-- or cross-account read here by design: this is the most personal thing the app stores, being a
-- description of the reader rather than of a show.
create policy "taste_profiles_owner_all" on public.taste_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete grant for `authenticated`, matching user_library_meta: a client supersedes this row by
-- regenerating, never removes it. Deleting it for real belongs to the account deletion, which runs
-- as service_role (supabase/functions/delete-account) and is covered by the grant below — and by
-- the `on delete cascade` above, since that function deletes the auth.users row first.
grant select, insert, update on public.taste_profiles to authenticated;
grant select, insert, update, delete on public.taste_profiles to service_role;
