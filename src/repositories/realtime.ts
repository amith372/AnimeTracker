// Realtime -> TanStack Query invalidation. The direct-Postgres-cutover replacement for
// src/sync/pull.ts's watermark-poll-and-merge — there's no local mirror to merge into anymore, so
// a remote change just needs to invalidate the library query and let the next fetch pick it up.
//
// The Realtime subscription shape (channel name, filter, event) is copied verbatim from
// src/sync/pull.ts's resubscribeRealtime — that shape is live-verified from Phase 10, and it's now
// the mechanism the whole reactive layer depends on, so it's deliberately not "improved".
import { AppState, type NativeEventSubscription } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/account/supabaseClient';
import { libraryKeys, queryClient } from './queryClient';

const DEBOUNCE_MS = 2000;
// Realtime is best-effort (it can drop events on reconnect/channel error/quota) — this periodic
// invalidation is the backstop, same role src/sync/pull.ts's 60s poll played. Don't rely on
// Realtime alone; Phase 10 never did either.
const PERIODIC_MS = 60_000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced invalidate — `replace_library`/`add_series` can each fire many Realtime events in one
 * transaction (one per row), so this collapses a burst into a single refetch. */
function requestInvalidate(userId: string): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void queryClient.invalidateQueries({ queryKey: libraryKeys.library(userId) });
  }, DEBOUNCE_MS);
}

let realtimeChannel: RealtimeChannel | null = null;

/** (Re)subscribes to the current session's own rows — called once up front and again on every auth
 * state change, since the filter is baked in per-user at subscribe time. On sign-out (userId null)
 * this also clears every cached library query, so a second account signing in on the same device
 * never briefly renders the previous account's data. */
function resubscribeRealtime(userId: string | null): void {
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!userId) {
    queryClient.removeQueries({ queryKey: libraryKeys.root });
    return;
  }
  realtimeChannel = supabase
    .channel(`sync-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'series', filter: `user_id=eq.${userId}` },
      () => requestInvalidate(userId),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'series_entries', filter: `user_id=eq.${userId}` },
      () => requestInvalidate(userId),
    )
    .subscribe();
}

/** Called once from app/_layout.tsx. Returns an unsubscribe function for the effect cleanup. */
export function startLibraryRealtime(): () => void {
  supabase.auth.getSession().then(({ data: { session } }) => resubscribeRealtime(session?.user.id ?? null));
  const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) =>
    resubscribeRealtime(session?.user.id ?? null),
  );

  // Re-reads the session at the moment the app foregrounds rather than capturing it once — a
  // closure over the session at startLibraryRealtime()-call-time would go stale the moment the
  // user signs in or out later, silently disabling this backstop for the rest of the app's life.
  const appStateSubscription: NativeEventSubscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) requestInvalidate(session.user.id);
    });
  });

  const interval = setInterval(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) void queryClient.invalidateQueries({ queryKey: libraryKeys.library(session.user.id) });
    });
  }, PERIODIC_MS);

  return () => {
    if (realtimeChannel) void supabase.removeChannel(realtimeChannel);
    authSubscription.subscription.unsubscribe();
    appStateSubscription.remove();
    clearInterval(interval);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
