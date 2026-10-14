// Who the sidebar greets — plan 6 / prd/3-welcome-greeting.md.
//
// Pure and import-free so Jest can test the resolution order directly; the hook that feeds it a
// live Supabase session lives in src/account/displayName.ts.

/** The synthetic address mal-oauth-callback mints for an account created by "Continue with
 * MyAnimeList" — MAL's API never exposes a real email. It is a placeholder nobody ever logs in
 * with, so it must never reach the screen: "Welcome mal-123456" is worse than no name at all, and
 * it is the exact failure this feature exists to avoid. */
const SYNTHETIC_MAL_EMAIL = /^mal-\d+@mal-users\.animetracker\.app$/i;

export interface DisplayNameInput {
  /** A Supabase anonymous session — a real, temporary account, not a read-only mode. */
  isAnonymous: boolean;
  /** `user_metadata.mal_username`, written by mal-oauth-callback on every MAL sign-in or link. */
  malUsername: string | null | undefined;
  email: string | null | undefined;
}

/**
 * The name to greet, or null when there is no honest one to show (the caller says "Welcome back").
 *
 * Order, and why each step beats the one after it:
 *
 *  1. **MAL username.** The name the user actually chose. It wins even for a guest — settled
 *     2026-10-14: once MAL is linked the session is identifiable, and of two true answers the name
 *     is the informative one.
 *  2. **Email local-part**, ignoring the synthetic MAL placeholder above. Beats "Guest" because an
 *     account with an email is not a guest.
 *  3. **"Guest"** for an anonymous session with nothing better.
 *  4. **null** — a real account whose name we failed to fetch. Deliberately not "Guest", which
 *     would be a lie about a permanent account.
 */
export function resolveDisplayName(input: DisplayNameInput): string | null {
  const malUsername = input.malUsername?.trim();
  if (malUsername) return malUsername;

  const email = input.email?.trim();
  if (email && !SYNTHETIC_MAL_EMAIL.test(email)) {
    const localPart = email.split('@')[0]?.trim();
    if (localPart) return localPart;
  }

  if (input.isAnonymous) return 'Guest';

  return null;
}
