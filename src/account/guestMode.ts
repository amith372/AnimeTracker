// "Continue without an account" — lets the Library gate in app/(tabs)/index.tsx skip straight to
// an empty local library instead of forcing a login/account screen. Phase 8: moved out of the
// old src/auth/tokenStore.ts (which otherwise only ever held MAL tokens, now gone entirely — MAL
// custody is server-side) into src/account/, since guest mode is a concept about the app's account
// system now, not about MAL specifically. Still SecureStore-backed, independent of both the
// Supabase session and the SQLite library, exactly as before.
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useState } from 'react';

const KEY_GUEST_MODE = 'guest_mode_enabled';

export async function setGuestMode(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync(KEY_GUEST_MODE, '1');
  else await SecureStore.deleteItemAsync(KEY_GUEST_MODE);
}

export async function isGuestMode(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY_GUEST_MODE)) !== null;
}

/** One-shot-plus-manual-refresh, same shape as the old auth hooks — SecureStore has no
 * change-notification API, so callers must call refresh() themselves after continueAsGuest(). */
export function useIsGuest(): [boolean | null, () => void] {
  const [guest, setGuest] = useState<boolean | null>(null);
  const refresh = useCallback(() => {
    isGuestMode().then(setGuest);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [guest, refresh];
}
