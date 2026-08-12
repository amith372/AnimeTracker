// "Continue without an account" — backed by Supabase's anonymous auth (supabase.auth.signInAnonymously())
// rather than a local flag. This is a deliberate pivot from the direct-Postgres cutover's first cut
// (a browse-only guest with no library): an anonymous sign-in gives a guest a REAL, if temporary,
// auth.uid(), so every RLS-protected read/write in the app (AnimeRepository.ts, everything downstream
// of it) works completely unmodified — there is no separate guest code path anywhere else in the app.
// A guest is, as far as Postgres and every screen are concerned, just an account with no email yet.
//
// Lifespan: the anonymous session persists in AsyncStorage exactly like a real one (see
// supabaseClient.ts) — closing and reopening the app keeps a guest's library. It only ends when they
// explicitly sign out (logOutAccount) or convert to a real account (see accountRepository.ts's
// signUpWithEmail, which upgrades an anonymous session in place via supabase.auth.updateUser rather
// than creating a separate one, so converting keeps everything the guest already added) or link
// MyAnimeList (malLinkRepository.ts's linkMalAccount already attaches to whatever is currently
// signed in, anonymous or not, with no changes needed).
//
// Requires "Allow anonymous sign-ins" to be enabled in the Supabase project's Auth settings
// (dashboard-only toggle, not something a migration can turn on) — see continueAsGuest's error
// path for what happens if it isn't.
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { useAccountSession, type AccountAuthResult } from './accountRepository';

/** Starts (or resumes, if one is already active) an anonymous session. */
export async function continueAsGuest(): Promise<AccountAuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Accounts aren’t set up yet — Supabase isn’t configured.' };
  }
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { success: false, message: error.message };
  return { success: true };
}

/** Whether the current session (if any) is an anonymous guest rather than a real account — fully
 * reactive, since it just reads useAccountSession's own session state. null while that's loading. */
export function useIsGuest(): boolean | null {
  const { session, loading } = useAccountSession();
  if (loading) return null;
  return session?.user.is_anonymous ?? false;
}
