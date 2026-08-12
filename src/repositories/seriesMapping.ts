// Row <-> domain mapping for the `series`/`series_entries` tables in Supabase Postgres — the
// direct-Postgres-cutover replacement for AnimeRepository.ts's old toDomainSeries/groupRows (which
// mapped local SQLite rows). Lives in repositories/, not domain/, for the same reason apiCache.ts
// does: it's the seam between the wire format and the pure UI model, and keeping src/domain/ free
// of any storage-layer shape is what keeps its 13 Jest test files independent of both SQLite and
// Postgres. Every schema difference between the two backends is handled here and nowhere else —
// see each function's comment for the specific ones.
import { allArcsWatched, type Series, type SeriesEntry } from '@/domain/series';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import { arcsForMalId } from '@/domain/arcs';
import type { AiringStatus, EntryKind, ManualStatus, SeriesType, WatchState } from '@/domain/types';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

/** Raw Postgres `series` row shape, snake_case as PostgREST returns it. */
export interface SeriesRow {
  id: string;
  title: string;
  cover_url: string | null;
  genres: string[];
  root_mal_id: number;
  type: SeriesType;
  manual_status: ManualStatus;
  new_season_available: boolean;
  new_season_aired_at: string | null;
  liked: boolean;
}

/** Raw Postgres `series_entries` row shape. */
export interface SeriesEntryRow {
  id: string;
  series_id: string;
  mal_id: number;
  kind: EntryKind;
  order_index: number;
  title: string;
  episode_count: number;
  watch_state: WatchState;
  airing_status: AiringStatus;
  watched_arc_keys: string[] | null;
}

// Explicit column lists, never `select('*')` — this is what keeps version/updated_at/
// updated_by_device_id/deleted_at/user_id (sync/ownership bookkeeping columns with no UI meaning)
// from ever reaching the client.
export const SERIES_COLUMNS =
  'id, title, cover_url, genres, root_mal_id, type, manual_status, new_season_available, new_season_aired_at, liked';
export const ENTRY_COLUMNS =
  'id, series_id, mal_id, kind, order_index, title, episode_count, watch_state, airing_status, watched_arc_keys';

/** Raw row (with its already-matched entries) -> the UI-ready Series, deriving its watch status.
 * Same shape as the old SQLite-backed version, minus the id-type change and the timestamptz <->
 * epoch-millis conversion for new_season_aired_at. */
function toDomainSeries(row: SeriesRow, entryRows: SeriesEntryRow[]): Series {
  const sortedEntries = [...entryRows].sort((a, b) => a.order_index - b.order_index);
  const status = deriveSeriesStatus(
    row.manual_status,
    sortedEntries.map((e) => ({ kind: e.kind, orderIndex: e.order_index, watchState: e.watch_state })),
  );
  const entries: SeriesEntry[] = sortedEntries.map((e) => ({
    id: e.id,
    malId: e.mal_id,
    kind: e.kind,
    orderIndex: e.order_index,
    title: e.title,
    episodeCount: e.episode_count,
    watchState: e.watch_state,
    airingStatus: e.airing_status,
    watchedArcKeys: e.watched_arc_keys ?? null,
  }));
  return {
    id: row.id,
    title: row.title,
    coverUrl: row.cover_url,
    // PostgREST returns jsonb already parsed — no JSON.parse needed (unlike Drizzle's
    // mode:'json' TEXT column, which the old local schema used).
    genres: row.genres ?? [],
    rootMalId: row.root_mal_id,
    type: row.type,
    manualStatus: row.manual_status,
    status,
    entries,
    newSeasonAvailable: row.new_season_available,
    // Postgres stores this as `timestamptz`; the domain model keeps epoch millis (unchanged) since
    // hasVisibleNewSeasonAlert does epoch arithmetic and is Jest-tested against that shape.
    newSeasonAiredAtEpochMillis: row.new_season_aired_at ? Date.parse(row.new_season_aired_at) : null,
    liked: row.liked,
  };
}

/**
 * Groups flat series + entries rows (two parallel selects, not a nested PostgREST embed — see
 * AnimeRepository.ts's fetchLibrary for why) into domain Series[].
 *
 * Bucket the entries by series id in one pass rather than filtering per series — same O(n·m) ->
 * O(n+m) fix the old SQLite version had, worth keeping since this still runs on every library fetch.
 */
export function groupRows(seriesRows: SeriesRow[], entryRows: SeriesEntryRow[]): Series[] {
  const entriesBySeriesId = new Map<string, SeriesEntryRow[]>();
  for (const entry of entryRows) {
    const bucket = entriesBySeriesId.get(entry.series_id);
    if (bucket) bucket.push(entry);
    else entriesBySeriesId.set(entry.series_id, [entry]);
  }
  return seriesRows.map((row) => toDomainSeries(row, entriesBySeriesId.get(row.id) ?? []));
}

/**
 * Re-derives a series' status after its entries change — the piece that makes optimistic updates
 * correct. Flipping one entry's watchState without this would leave the status pill and "X of Y
 * seasons" counter stale until the next server round trip.
 */
export function reviseSeriesEntries(series: Series, entries: SeriesEntry[]): Series {
  const status = deriveSeriesStatus(
    series.manualStatus,
    entries.map((e) => ({ kind: e.kind, orderIndex: e.orderIndex, watchState: e.watchState })),
  );
  return { ...series, entries, status };
}

/** Same as reviseSeriesEntries, for the manual-status-change write path — status depends on both
 * inputs, so a manualStatus flip needs the same re-derivation as an entries flip does. */
export function reviseSeriesManualStatus(series: Series, manualStatus: ManualStatus): Series {
  const status = deriveSeriesStatus(
    manualStatus,
    series.entries.map((e) => ({ kind: e.kind, orderIndex: e.orderIndex, watchState: e.watchState })),
  );
  return { ...series, manualStatus, status };
}

/** Recomputes one entry's real watchState from its watched-arc set — mirrors the rule
 * setArcWatched used locally: WATCHED once every arc for that entry's MAL id is checked. */
export function nextArcWatchState(malId: number, watchedArcKeys: string[]): WatchState {
  return allArcsWatched(arcsForMalId(malId) ?? [], watchedArcKeys) ? 'WATCHED' : 'UNWATCHED';
}

/** Builds one `add_series`/`replace_library` RPC payload item from a not-yet-tracked
 * ReconcileSeries — the JSON shape both Postgres functions expect (see their SQL bodies). */
export function toSeriesPayload(item: ReconcileSeries) {
  return {
    title: item.title,
    cover_url: item.coverUrl,
    genres: item.genres,
    root_mal_id: item.rootMalId,
    type: item.type,
    manual_status: item.manualStatus,
    entries: item.entries.map((entry) => ({
      mal_id: entry.malId,
      kind: entry.kind,
      order_index: entry.orderIndex,
      title: entry.title,
      episode_count: entry.episodeCount,
      watch_state: entry.watchState,
      airing_status: entry.airingStatus,
    })),
  };
}
