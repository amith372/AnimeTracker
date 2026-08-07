import { seasonProgress } from '@/domain/series';
import type { SeriesEntry } from '@/domain/series';

function entry(id: number, kind: SeriesEntry['kind'], watchState: SeriesEntry['watchState']): SeriesEntry {
  return { id, malId: id, kind, orderIndex: id, title: `entry ${id}`, episodeCount: 12, watchState, airingStatus: 'FINISHED', watchedArcKeys: null };
}

test('counts resolved (watched or wont-watch) TV seasons out of the total, ignoring movies', () => {
  const entries = [
    entry(1, 'TV_SEASON', 'WATCHED'),
    entry(2, 'TV_SEASON', 'WONT_WATCH'),
    entry(3, 'TV_SEASON', 'UNWATCHED'),
    entry(4, 'MOVIE', 'WATCHED'),
  ];
  expect(seasonProgress(entries)).toEqual({ watched: 2, total: 3 });
});

test('a standalone movie with no seasons reports 0 of 0', () => {
  expect(seasonProgress([entry(1, 'MOVIE', 'WATCHED')])).toEqual({ watched: 0, total: 0 });
});

test('does not require consecutive resolution — unlike deriveSeriesStatus this is a plain count', () => {
  const entries = [
    entry(1, 'TV_SEASON', 'UNWATCHED'),
    entry(2, 'TV_SEASON', 'WATCHED'),
  ];
  expect(seasonProgress(entries)).toEqual({ watched: 1, total: 2 });
});
