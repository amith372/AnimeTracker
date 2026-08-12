// The only thing screens touch to read or write library data — same role as the old SQLite-backed
// version, now backed directly by Supabase Postgres (no local mirror, see CLAUDE.md's "What this
// is"). Two kinds of exports, same split as before and for the same reason (React's reactivity is
// tied to the component lifecycle): `use*` hooks for reactive reads, built on TanStack Query
// instead of Drizzle's useLiveQuery; plain `async function`s for one-shot reads/writes, usable
// anywhere including non-component code (MalPushRepository, RecommendationRepository).
//
// The whole library is one query (`libraryKeys.library(userId)`), not one query per series —
// useSeries(id) below just selects out of it. That single cache entry is what `useCatchUp`
// (RecommendationRepository.ts) relies on for a stable object identity across renders; see
// useLibrary's comment.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountSession } from '@/account/accountRepository';
import { supabase } from '@/account/supabaseClient';
import type { ManualStatus, WatchState } from '@/domain/types';
import type { Series } from '@/domain/series';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { libraryKeys, queryClient } from './queryClient';
import {
  ENTRY_COLUMNS,
  SERIES_COLUMNS,
  groupRows,
  nextArcWatchState,
  reviseSeriesEntries,
  reviseSeriesManualStatus,
  toSeriesPayload,
  type SeriesEntryRow,
  type SeriesRow,
} from './seriesMapping';

/** The signed-in user's id, or null for a guest/signed-out session — every read/write below is
 * scoped to this. */
async function currentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/** Same as currentUserId, but throws a message fit to show the user — every write goes through
 * this rather than currentUserId, since a write with no signed-in owner is a real error, not a
 * guest's normal "nothing to show" state. Defense-in-depth behind the UI's own sign-in gates. */
async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Sign in to track shows.');
  return userId;
}

async function fetchLibrary(userId: string): Promise<Series[]> {
  const [seriesRes, entryRes] = await Promise.all([
    supabase.from('series').select(SERIES_COLUMNS).eq('user_id', userId).is('deleted_at', null).order('title'),
    supabase.from('series_entries').select(ENTRY_COLUMNS).eq('user_id', userId).is('deleted_at', null),
  ]);
  if (seriesRes.error) throw seriesRes.error;
  if (entryRes.error) throw entryRes.error;
  return groupRows(seriesRes.data as unknown as SeriesRow[], entryRes.data as unknown as SeriesEntryRow[]);
}

/**
 * Reactive whole-library read. Unlike the old SQLite version this can genuinely be "loading" (a
 * network fetch, not a local read), so unlike useAllSeries below this reports that explicitly —
 * screens that would otherwise flash "Nothing here yet" on every cold start (the Library screen)
 * should use this, not useAllSeries.
 */
export function useLibrary(): { series: Series[]; isLoading: boolean; error: Error | null } {
  const { session, loading: sessionLoading } = useAccountSession();
  const userId = session?.user.id ?? null;
  const query = useQuery({
    queryKey: libraryKeys.library(userId ?? 'anonymous'),
    queryFn: () => fetchLibrary(userId!),
    enabled: !!userId,
  });
  if (sessionLoading) return { series: [], isLoading: true, error: null };
  if (!userId) return { series: [], isLoading: false, error: null };
  return { series: query.data ?? [], isLoading: query.isPending, error: query.error as Error | null };
}

/** Reactive whole-library read for callers that don't need to distinguish "loading" from "empty"
 * (Catch up, tracked-id filtering) — see useLibrary for the one screen that does need to. */
export function useAllSeries(): Series[] {
  return useLibrary().series;
}

/** Reactive read of one series by id, for the Detail screen — selects out of the same cached
 * library query useLibrary/useAllSeries use, rather than a separate network round trip. */
export function useSeries(id: string): Series | null {
  const series = useAllSeries();
  return series.find((s) => s.id === id) ?? null;
}

/** One-shot read for non-component contexts (Recommendations, Push to MAL). Reuses the cached
 * library query via fetchQuery rather than issuing a redundant round trip, so what gets pushed to
 * MAL matches exactly what's on screen. Returns [] for a guest — this is a read, not a write, so
 * "nothing to show" is the correct answer rather than an error. */
export async function getAllSeriesOnce(): Promise<Series[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  return queryClient.fetchQuery({ queryKey: libraryKeys.library(userId), queryFn: () => fetchLibrary(userId) });
}

/** Reactive set of every MAL id already tracked (any season/movie in any series) — Discover uses
 * this to filter out results the user already has, whole series at a time. */
export function useTrackedMalIds(): Set<number> {
  const series = useAllSeries();
  return useMemo(() => new Set(series.flatMap((s) => s.entries.map((e) => e.malId))), [series]);
}

/**
 * Applies an optimistic update to the cached library immediately, then commits the real write.
 * On failure the optimistic change is rolled back and the error re-thrown — callers (screens) are
 * expected to catch it and show feedback (see app/series/[id].tsx's runWrite).
 *
 * No onSettled refetch on success: the server's post-write state is byte-identical to the
 * optimistic one (same fields the write actually changed), and Realtime's echo of this device's
 * own write triggers realtime.ts's debounced invalidate anyway — an immediate refetch per write
 * would mean, e.g., 12 redundant round trips for a 12-season "mark all watched".
 */
async function optimisticLibraryUpdate(
  apply: (current: Series[]) => Series[],
  commit: (userId: string) => Promise<void>,
): Promise<void> {
  const userId = await requireUserId();
  const key = libraryKeys.library(userId);
  await queryClient.cancelQueries({ queryKey: key });
  const previous = queryClient.getQueryData<Series[]>(key);
  queryClient.setQueryData<Series[]>(key, (current) => apply(current ?? []));
  try {
    await commit(userId);
  } catch (e) {
    queryClient.setQueryData(key, previous);
    throw e;
  }
}

/** Sets one entry's watch state — what tap-to-mark and the "won't watch" toggle both write. */
export async function setEntryWatchState(entryId: string, watchState: WatchState): Promise<void> {
  await optimisticLibraryUpdate(
    (current) =>
      current.map((s) => {
        if (!s.entries.some((e) => e.id === entryId)) return s;
        const entries = s.entries.map((e) => (e.id === entryId ? { ...e, watchState } : e));
        return reviseSeriesEntries(s, entries);
      }),
    async () => {
      const { error } = await supabase.from('series_entries').update({ watch_state: watchState }).eq('id', entryId);
      if (error) throw error;
    },
  );
}

/**
 * Toggles one arc's checkbox for the one entry that has arcs (see domain/arcs.ts), and keeps the
 * entry's real watchState derived from the resulting set: WATCHED once every arc is checked,
 * UNWATCHED otherwise. Reads the entry's current watchedArcKeys from the already-cached library
 * instead of a separate SELECT (the whole library is already in memory client-side, unlike the old
 * SQLite version which had to query for it).
 */
export async function setArcWatched(entryId: string, arcKey: string, watched: boolean): Promise<void> {
  const userId = await requireUserId();
  const cached = queryClient.getQueryData<Series[]>(libraryKeys.library(userId)) ?? [];
  let malId: number | null = null;
  let nextKeys: string[] = [];
  for (const s of cached) {
    const entry = s.entries.find((e) => e.id === entryId);
    if (!entry) continue;
    malId = entry.malId;
    const keys = new Set(entry.watchedArcKeys ?? []);
    if (watched) keys.add(arcKey);
    else keys.delete(arcKey);
    nextKeys = Array.from(keys);
    break;
  }
  if (malId === null) return; // entry not found in cache — nothing to do
  const nextWatchState = nextArcWatchState(malId, nextKeys);

  await optimisticLibraryUpdate(
    (current) =>
      current.map((s) => {
        if (!s.entries.some((e) => e.id === entryId)) return s;
        const entries = s.entries.map((e) =>
          e.id === entryId ? { ...e, watchedArcKeys: nextKeys, watchState: nextWatchState } : e,
        );
        return reviseSeriesEntries(s, entries);
      }),
    async () => {
      const { error } = await supabase
        .from('series_entries')
        .update({ watched_arc_keys: nextKeys, watch_state: nextWatchState })
        .eq('id', entryId);
      if (error) throw error;
    },
  );
}

/** Flips a series' "liked" flag — feeds into recommendation scoring (Phase 6). */
export async function setSeriesLiked(seriesId: string, liked: boolean): Promise<void> {
  await optimisticLibraryUpdate(
    (current) => current.map((s) => (s.id === seriesId ? { ...s, liked } : s)),
    async () => {
      const { error } = await supabase.from('series').update({ liked }).eq('id', seriesId);
      if (error) throw error;
    },
  );
}

/**
 * Sets (or clears) the user's manual status override for a series — CLAUDE.md §5's "Edit status",
 * and the only way to reach WATCHED_FORGOT, which has no MAL equivalent. Writing `NONE` clears the
 * override so status goes back to being derived from which seasons are watched.
 *
 * Purely local-to-this-write, like every status write in this app: we never PATCH/PUT/DELETE back
 * to MAL (see CLAUDE.md §8 for the one deliberate exception, Push).
 */
export async function setSeriesManualStatus(seriesId: string, manualStatus: ManualStatus): Promise<void> {
  await optimisticLibraryUpdate(
    (current) => current.map((s) => (s.id === seriesId ? reviseSeriesManualStatus(s, manualStatus) : s)),
    async () => {
      const { error } = await supabase.from('series').update({ manual_status: manualStatus }).eq('id', seriesId);
      if (error) throw error;
    },
  );
}

/** Clears the "new season!" flag — called when the user opens that series' Detail screen. */
export async function clearNewSeasonAvailable(seriesId: string): Promise<void> {
  await optimisticLibraryUpdate(
    (current) => current.map((s) => (s.id === seriesId ? { ...s, newSeasonAvailable: false } : s)),
    async () => {
      const { error } = await supabase.from('series').update({ new_season_available: false }).eq('id', seriesId);
      if (error) throw error;
    },
  );
}

/**
 * Wipes the whole library and replaces it with a fresh (reconciled) import result — the
 * onboarding-import write path. Delegates the whole delete-then-reinsert to the `replace_library`
 * Postgres RPC (single round trip, single transaction — see that function's migration comment for
 * why a client-side loop of individual writes is the wrong shape here), then invalidates the cache
 * so the Library screen picks up the new rows.
 */
export async function replaceAllSeries(items: ReconcileSeries[]): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.rpc('replace_library', { payload: items.map(toSeriesPayload) });
  if (error) throw error;
  await queryClient.invalidateQueries({ queryKey: libraryKeys.library(userId) });
}

/**
 * Adds a single new series (from Discover/Recommendations) without touching the rest of the
 * library, via the `add_series` RPC (series + entries in one round trip — see that function's
 * migration comment: a series row with no entries would derive as "Watched" and be unfixable from
 * the UI). Returns the new series' server-assigned id, so a caller navigating straight from a
 * not-yet-tracked preview into the real Detail screen knows which id to push to.
 */
export async function addSeries(item: ReconcileSeries): Promise<string> {
  const userId = await requireUserId();
  const { data, error } = await supabase.rpc('add_series', { payload: toSeriesPayload(item) });
  if (error) {
    // unique(user_id, root_mal_id) — the show is already tracked. Surface a message worth showing
    // rather than a raw Postgres error code.
    if (error.code === '23505') throw new Error('This show is already in your library.');
    throw error;
  }
  await queryClient.invalidateQueries({ queryKey: libraryKeys.library(userId) });
  return data as string;
}

/**
 * Inserts several new series at once, leaving the rest of the library untouched — the additive MAL
 * sync's write path (see ImportRepository.runAdditiveSync).
 *
 * Calls the `add_series` RPC directly rather than looping addSeries(): that wrapper invalidates the
 * library query on every call, which for a batch would mean N refetches of the whole library for
 * one user action. One invalidation at the end instead.
 *
 * Best-effort per series, matching how Import/Discover/Push already treat batches — one show MAL
 * returned something odd for shouldn't cost the user the other nineteen. A 23505 is counted as
 * neither added nor failed: unique(user_id, root_mal_id) means the show is already there, which is
 * the desired end state, not an error worth reporting.
 */
export async function addImportedSeries(items: ReconcileSeries[]): Promise<{ added: number; failed: number }> {
  const userId = await requireUserId();
  let added = 0;
  let failed = 0;
  for (const item of items) {
    const { error } = await supabase.rpc('add_series', { payload: toSeriesPayload(item) });
    if (!error) added++;
    else if (error.code !== '23505') failed++;
  }
  await queryClient.invalidateQueries({ queryKey: libraryKeys.library(userId) });
  return { added, failed };
}

async function fetchLibraryMeta(userId: string): Promise<{ initialImportCompletedAt: string | null }> {
  const { data, error } = await supabase
    .from('user_library_meta')
    .select('initial_import_completed_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { initialImportCompletedAt: data?.initial_import_completed_at ?? null };
}

/** Marks onboarding import as done — see supabase/migrations/20260812000000_direct_postgres.sql's
 * user_library_meta table, the server-side (per-account, not per-device) replacement for the old
 * local-only sync_meta. Also stamps last_sync_at, matching what the old recordSyncRun did. */
export async function markInitialImportComplete(): Promise<void> {
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('user_library_meta')
    .upsert({ user_id: userId, initial_import_completed_at: now, last_sync_at: now });
  if (error) throw error;
  // setQueryData, NOT invalidateQueries — invalidating caused a full re-import loop. At this point
  // the caller (onboarding/reconcile.tsx's confirm) is about to router.replace('/'), so the Library
  // screen is unmounted and this query is *inactive*: invalidation therefore only marks it stale
  // without refetching. The Library then remounts, TanStack synchronously hands back the stale
  // cached value from before the import (initialImportCompletedAt: null) while refetching in the
  // background, and because that's cached-but-stale rather than absent, `isPending` is false — so
  // useHasCompletedInitialImport returns false, the gate redirects straight back to reconcile, and
  // the whole MAL import runs again before the fresh value ever lands. We know exactly what we just
  // wrote, so write it into the cache and skip the round trip entirely.
  queryClient.setQueryData(libraryKeys.meta(userId), { initialImportCompletedAt: now });
}

/**
 * Stamps `last_sync_at` only, for the additive sync's "we checked MAL just now" bookkeeping.
 * Deliberately not markInitialImportComplete(), which also writes initial_import_completed_at —
 * that column is the Library-vs-Reconcile onboarding gate and must keep its original timestamp.
 * Best-effort: failing to record when we last looked must not fail a sync that already inserted.
 */
export async function markLastSync(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await supabase.from('user_library_meta').upsert({ user_id: userId, last_sync_at: new Date().toISOString() });
}

/** Reactive check for whether onboarding import has completed — gates Library vs. Reconcile.
 * Tri-state preserved from the old hook: null means "still loading/unknown", not "no". */
export function useHasCompletedInitialImport(): boolean | null {
  const { session, loading: sessionLoading } = useAccountSession();
  const userId = session?.user.id ?? null;
  const query = useQuery({
    queryKey: libraryKeys.meta(userId ?? 'anonymous'),
    queryFn: () => fetchLibraryMeta(userId!),
    enabled: !!userId,
  });
  if (sessionLoading || !userId) return null;
  if (query.isPending) return null;
  return query.data?.initialImportCompletedAt != null;
}
