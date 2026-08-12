// Turns whatever a repository threw into something worth showing a user.
//
// Every write in this app is a network round trip to Postgres now (see CLAUDE.md's "What this is"),
// so failures arrive as Supabase/PostgREST errors whose `message` is written for a developer, not a
// person — "JWT expired", "new row violates row-level security policy for table \"series\"". Those
// were going straight into Snackbars. A raw backend string tells the user nothing they can act on
// and leaks schema details into the UI, so screens call userFacingMessage() instead of reading
// `e.message` directly.

/**
 * An error whose message was deliberately written for the user and should be shown verbatim
 * (e.g. "This show is already in your library."). Everything else is treated as a backend string
 * and replaced with the caller's plain-language fallback — that's the whole point of the class:
 * it's the opt-in marker that says "this text is safe to display".
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** Offline/unreachable, across both platforms: RN's fetch rejects with "Network request failed",
 * browsers with "Failed to fetch" (a TypeError), and PostgREST surfaces its own connection codes.
 * Worth its own message because it's the one failure the user can actually do something about, and
 * with no offline support (deliberate — see CLAUDE.md) it's also the most common one. */
function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = e instanceof Error ? e.message : String(e ?? '');
  return /network request failed|failed to fetch|networkerror|econnrefused|fetch failed/i.test(message);
}

/** An expired/invalid Supabase session. Recoverable only by signing in again, so it earns a
 * different message from a generic failure rather than sending the user to a pointless Retry. */
function isAuthError(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const message = e instanceof Error ? e.message : String(e ?? '');
  return code === 'PGRST301' || /jwt (expired|is invalid)|invalid (jwt|refresh token)|not authenticated/i.test(message);
}

/**
 * The one place a caught error becomes Snackbar/error-view text.
 *
 * `fallback` is what the user sees for anything unrecognized, so it should name the action that
 * failed in the app's own language ("Could not save your library.") rather than describing the
 * error — the point is that the user never sees the backend's wording.
 */
export function userFacingMessage(e: unknown, fallback: string): string {
  if (e instanceof UserFacingError) return e.message;
  if (isNetworkError(e)) return "Can't reach the server. Check your connection and try again.";
  if (isAuthError(e)) return 'Your session expired. Sign in again to continue.';
  return fallback;
}
