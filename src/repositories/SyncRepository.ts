// Monthly sync — Phase 11 moved the actual work (walking each eligible series' TV season chain
// for new seasons) server-side into the mal-monthly-sync Edge Function, scheduled via pg_cron (see
// that function and its migration). This file is now just the client's window into it: the
// "Sync now" button's one-shot, synchronous path — a scheduled run reaches this device through the
// normal Realtime path instead (src/repositories/realtime.ts), same as any other remote change,
// with no per-device wake-up or network call needed at all. The old per-device
// expo-background-task registration (registerBackgroundSync) is gone along with the client-side
// walk it used to trigger.
import { isMalLinked } from '@/account/malLinkRepository';
import { callMalMonthlySync } from '@/api/edgeFunctions';
import { libraryKeys, queryClient } from './queryClient';
import { supabase } from '@/account/supabaseClient';

/**
 * Triggers a monthly-sync run for just the current account — the "Sync now" action in the Library
 * screen's overflow menu. Real (scheduled) monthly sync runs server-side for every linked account
 * regardless of whether anyone taps this; this exists because that real schedule is opaque and
 * un-triggerable on demand, and a user-visible "check right now" affordance is worth having.
 *
 * Gated on MAL being linked, same scoping the old isLoggedIn() check gave: a guest's Discover-built
 * library is real MAL data, but sync stays an opted-into-MAL-account feature, not something guests
 * get for free.
 */
export async function runMonthlySync(): Promise<number> {
  if (!(await isMalLinked())) return 0;
  const { seriesWithNewSeasons } = await callMalMonthlySync();
  // The Edge Function wrote straight to Postgres — this device's own Realtime subscription will
  // pick the change up on its own shortly, but invalidating right away means the button's "N series
  // have new seasons" result and the visibly-updated Library list land together instead of the
  // list lagging a beat behind the message.
  if (seriesWithNewSeasons > 0) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) void queryClient.invalidateQueries({ queryKey: libraryKeys.library(session.user.id) });
  }
  return seriesWithNewSeasons;
}
