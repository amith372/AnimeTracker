-- Plan 4 step 1: one revocable public share link per account (prd/2-public-share.md).
--
-- This is the first table in the app whose rows are read on behalf of someone with no account at
-- all. Nothing about *this* table changes to allow that: RLS below is owner-only, exactly like
-- taste_profiles and recommendation_lists, and `anon` gets no grant whatsoever. Step 2's
-- `shared-library` Edge Function resolves a slug as service_role and is the only thing that ever
-- reads another account's rows -- which is the whole reason the feature is shaped as a function
-- rather than an `anon`-readable view: a view would put a read path into user rows one policy
-- mistake away from exposing every library, to save one hop.
--
-- A viewer must never be able to query this table directly either, even with the anon key the web
-- bundle ships: being able to list it is being able to enumerate who is sharing.
create table if not exists public.shared_libraries (
  -- Primary key, not just a foreign key: one link per account, settled in the PRD's decision
  -- table. It is what makes "stop sharing" unambiguous -- there is never a second link still live
  -- that the user has forgotten about -- and it makes the two-devices-share-at-once case an
  -- insert-ignore rather than a second URL.
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- The public half of the URL. 122 bits of randomness with the dashes stripped, so it is one
  -- opaque token rather than something that reads like a UUID someone might try to pattern-match.
  --
  -- A column default rather than a client-generated value, for two reasons: the client would need
  -- a crypto dependency to do it as well, and a *bug* in client code could make it predictable in
  -- a way nothing would notice. The grants at the bottom make that structural rather than a
  -- convention -- `authenticated` cannot write this column at all.
  --
  -- gen_random_uuid() is built into Postgres 13+ (pgcrypto not required), so this needs no
  -- extension.
  slug text unique not null default replace(gen_random_uuid()::text, '-', ''),
  -- The optional nickname the sharer types, shown as the page's heading ("Amith's list"), or null
  -- for the neutral "A shared anime list". Deliberately nothing the app already holds about them:
  -- no email, no MAL username, no MAL user id -- §4(f) of the MAL agreement is about people rather
  -- than shows, and a public page is exactly where that matters. Typed-in text is the only name
  -- that cannot leak an identifier the user did not choose to publish.
  display_name text,
  created_at timestamptz not null default now(),
  -- Untrusted text the user typed, so it is bounded here and not only in the TextInput's maxLength
  -- -- a cap that lives only in the client is a cap a future caller forgets. 60 characters fits
  -- any plausible "<name>'s anime list" and nothing resembling a payload. Blank is normalized to
  -- null client-side (src/domain/shareLink.ts), which is why the check treats '' as a violation
  -- rather than silently storing a name that renders as nothing.
  constraint shared_libraries_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 60)
);

alter table public.shared_libraries enable row level security;

-- Strictly the owner's own row -- the same policy shape as every other per-account table. Worth
-- being explicit about what this does and does not do now that a public reader exists: it is what
-- stops one signed-in account (or a guest, who is a real auth.uid()) from reading, renaming or
-- revoking anyone else's link. The public reader bypasses RLS by running as service_role and is
-- bounded instead by knowing a slug.
create policy "shared_libraries_owner_all" on public.shared_libraries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Column-level grants, which is a departure from every other table here and the point of this
-- block rather than boilerplate:
--
--  * `insert (user_id)` only. The client says "share my list" and nothing else; `slug` and
--    `created_at` come from their defaults. A client that cannot name the column cannot choose a
--    predictable slug, so the PRD's "impossible for a client bug to make predictable" is enforced
--    by Postgres instead of by this paragraph.
--  * `update (display_name)` only. Renaming is the only edit the feature has. In particular a slug
--    can never be *changed* -- re-sharing after a revoke mints a fresh one through the default,
--    which is what makes a revoked URL permanently dead rather than reassignable.
--  * `delete`, which taste_profiles and recommendation_lists deliberately withhold. There a client
--    supersedes a row and never removes it; here removal *is* the feature, and "stop sharing" has
--    to leave nothing behind.
grant select on public.shared_libraries to authenticated;
grant insert (user_id) on public.shared_libraries to authenticated;
grant update (display_name) on public.shared_libraries to authenticated;
grant delete on public.shared_libraries to authenticated;
grant select, insert, update, delete on public.shared_libraries to service_role;

-- Deliberately NOT added to the supabase_realtime publication, unlike series/series_entries
-- (20260807000004_replace_library_and_realtime.sql). Realtime exists here to catch changes this
-- device did not make -- another device, the monthly-sync cron. This row is only ever written by
-- the owner pressing a button in front of them, and that write updates the TanStack cache
-- directly, so a subscription would carry a copy of what the screen already knows.
