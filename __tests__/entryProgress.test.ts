import { entryProgress } from '@/domain/series';
import type { SeriesEntry } from '@/domain/series';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import { progressPhrase, statusLabel } from '@/domain/statusLabel';

function entry(id: number, kind: SeriesEntry['kind'], watchState: SeriesEntry['watchState']): SeriesEntry {
  return { id: String(id), malId: id, kind, orderIndex: id, title: `entry ${id}`, episodeCount: 12, watchState, airingStatus: 'FINISHED', watchedArcKeys: null };
}

describe('entryProgress', () => {
  test('counts seasons and movies as two independent resolved-of-total halves', () => {
    // Three seasons, of which S1 is watched and S2 is won't-watch (resolved counts both) and S3
    // is outstanding -> 2/3. Two movies, of which one is watched -> 1/2.
    const entries = [
      entry(1, 'TV_SEASON', 'WATCHED'),
      entry(2, 'TV_SEASON', 'WONT_WATCH'),
      entry(3, 'TV_SEASON', 'UNWATCHED'),
      entry(4, 'MOVIE', 'WATCHED'),
      entry(5, 'MOVIE', 'UNWATCHED'),
    ];
    expect(entryProgress(entries)).toEqual({ seasons: { watched: 2, total: 3 }, movies: { watched: 1, total: 2 } });
  });

  test('a standalone movie reports an empty seasons half rather than no movie count', () => {
    // The whole point of dropping the old seasons-only gate: this series has exactly one thing to
    // track and it is a film.
    expect(entryProgress([entry(1, 'MOVIE', 'UNWATCHED')])).toEqual({
      seasons: { watched: 0, total: 0 },
      movies: { watched: 0, total: 1 },
    });
  });

  test('does not require consecutive resolution — unlike deriveSeriesStatus this is a plain count', () => {
    const entries = [entry(1, 'TV_SEASON', 'UNWATCHED'), entry(2, 'TV_SEASON', 'WATCHED')];
    // Season 1 unwatched, season 2 watched: one of two seen, but the run from season 1 is empty.
    expect(entryProgress(entries).seasons).toEqual({ watched: 1, total: 2 });
    const status = deriveSeriesStatus('NONE', entries);
    expect(status.kind === 'WATCHED_PARTIAL' && status.watchedSeasons).toBe(0);
  });
});

describe('progressPhrase', () => {
  test('words both halves, seasons first', () => {
    expect(progressPhrase({ seasons: { watched: 3, total: 5 }, movies: { watched: 2, total: 3 } })).toBe('3/5 seasons, 2/3 movies');
  });

  test('omits an empty movies half', () => {
    expect(progressPhrase({ seasons: { watched: 1, total: 3 }, movies: { watched: 0, total: 0 } })).toBe('1/3 seasons');
  });

  test('omits an empty seasons half', () => {
    expect(progressPhrase({ seasons: { watched: 0, total: 0 }, movies: { watched: 0, total: 1 } })).toBe('0/1 movies');
  });

  test('nothing to count is empty, so callers can render no label at all', () => {
    expect(progressPhrase({ seasons: { watched: 0, total: 0 }, movies: { watched: 0, total: 0 } })).toBe('');
  });

  test('the Detail counter and the status pill word the same counts identically', () => {
    // This is the defect step 1 fixes, as a test: the section counter and the status pill are now
    // the same phrase, so the only way they can disagree on screen is the deliberate
    // consecutive-run difference in the seasons number itself.
    const halves = { seasons: { watched: 3, total: 5 }, movies: { watched: 2, total: 3 } };
    const pill = statusLabel({ kind: 'WATCHED_PARTIAL', watchedSeasons: 3, totalSeasons: 5, watchedMovies: 2, totalMovies: 3 });
    expect(pill).toBe(`Watched ${progressPhrase(halves)}`);
  });
});
