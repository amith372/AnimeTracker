// The RN equivalent of the old app's AnimeRepository.kt — the only thing screens touch to read
// or write library data.
//
// One real architectural difference from the Kotlin version worth understanding: Room's
// `Flow<List<Series>>` is a framework-agnostic "cold stream" that Compose just happens to
// collect. Drizzle's reactive equivalent, `useLiveQuery`, is a *React hook* — reactivity in
// React is tied to the component lifecycle, there's no equivalent stream you can hold onto
// outside of one. So this file has two kinds of exports: plain `async function`s for one-shot
// reads/writes (usable anywhere, including future non-UI code like a background sync task), and
// `use*` hooks for reactive reads that a screen re-renders on automatically.
import { asc, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { db } from '@/db/client';
import { series, seriesEntries, syncMeta } from '@/db/schema';
import type { AiringStatus, EntryKind, ManualStatus, WatchState } from '@/domain/types';
import { allArcsWatched, type Series, type SeriesEntry } from '@/domain/series';
import { arcsForMalId } from '@/domain/arcs';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

type SeriesRow = typeof series.$inferSelect;
type SeriesEntryRow = typeof seriesEntries.$inferSelect;
/** The transaction handle Drizzle's sync expo-sqlite driver hands to a `db.transaction()` body. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Raw DB row (with its nested entries) -> the UI-ready Series, deriving its watch status. */
function toDomainSeries(row: SeriesRow & { entries: SeriesEntryRow[] }): Series {
  const sortedEntries = [...row.entries].sort((a, b) => a.orderIndex - b.orderIndex);
  const status = deriveSeriesStatus(
    row.manualStatus,
    sortedEntries.map((e) => ({ kind: e.kind, orderIndex: e.orderIndex, watchState: e.watchState })),
  );
  const entries: SeriesEntry[] = sortedEntries.map((e) => ({
    id: e.id,
    malId: e.malId,
    kind: e.kind,
    orderIndex: e.orderIndex,
    title: e.title,
    episodeCount: e.episodeCount,
    watchState: e.watchState,
    airingStatus: e.airingStatus,
    watchedArcKeys: e.watchedArcKeys ?? null,
  }));
  return {
    id: row.id,
    title: row.title,
    coverUrl: row.coverUrl,
    genres: row.genres,
    rootMalId: row.rootMalId,
    type: row.type,
    manualStatus: row.manualStatus,
    status,
    entries,
    newSeasonAvailable: row.newSeasonAvailable,
    newSeasonAiredAtEpochMillis: row.newSeasonAiredAtEpochMillis ?? null,
    liked: row.liked,
  };
}

/**
 * Groups flat series + entries rows into the nested shape toDomainSeries expects.
 *
 * This is two plain `useLiveQuery(db.select()...)` calls joined in JS, not one relational
 * `db.query.series.findMany({ with: { entries: true } })` call — found by testing tap-to-mark
 * live (not just at next app launch): the relational query builder's result didn't reliably
 * trigger a re-render when a *write* changed the data, even with `enableChangeListener: true` on
 * the connection, while two plain `select()` live queries do. Bug filed upstream is plausible;
 * this is the safer, better-documented pattern in the meantime.
 */
function groupRows(seriesRows: SeriesRow[], entryRows: SeriesEntryRow[]): Series[] {
  // Bucket the entries by series id in one pass. This used to run `entryRows.filter(...)` once per
  // series — O(series x entries), which for a few hundred shows and a couple of thousand entries is
  // hundreds of thousands of comparisons on *every* render of the Library and Recommendations.
  const entriesBySeriesId = new Map<number, SeriesEntryRow[]>();
  for (const entry of entryRows) {
    const bucket = entriesBySeriesId.get(entry.seriesId);
    if (bucket) bucket.push(entry);
    else entriesBySeriesId.set(entry.seriesId, [entry]);
  }
  return seriesRows.map((row) => toDomainSeries({ ...row, entries: entriesBySeriesId.get(row.id) ?? [] }));
}

/**
 * Reactive whole-library read, sorted by title — screens call this to render the Library list.
 *
 * Memoized on the two row arrays, so an unrelated re-render reuses the same Series objects rather
 * than rebuilding them. That identity matters beyond the wasted work: `useCatchUp` feeds this
 * straight into the Recommendations screen's `genreOptions` memo, which a fresh array would
 * invalidate on every single render.
 */
export function useAllSeries(): Series[] {
  const { data: seriesRows } = useLiveQuery(db.select().from(series).orderBy(asc(series.title)));
  const { data: entryRows } = useLiveQuery(db.select().from(seriesEntries));
  return useMemo(() => groupRows(seriesRows ?? [], entryRows ?? []), [seriesRows, entryRows]);
}

/** Reactive read of one series by id, for the Detail screen. */
export function useSeries(id: number): Series | null {
  const { data: seriesRows } = useLiveQuery(db.select().from(series).where(eq(series.id, id)));
  const { data: entryRows } = useLiveQuery(db.select().from(seriesEntries).where(eq(seriesEntries.seriesId, id)));
  const row = seriesRows?.[0];
  return row ? toDomainSeries({ ...row, entries: entryRows ?? [] }) : null;
}

/** One-shot read for non-component contexts (e.g. a future background sync task). */
export async function getAllSeriesOnce(): Promise<Series[]> {
  const rows = await db.query.series.findMany({ with: { entries: true } });
  return rows.map(toDomainSeries);
}

/** Sets one entry's watch state — what tap-to-mark and the "won't watch" toggle both write. */
export async function setEntryWatchState(entryId: number, watchState: WatchState): Promise<void> {
  await db.update(seriesEntries).set({ watchState }).where(eq(seriesEntries.id, entryId));
}

/**
 * Toggles one arc's checkbox for the one entry that has arcs (see domain/arcs.ts), and keeps the
 * entry's real watchState derived from the resulting set: WATCHED once every arc is checked,
 * UNWATCHED otherwise. This is what keeps status derivation, push, and sync working against an
 * ordinary single TV_SEASON entry with no changes of their own — they only ever read watchState,
 * never watchedArcKeys.
 */
export async function setArcWatched(entryId: number, arcKey: string, watched: boolean): Promise<void> {
  const [row] = await db
    .select({ malId: seriesEntries.malId, watchedArcKeys: seriesEntries.watchedArcKeys })
    .from(seriesEntries)
    .where(eq(seriesEntries.id, entryId));
  if (!row) return;
  const current = new Set(row.watchedArcKeys ?? []);
  if (watched) current.add(arcKey);
  else current.delete(arcKey);
  const nextKeys = Array.from(current);
  const nextWatchState: WatchState = allArcsWatched(arcsForMalId(row.malId) ?? [], nextKeys) ? 'WATCHED' : 'UNWATCHED';
  await db
    .update(seriesEntries)
    .set({ watchedArcKeys: nextKeys, watchState: nextWatchState })
    .where(eq(seriesEntries.id, entryId));
}

/** Flips a series' "liked" flag — feeds into recommendation scoring (Phase 6). */
export async function setSeriesLiked(seriesId: number, liked: boolean): Promise<void> {
  await db.update(series).set({ liked }).where(eq(series.id, seriesId));
}

/**
 * Sets (or clears) the user's manual status override for a series — CLAUDE.md §5's "Edit status",
 * and the only way to reach WATCHED_FORGOT, which has no MAL equivalent. Writing `NONE` clears the
 * override so status goes back to being derived from which seasons are watched.
 *
 * Purely local, like every status write in this app: we never PATCH/PUT/DELETE back to MAL.
 */
export async function setSeriesManualStatus(seriesId: number, manualStatus: ManualStatus): Promise<void> {
  await db.update(series).set({ manualStatus }).where(eq(series.id, seriesId));
}

/**
 * Inserts one grouped series + its entries. Takes a `tx` because a series and its entries must
 * always be written together — a series row with no entries would derive as "Watched" and be
 * unfixable from the UI, since there'd be nothing to tick.
 *
 * Note the synchronous `.run()`/`.all()` calls: expo-sqlite is Drizzle's *sync* driver, and its
 * `transaction()` takes a plain `(tx) => T` callback that it does not await. Handing it an async
 * callback would commit the transaction while the writes were still pending, which is worse than
 * having no transaction at all.
 */
function insertSeriesTx(tx: Transaction, item: ReconcileSeries): number {
  const [insertedSeries] = tx
    .insert(series)
    .values({
      title: item.title,
      coverUrl: item.coverUrl,
      genres: item.genres,
      rootMalId: item.rootMalId,
      type: item.type,
      manualStatus: item.manualStatus,
    })
    .returning({ id: series.id })
    .all();
  if (item.entries.length > 0) {
    tx.insert(seriesEntries)
      .values(
        item.entries.map((entry) => ({
          seriesId: insertedSeries.id,
          malId: entry.malId,
          kind: entry.kind,
          orderIndex: entry.orderIndex,
          title: entry.title,
          episodeCount: entry.episodeCount,
          watchState: entry.watchState,
          airingStatus: entry.airingStatus,
        })),
      )
      .run();
  }
  return insertedSeries.id;
}

/**
 * Wipes the whole local library and replaces it with a fresh (reconciled) import result.
 *
 * All of it in one transaction, because the delete half is destructive and the insert half can
 * fail: previously a failure (or the app being killed) partway through the per-series insert loop
 * left the user with a half-empty — or entirely empty — library, and the freshly imported data
 * that would have refilled it was only ever held in the reconcile screen's React state, which is
 * gone by then. Now either the whole replacement lands or the old library is untouched.
 */
export async function replaceAllSeries(items: ReconcileSeries[]): Promise<void> {
  db.transaction((tx) => {
    tx.delete(seriesEntries).run();
    tx.delete(series).run();
    for (const item of items) insertSeriesTx(tx, item);
  });
}

/** Adds a single new series (from Discover/Recommendations) without touching the rest of the
 * library. Returns the new local series id, so a caller navigating straight from a not-yet-
 * tracked preview into the real Detail screen knows which id to push. */
export async function addSeries(item: ReconcileSeries): Promise<number> {
  return db.transaction((tx) => insertSeriesTx(tx, item));
}

/** Reactive set of every MAL id already tracked (any season/movie in any series) — Discover uses
 * this to filter out results the user already has, whole series at a time. */
export function useTrackedMalIds(): Set<number> {
  const { data } = useLiveQuery(db.select({ malId: seriesEntries.malId }).from(seriesEntries));
  return new Set((data ?? []).map((row) => row.malId));
}

/** Marks onboarding import as done — a single sync_meta row's mere existence means "imported". */
export async function markInitialImportComplete(): Promise<void> {
  await recordSyncRun();
}

/**
 * Stamps `lastSyncEpoch` on the singleton sync_meta row, creating it if this is the first run.
 *
 * Shared by the onboarding import and the monthly sync. The column existed from the start but only
 * the import ever wrote it, so "when did we last check for new seasons" was never actually
 * recorded — a sync could run every month for a year and the value would still read as the day the
 * user first imported.
 */
export async function recordSyncRun(): Promise<void> {
  const existing = await db.select({ id: syncMeta.id }).from(syncMeta).limit(1);
  if (existing.length > 0) {
    await db.update(syncMeta).set({ lastSyncEpoch: Date.now() }).where(eq(syncMeta.id, existing[0].id));
  } else {
    await db.insert(syncMeta).values({ lastSyncEpoch: Date.now() });
  }
}

/** Reactive check for whether onboarding import has completed — gates Library vs. Reconcile. */
export function useHasCompletedInitialImport(): boolean | null {
  const { data } = useLiveQuery(db.select({ id: syncMeta.id }).from(syncMeta).limit(1));
  if (data === undefined) return null;
  return data.length > 0;
}

/** A season/movie found by the monthly sync, not yet written to SQLite. */
export interface NewSeriesEntry {
  malId: number;
  kind: EntryKind;
  orderIndex: number;
  title: string;
  episodeCount: number;
  airingStatus: AiringStatus;
}

/** Appends newly-discovered seasons to an already-tracked series (monthly sync only — Discover
 * and reconcile create whole new series instead, see addSeries/replaceAllSeries). */
export async function addNewEntries(seriesId: number, entries: NewSeriesEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.insert(seriesEntries).values(
    entries.map((entry) => ({
      seriesId,
      malId: entry.malId,
      kind: entry.kind,
      orderIndex: entry.orderIndex,
      title: entry.title,
      episodeCount: entry.episodeCount,
      watchState: 'UNWATCHED' as const,
      airingStatus: entry.airingStatus,
    })),
  );
}

/** Sets the "new season!" flag + when that season airs — cleared when the user opens the Detail
 * screen (see clearNewSeasonAvailable). `airedAtEpochMillis` feeds hasVisibleNewSeasonAlert's
 * "hide once it's over a year old" rule; null if the new season's air date is unknown. */
export async function setNewSeasonAvailable(seriesId: number, airedAtEpochMillis: number | null): Promise<void> {
  await db
    .update(series)
    .set({ newSeasonAvailable: true, newSeasonAiredAtEpochMillis: airedAtEpochMillis })
    .where(eq(series.id, seriesId));
}

/** Clears the "new season!" flag — called when the user opens that series' Detail screen. */
export async function clearNewSeasonAvailable(seriesId: number): Promise<void> {
  await db.update(series).set({ newSeasonAvailable: false }).where(eq(series.id, seriesId));
}
