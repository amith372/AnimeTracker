import { deriveSeriesStatus, type EntryStatusInput } from '@/domain/seriesStatus';
import type { WatchState } from '@/domain/types';

function season(orderIndex: number, watchState: WatchState): EntryStatusInput {
  return { kind: 'TV_SEASON', orderIndex, watchState };
}
function movie(orderIndex: number, watchState: WatchState): EntryStatusInput {
  return { kind: 'MOVIE', orderIndex, watchState };
}

/** WATCHED_PARTIAL is verbose to write out; most tests only care about one half of it. */
function partial(overrides: Partial<Omit<Extract<ReturnType<typeof deriveSeriesStatus>, { kind: 'WATCHED_PARTIAL' }>, 'kind'>>) {
  return {
    kind: 'WATCHED_PARTIAL',
    watchedSeasons: 0,
    totalSeasons: 0,
    watchedMovies: 0,
    totalMovies: 0,
    ...overrides,
  };
}

test('manual status always wins over derived status', () => {
  const allWatched = [season(0, 'WATCHED'), season(1, 'WATCHED')];
  expect(deriveSeriesStatus('DROPPED', allWatched)).toEqual({ kind: 'DROPPED' });
  expect(deriveSeriesStatus('PLAN', allWatched)).toEqual({ kind: 'PLAN' });
});

test('NONE with every season watched derives to Watched', () => {
  const entries = [season(0, 'WATCHED'), season(1, 'WATCHED'), season(2, 'WATCHED')];
  expect(deriveSeriesStatus('NONE', entries)).toEqual({ kind: 'WATCHED' });
});

test('NONE with a consecutive prefix watched derives Watched X/Y', () => {
  const entries = [season(0, 'WATCHED'), season(1, 'WATCHED'), season(2, 'UNWATCHED')];
  expect(deriveSeriesStatus('NONE', entries)).toEqual(partial({ watchedSeasons: 2, totalSeasons: 3 }));
});

test('a gap breaks the consecutive count even if a later season is watched', () => {
  // Watched season 1 and 3 but not 2 — X only counts the unbroken run from season 1, so this
  // is "1/3", not "2/3".
  const entries = [season(0, 'WATCHED'), season(1, 'UNWATCHED'), season(2, 'WATCHED')];
  expect(deriveSeriesStatus('NONE', entries)).toEqual(partial({ watchedSeasons: 1, totalSeasons: 3 }));
});

describe('movies count separately from seasons', () => {
  test('seasons and movies are tracked as two independent counts', () => {
    // Demon Slayer: 3 of 5 seasons in, 2 of 3 films seen.
    const entries = [
      season(0, 'WATCHED'),
      season(1, 'WATCHED'),
      season(2, 'WATCHED'),
      season(3, 'UNWATCHED'),
      season(4, 'UNWATCHED'),
      movie(5, 'WATCHED'),
      movie(6, 'WATCHED'),
      movie(7, 'UNWATCHED'),
    ];
    expect(deriveSeriesStatus('NONE', entries)).toEqual(
      partial({ watchedSeasons: 3, totalSeasons: 5, watchedMovies: 2, totalMovies: 3 }),
    );
  });

  test('an unwatched film keeps a fully-watched series from reading as Watched', () => {
    // The regression this pins: movies used to be invisible to derivation entirely, so this
    // series read "Watched" with a quietly unticked film on its detail screen.
    const entries = [season(0, 'WATCHED'), season(1, 'WATCHED'), movie(2, 'UNWATCHED')];
    expect(deriveSeriesStatus('NONE', entries)).toEqual(
      partial({ watchedSeasons: 2, totalSeasons: 2, watchedMovies: 0, totalMovies: 1 }),
    );
  });

  test('movies have no order, so a gap does not break their count', () => {
    const entries = [movie(0, 'UNWATCHED'), movie(1, 'WATCHED')];
    expect(deriveSeriesStatus('NONE', entries)).toEqual(partial({ watchedMovies: 1, totalMovies: 2 }));
  });

  test('everything watched across both kinds derives to Watched', () => {
    const entries = [season(0, 'WATCHED'), movie(1, 'WATCHED')];
    expect(deriveSeriesStatus('NONE', entries)).toEqual({ kind: 'WATCHED' });
  });
});

describe('standalone movies', () => {
  test('an unwatched standalone movie is not Watched', () => {
    expect(deriveSeriesStatus('NONE', [movie(0, 'UNWATCHED')])).toEqual(
      partial({ watchedMovies: 0, totalMovies: 1 }),
    );
  });

  test('a watched standalone movie derives to Watched', () => {
    expect(deriveSeriesStatus('NONE', [movie(0, 'WATCHED')])).toEqual({ kind: 'WATCHED' });
  });
});

describe("won't watch", () => {
  test("a won't-watch season counts as done", () => {
    // 3 watched + 1 skipped of 5 reads as 4/5 — the skipped one is resolved, not outstanding.
    const entries = [
      season(0, 'WATCHED'),
      season(1, 'WATCHED'),
      season(2, 'WATCHED'),
      season(3, 'WONT_WATCH'),
      season(4, 'UNWATCHED'),
    ];
    expect(deriveSeriesStatus('NONE', entries)).toEqual(partial({ watchedSeasons: 4, totalSeasons: 5 }));
  });

  test("a won't-watch season does not break the consecutive run", () => {
    const entries = [season(0, 'WATCHED'), season(1, 'WONT_WATCH'), season(2, 'WATCHED')];
    expect(deriveSeriesStatus('NONE', entries)).toEqual({ kind: 'WATCHED' });
  });

  test('skipping everything outstanding tips a series to Watched', () => {
    // The whole point of the state: a show you're finished with can actually reach Watched
    // instead of sitting at 3/5 forever.
    const entries = [
      season(0, 'WATCHED'),
      season(1, 'WONT_WATCH'),
      movie(2, 'WONT_WATCH'),
    ];
    expect(deriveSeriesStatus('NONE', entries)).toEqual({ kind: 'WATCHED' });
  });

  test("a won't-watch movie counts as done too", () => {
    const entries = [season(0, 'WATCHED'), movie(1, 'WONT_WATCH'), movie(2, 'UNWATCHED')];
    expect(deriveSeriesStatus('NONE', entries)).toEqual(
      partial({ watchedSeasons: 1, totalSeasons: 1, watchedMovies: 1, totalMovies: 2 }),
    );
  });
});

test('a series with no entries at all still derives to Watched', () => {
  expect(deriveSeriesStatus('NONE', [])).toEqual({ kind: 'WATCHED' });
});
