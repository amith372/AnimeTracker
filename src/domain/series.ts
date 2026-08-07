import type { Arc } from './arcs';
import { isResolved, type AiringStatus, type EntryKind, type ManualStatus, type SeriesType, type WatchState } from './types';
import type { SeriesStatus } from './seriesStatus';

export interface SeriesEntry {
  id: number;
  malId: number;
  kind: EntryKind;
  orderIndex: number;
  title: string;
  episodeCount: number;
  watchState: WatchState;
  airingStatus: AiringStatus;
  // Per-arc checkbox state for the one entry that has arcs (see domain/arcs.ts). Null for every
  // other entry in the app.
  watchedArcKeys: string[] | null;
}

/** The fully-assembled, UI-ready view of one tracked show — what the Library/Detail screens render. */
export interface Series {
  id: number;
  title: string;
  coverUrl: string | null;
  genres: string[];
  rootMalId: number;
  type: SeriesType;
  manualStatus: ManualStatus;
  status: SeriesStatus;
  entries: SeriesEntry[];
  newSeasonAvailable: boolean;
  newSeasonAiredAtEpochMillis: number | null;
  liked: boolean;
}

const ONE_YEAR_MILLIS = 365 * 24 * 60 * 60 * 1000;

/**
 * Whether the "New season!" badge is still warranted. A season that aired over a year ago
 * (e.g. sync just hadn't run in a while) shows as a plain "Watched X/Y" instead of "new" — but
 * if we don't know the air date, default to showing it rather than silently hiding a real alert.
 */
export function hasVisibleNewSeasonAlert(series: Series, nowEpochMillis: number = Date.now()): boolean {
  if (!series.newSeasonAvailable) return false;
  if (series.newSeasonAiredAtEpochMillis === null) return true;
  return nowEpochMillis - series.newSeasonAiredAtEpochMillis <= ONE_YEAR_MILLIS;
}

/**
 * Powers the Series Detail screen's "X of Y seasons" counter — a plain resolved-count over TV
 * seasons only (movies aren't part of this tally, same reasoning as deriveSeriesStatus: they're a
 * separate backlog with no running order). Unlike deriveSeriesStatus's "X" (the longest
 * *consecutive* run from season 1), this is a plain count — the counter is meant to answer "how
 * much of this have I gotten through", not "where's the gap".
 */
export function seasonProgress(entries: SeriesEntry[]): { watched: number; total: number } {
  const seasons = entries.filter((e) => e.kind === 'TV_SEASON');
  return { watched: seasons.filter((e) => isResolved(e.watchState)).length, total: seasons.length };
}

/**
 * Numbers each entry within its own kind (1st season, 2nd season, ... / 1st movie, 2nd movie,
 * ...) so a season/movie list can label a row "Season 2" instead of the series-wide `orderIndex`,
 * which is 0-indexed and, for movies, offset by however many seasons precede them. Entries must
 * already be sorted by `orderIndex` (true both of a tracked Series' entries — see
 * AnimeRepository's `toDomainSeries` — and of a not-yet-tracked ReconcileSeries' entries, which
 * come pre-sorted from grouping), so a single pass in order is enough. Generic over any entry with
 * a `kind`, so both SeriesEntry (Detail screen) and ReconcileEntry (the not-yet-tracked preview
 * screen) can share it.
 */
export function numberEntriesByKind<T extends { kind: EntryKind }>(entries: T[]): { entry: T; kindNumber: number }[] {
  let seasonCount = 0;
  let movieCount = 0;
  return entries.map((entry) => {
    const kindNumber = entry.kind === 'MOVIE' ? ++movieCount : ++seasonCount;
    return { entry, kindNumber };
  });
}

/**
 * Whether every defined arc for an entry is checked — the condition setArcWatched uses to decide
 * the underlying entry's real watchState (WATCHED once true). Pure so it's independently testable.
 */
export function allArcsWatched(arcs: Arc[], watchedArcKeys: string[] | null): boolean {
  const watched = new Set(watchedArcKeys ?? []);
  return arcs.length > 0 && arcs.every((a) => watched.has(a.key));
}
