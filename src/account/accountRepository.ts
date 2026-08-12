// Supabase account (email/password) sign-up/login/logout — Phase 7's new, separate identity layer
// alongside MAL login (src/auth/authRepository.ts) and guest mode. An app account gets sync once
// Phase 9/10 land; it has no MAL data of its own until the user optionally links MAL later
// (Phase 8), at which point Import/Discover-add/Push become available. See CLAUDE.md's account
// model: guest / "Continue with MyAnimeList" (Phase 8, creates an app account automatically) /
// "Create account" (this file, MAL-less until linked).
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabaseClient';

export type AccountAuthResult = { success: true } | { success: false; message: string };

/**
 * Creates a new email/password account — or, if the caller is currently an anonymous guest
 * (see guestMode.ts), *upgrades* that session in place instead of creating a separate one.
 * `updateUser` keeps the same auth.uid() (and therefore every row already written under it), while
 * `signUp` would mint a new user and orphan the guest's data. This is the one thing that makes
 * "convert your guest library to a real account" possible.
 */
export async function signUpWithEmail(email: string, password: string): Promise<AccountAuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Accounts aren’t set up yet — Supabase isn’t configured.' };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { error } = session?.user.is_anonymous
    ? await supabase.auth.updateUser({ email, password })
    : await supabase.auth.signUp({ email, password });
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function logInWithEmail(email: string, password: string): Promise<AccountAuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, message: 'Accounts aren’t set up yet — Supabase isn’t configured.' };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, message: error.message };
  return { success: true };
}

export async function logOutAccount(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
}

/**
 * Reactive account session state, unlike src/auth's useIsLoggedIn/useIsGuest (which only check
 * once on mount, since SecureStore has no change-notification API): supabase-js's
 * onAuthStateChange fires on every sign-in/sign-out/token-refresh, so this hook stays live with no
 * manual refresh() call needed after signUpWithEmail/logInWithEmail/logOutAccount.
 */
export function useAccountSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
