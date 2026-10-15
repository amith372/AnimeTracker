// The share link's pure parts — plan 4 step 1 / prd/2-public-share.md.
//
// Pure and import-free so Jest can test them directly, the same split displayName.ts uses: the
// Postgres row and the live origin belong to src/repositories/ShareRepository.ts, while what a URL
// looks like and what a typed-in nickname narrows to live here.
//
// Note what is *not* here: nothing generates a slug. The slug is a Postgres column default
// (20261015010000_shared_libraries.sql) and the client cannot write that column at all, so there
// is no client-side slug code to get wrong.

/** The route a shared list renders on: `app/s/[slug].tsx`, built in step 3. Outside the tabs group
 * on purpose — the login-and-consent gate lives in `app/(tabs)/index.tsx`, so a top-level route is
 * what lets a viewer with no session land here without being redirected to a login screen. */
export const SHARE_PATH_PREFIX = '/s/';

/** What Postgres will accept in `display_name` (its length check is the same number). Mirrored
 * into the TextInput's maxLength so the cap is felt while typing rather than as a failed write. */
export const MAX_SHARE_NAME_LENGTH = 60;

/**
 * The URL to show and copy, or null when there is no origin to build it from.
 *
 * Null rather than a relative path or a guess: a half-built link is worse than none, because its
 * whole purpose is to be pasted into a chat where nothing can repair it. The screen says the link
 * can't be built and shows the slug instead.
 *
 * Trailing slashes are stripped because an origin is configured by hand
 * (EXPO_PUBLIC_SITE_URL) and `https://example.com/` + `/s/abc` is a double slash that some static
 * hosts answer with a 404 rather than normalizing.
 */
export function buildShareUrl(origin: string | null | undefined, slug: string): string | null {
  const base = origin?.trim().replace(/\/+$/, '');
  if (!base) return null;
  const token = slug.trim();
  if (!token) return null;
  return `${base}${SHARE_PATH_PREFIX}${token}`;
}

/**
 * The nickname as it should be stored: trimmed, capped, and null when there is nothing left.
 *
 * Null is the "no nickname" value the page turns into "A shared anime list", so whitespace-only
 * input has to collapse to it — storing '  ' would publish a heading that renders as empty and
 * reads as a broken page. The cap is enforced here as well as in the TextInput and in Postgres
 * because this function is what every write goes through, and of the three it is the only one a
 * future caller cannot bypass by accident.
 */
export function normalizeShareName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_SHARE_NAME_LENGTH);
}
