import { buildPushTargets } from '@/domain/malPush';
import type { Series, SeriesEntry } from '@/domain/series';
import type { SeriesStatus } from '@/domain/seriesStatus';
import type { EntryKind, WatchState } from '@/domain/types';

function entry(malId: number, watchState: WatchState, kind: EntryKind = 'TV_SEASON'): SeriesEntry {
  return { id: String(malId), malId, kind, orderIndex: malId, title: `entry ${malId}`, episodeCount: 12, watchState, airingStatus: 'FINISHED', watchedArcKeys: null };
}

/** Only the fields buildPushTargets actually reads (`status.kind`, `entries`) matter; the rest are
 * filled with harmless placeholders so each test can stay focused on what it's checking. */
function series(status: SeriesStatus, entries: SeriesEntry[]): Series {
  return {
    id: '1',
    title: 'Test Series',
    coverUrl: null,
    genres: [],
    rootMalId: entries[0]?.malId ?? 1,
    type: 'SERIES',
    manualStatus: 'NONE',
    status,
    entries,
    newSeasonAvailable: false,
    newSeasonAiredAtEpochMillis: null,
    liked: false,
  };
}

test('PLAN pushes plan_to_watch to every entry', () => {
  const s = series({ kind: 'PLAN' }, [entry(1, 'UNWATCHED'), entry(2, 'UNWATCHED', 'MOVIE')]);
  expect(buildPushTargets(s)).toEqual([
    { malId: 1, status: 'PLAN_TO_WATCH' },
    { malId: 2, status: 'PLAN_TO_WATCH' },
  ]);
});

test('CURRENTLY_WATCHING pushes watching to every entry', () => {
  const s = series({ kind: 'CURRENTLY_WATCHING' }, [entry(1, 'WATCHED'), entry(2, 'UNWATCHED')]);
  expect(buildPushTargets(s)).toEqual([
    { malId: 1, status: 'WATCHING' },
    { malId: 2, status: 'WATCHING' },
  ]);
});

test('WATCHED pushes completed to every entry (all resolved WATCHED by definition)', () => {
  const s = series({ kind: 'WATCHED' }, [entry(1, 'WATCHED'), entry(2, 'WATCHED', 'MOVIE')]);
  expect(buildPushTargets(s)).toEqual([
    { malId: 1, status: 'COMPLETED' },
    { malId: 2, status: 'COMPLETED' },
  ]);
});

test('WATCHED_PARTIAL only pushes completed for entries actually marked WATCHED', () => {
  const partial: SeriesStatus = { kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 2, watchedMovies: 0, totalMovies: 0 };
  const s = series(partial, [entry(1, 'WATCHED'), entry(2, 'UNWATCHED')]);
  // Entry 2 is still UNWATCHED — pushing it as completed just because the series reads
  // "Watched 1/2" would falsely mark an unseen season finished on the user's real MAL account.
  expect(buildPushTargets(s)).toEqual([{ malId: 1, status: 'COMPLETED' }]);
});

test('WATCHED_PARTIAL skips WONT_WATCH entries too — no MAL status for it', () => {
  const partial: SeriesStatus = { kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 2, watchedMovies: 0, totalMovies: 0 };
  const s = series(partial, [entry(1, 'WATCHED'), entry(2, 'WONT_WATCH')]);
  expect(buildPushTargets(s)).toEqual([{ malId: 1, status: 'COMPLETED' }]);
});

test('DROPPED is never pushed, even though MAL has a direct equivalent', () => {
  const s = series({ kind: 'DROPPED' }, [entry(1, 'WATCHED')]);
  expect(buildPushTargets(s)).toEqual([]);
});

test('WATCHED_FORGOT is never pushed — no MAL equivalent to push to', () => {
  const s = series({ kind: 'WATCHED_FORGOT' }, [entry(1, 'WATCHED')]);
  expect(buildPushTargets(s)).toEqual([]);
});
