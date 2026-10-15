// The public share link's round trip — plan 4 step 1 / prd/2-public-share.md.
//
// Owns one Postgres row (`shared_libraries`, one per account) and the three things the account
// screen does to it: create, rename, revoke. Split the way every repository here is (CLAUDE.md's
// state/reactivity model): a `use*` hook the screen re-renders on, plus plain async functions the
// buttons call.
//
// The division of labour, since three places could plausibly own each part:
//
//  - **src/domain/shareLink.ts** decides what a URL looks like and what a typed nickname narrows
//    to. Pure, unit-tested.
//  - **Postgres** owns the slug, via a column default the client has no grant to write
//    (20261015010000_shared_libraries.sql). Nothing in this file names that column on a write, and
//    __tests__/shareRepository.test.ts asserts it stays that way.
//  - **this file** sequences them and owns the row's lifecycle.
//
// Nothing here reads anyone else's row — RLS is owner-only and stays that way. Serving a stranger
// is step 2's Edge Function, which runs as service_role and is the only thing in the app that ever
// reads a library it does not own.
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { supabase } from '@/account/supabaseClient';
import { useAccountSession } from '@/account/accountRepository';
import { buildShareUrl, normalizeShareName } from '@/domain/shareLink';
import { UserFacingError } from './errorMessage';
import { libraryKeys, queryClient } from './queryClient';

/** The row as the screen needs it. No `user_id`: the only account this can ever be about is the
 * signed-in one, and carrying an account id around a feature whose entire design point is that no
 * identifier reaches a public page is a habit worth not starting. */
export interface ShareLink {
  slug: string;
  displayName: string | null;
  createdAt: string;
}

/** The columns the client reads. A whitelist rather than `*`, matching the rule step 2's function
 * is held to: a column added to this table later must not start flowing somewhere by default. */
const SHARE_COLUMNS = 'slug, display_name, created_at';

/**
 * Where the app is served from, for building a link someone else can open.
 *
 * `EXPO_PUBLIC_SITE_URL` first (the client's copy of the `SITE_URL` Edge Function secret — not a
 * secret in the confidentiality sense, just the app's own public address, which the client needs
 * because the client is the thing constructing the URL to copy). It is baked in at build time like
 * every other `EXPO_PUBLIC_` var, so a web deploy has to set it as a build-time variable.
 *
 * Falling back to the live origin on web is what makes this testable: run `expo start --web` with
 * no env var and the copy button still produces a link that works, against the dev server you are
 * already looking at. There is no such fallback on native — an app bundle has no origin — so a
 * native build with the var unset has no URL to offer, and the screen says so rather than copying
 * something broken.
 */
function siteOrigin(): string | null {
  const configured = process.env.EXPO_PUBLIC_SITE_URL?.trim();
  if (configured) return configured;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return null;
}

/** The copyable URL for a slug, or null when this build has no origin to build one from — see
 * siteOrigin above. Exported so the screen imports one thing rather than reassembling the URL. */
export function shareUrlFor(slug: string): string | null {
  return buildShareUrl(siteOrigin(), slug);
}

/** Reads the one row, or null when this account isn't sharing. `maybeSingle` rather than `single`
 * because "no row" is the normal state, not an error. */
async function fetchShareLink(userId: string): Promise<ShareLink | null> {
  const { data, error } = await supabase
    .from('shared_libraries')
    .select(SHARE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { slug: data.slug, displayName: data.display_name ?? null, createdAt: data.created_at };
}

export interface ShareLinkView {
  link: ShareLink | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * The account screen's reactive read. Tri-state like the library gates: while `isLoading` the
 * screen must not render "you aren't sharing" — showing a "Share your list" button to someone who
 * already has a live link is how a second press ends up looking like a no-op, or worse, like the
 * link was lost.
 */
export function useShareLink(): ShareLinkView {
  const { session, loading: sessionLoading } = useAccountSession();
  const userId = session?.user.id ?? null;

  const query = useQuery({
    queryKey: libraryKeys.share(userId ?? 'anonymous'),
    queryFn: () => fetchShareLink(userId!),
    enabled: !!userId,
  });

  return {
    link: query.data ?? null,
    isLoading: sessionLoading || (!!userId && query.isPending),
    error: (query.error as Error | null) ?? null,
  };
}

/** Same as AnimeRepository's: a write with no signed-in owner is a real error, not a guest's
 * normal empty state. A guest *is* signed in (anonymous auth is a real auth.uid()), so this does
 * not stand between a guest and sharing — see the PRD's decision table. */
async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user.id;
  if (!userId) throw new UserFacingError('Sign in to share your list.');
  return userId;
}

/**
 * Starts sharing, and returns the link it created (or the one that already existed).
 *
 * Deliberately **not** optimistic, unlike every other write in this app: the slug is generated by
 * Postgres, so there is nothing to put in the cache until the server answers. Faking a placeholder
 * slug for 350ms would mean a copy button that can be pressed before the URL it copies is real.
 *
 * `ignoreDuplicates` is the PRD's two-devices-at-once case: the second insert is a no-op rather
 * than an error or a second link. PostgREST then returns no row for the ignored insert, which is
 * what the follow-up read is for — in that case the existing link is the correct answer, and the
 * user pressing "share" wants to see *a* link, not an error about already having one.
 *
 * `user_id` is the only column written. `slug` and `created_at` come from their defaults, and
 * `authenticated` has no grant to write them at all.
 */
export async function createShareLink(): Promise<ShareLink> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('shared_libraries')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true })
    .select(SHARE_COLUMNS)
    .maybeSingle();
  if (error) throw error;

  const link = data
    ? { slug: data.slug, displayName: data.display_name ?? null, createdAt: data.created_at }
    : await fetchShareLink(userId);
  if (!link) throw new UserFacingError('Couldn’t start sharing. Try again.');

  // setQueryData, not an invalidation: we know exactly what was written and the screen is waiting
  // on it, so an invalidation would spend another ~350ms round trip to be told the same thing.
  queryClient.setQueryData<ShareLink | null>(libraryKeys.share(userId), link);
  return link;
}

/**
 * Renames the link, or clears the nickname when the field is empty.
 *
 * Optimistic, like the library's writes: the typed name is already on screen, so the only thing a
 * round trip can usefully add is a rollback when it fails. Rolls back to the exact previous row
 * rather than to null — the cache held a real link before this and must still hold one after a
 * failed rename, or the screen would read as "not sharing" because a name didn't save.
 *
 * Writes `display_name` and nothing else. An `update` rather than an upsert on purpose: renaming a
 * link that no longer exists must not quietly create one, which is exactly what could happen if
 * two devices disagreed about whether sharing was still on.
 */
export async function renameShareLink(rawName: string): Promise<void> {
  const userId = await requireUserId();
  const displayName = normalizeShareName(rawName);
  const key = libraryKeys.share(userId);
  const previous = queryClient.getQueryData<ShareLink | null>(key) ?? null;
  if (!previous) throw new UserFacingError('Your list isn’t being shared yet.');

  const renamed: ShareLink = { ...previous, displayName };
  queryClient.setQueryData<ShareLink | null>(key, renamed);
  const { error } = await supabase
    .from('shared_libraries')
    .update({ display_name: displayName })
    .eq('user_id', userId);
  if (error) {
    queryClient.setQueryData<ShareLink | null>(key, previous);
    throw error;
  }
}

/**
 * Stops sharing. A real delete, not a flag: the row going away is what makes the old slug
 * permanently dead and what satisfies §3(e)'s 24-hour removal requirement outright. Re-sharing
 * later mints a fresh slug from the column default, so the URL that was given out can never come
 * back — which is the step's check, and the thing a hide-instead-of-delete implementation would
 * fail.
 *
 * Optimistic, with the same rollback reasoning as the rename: on failure the link is still live,
 * and a screen that says otherwise would have the user believing they had stopped sharing.
 */
export async function revokeShareLink(): Promise<void> {
  const userId = await requireUserId();
  const key = libraryKeys.share(userId);
  const previous = queryClient.getQueryData<ShareLink | null>(key) ?? null;

  queryClient.setQueryData<ShareLink | null>(key, null);
  const { error } = await supabase.from('shared_libraries').delete().eq('user_id', userId);
  if (error) {
    queryClient.setQueryData<ShareLink | null>(key, previous);
    throw error;
  }
}
