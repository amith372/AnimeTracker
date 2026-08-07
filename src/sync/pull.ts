// Pull half of sync: polls Supabase's `series`/`series_entries` for rows changed since the local
// watermark (src/db/schema.ts's `remoteSyncState`, a singleton row) and hands them to
// src/sync/merge.ts. A Realtime `postgres_changes` subscription (see the migration that adds both
// tables to the `supabase_realtime` publication) triggers the same debounced pull near-instantly
// while the app is foregrounded, instead of waiting for the next periodic poll.
import { eq } from 'drizzle-orm';
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/account/supabaseClient';
import { db } from '@/db/client';
import { remoteSyncState } from '@/db/schema';
import { mergeRemoteSeries, mergeRemoteSeriesEntries, type RemoteEntryRow, type RemoteSeriesRow } from './merge';

const DEBOUNCE_MS = 2000;
const PERIODIC_MS = 60_000;
// A pull older than this (e.g. this device's very first pull, or one after being offline for a
// long time) fetches this account's entire history — there's no meaningful "since" before it ever
// synced anything.
const EPOCH_FALLBACK_ISO = '1970-01-01T00:00:00.000Z';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;
let repullRequested = false;

export function requestPull(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void pullRemoteChanges();
  }, DEBOUNCE_MS);
}

export async function pullRemoteChanges(): Promise<void> {
  if (pulling) {
    repullRequested = true;
    return;
  }
  pulling = true;
  try {
    await pullOnce();
  } finally {
    pulling = false;
    if (repullRequested) {
      repullRequested = false;
      void pullRemoteChanges();
    }
  }
}

async function getWatermark(): Promise<{ rowId: number | null; sinceIso: string }> {
  const [row] = await db.select().from(remoteSyncState).limit(1);
  if (!row) return { rowId: null, sinceIso: EPOCH_FALLBACK_ISO };
  return {
    rowId: row.id,
    sinceIso: row.lastPulledAtEpochMillis ? new Date(row.lastPulledAtEpochMillis).toISOString() : EPOCH_FALLBACK_ISO,
  };
}

async function setWatermark(rowId: number | null, epochMillis: number): Promise<void> {
  if (rowId === null) {
    await db.insert(remoteSyncState).values({ lastPulledAtEpochMillis: epochMillis });
  } else {
    await db.update(remoteSyncState).set({ lastPulledAtEpochMillis: epochMillis }).where(eq(remoteSyncState.id, rowId));
  }
}

async function pullOnce(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  const { rowId, sinceIso } = await getWatermark();
  // The moment *before* querying, not after — anything written between now and the query
  // finishing lands after this watermark and gets picked up by the next pull, rather than being
  // silently skipped by a watermark set to "after" a query that took a few seconds.
  const pulledAtEpochMillis = Date.now();

  const { data: seriesRows, error: seriesError } = await supabase
    .from('series')
    .select('title, cover_url, genres, root_mal_id, type, manual_status, new_season_available, new_season_aired_at, liked, updated_by_device_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gt('updated_at', sinceIso);
  if (seriesError) return; // next debounced/periodic/foreground/realtime trigger retries
  await mergeRemoteSeries((seriesRows ?? []) as RemoteSeriesRow[]);

  const { data: entryRows, error: entryError } = await supabase
    .from('series_entries')
    .select(
      'mal_id, kind, order_index, title, episode_count, watch_state, airing_status, watched_arc_keys, updated_by_device_id, series!inner(root_mal_id)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .gt('updated_at', sinceIso);
  if (entryError) return;
  await mergeRemoteSeriesEntries((entryRows ?? []) as unknown as RemoteEntryRow[]);

  await setWatermark(rowId, pulledAtEpochMillis);
}

let realtimeChannel: RealtimeChannel | null = null;

/** (Re)subscribes to Realtime changes for the current session's own rows — called once up front
 * and again on every auth state change, since the filter is baked in per-user at subscribe time
 * and a stale channel from a previous session would either leak or silently stop matching. */
function resubscribeRealtime(userId: string | null): void {
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!userId) return;
  realtimeChannel = supabase
    .channel(`sync-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'series', filter: `user_id=eq.${userId}` }, () => requestPull())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'series_entries', filter: `user_id=eq.${userId}` }, () => requestPull())
    .subscribe();
}

/** Called once from src/sync/index.ts's startSyncEngine(). */
export function registerPullTriggers(): void {
  requestPull();
  supabase.auth.getSession().then(({ data: { session } }) => resubscribeRealtime(session?.user.id ?? null));
  supabase.auth.onAuthStateChange((_event, session) => resubscribeRealtime(session?.user.id ?? null));

  AppState.addEventListener('change', (state) => {
    if (state === 'active') requestPull();
  });
  setInterval(() => {
    void pullRemoteChanges();
  }, PERIODIC_MS);
}
