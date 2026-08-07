import {
  buildGenreAffinity,
  getCatchUpEntries,
  isExcludedCandidate,
  rankCandidates,
  scoreGenreOverlap,
  splitCatchUpByKind,
  splitRecommendationsByType,
  tallyMalRecommendations,
  type RecommendationCandidate,
} from '@/domain/recommendations';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import type { Series, SeriesEntry } from '@/domain/series';

function makeEntry(overrides: Partial<SeriesEntry>): SeriesEntry {
  return {
    id: 1,
    malId: 1,
    kind: 'TV_SEASON',
    orderIndex: 0,
    title: 'Entry',
    episodeCount: 12,
    watchState: 'UNWATCHED',
    airingStatus: 'FINISHED',
    watchedArcKeys: null,
    ...overrides,
  };
}

const PARTIAL = {
  kind: 'WATCHED_PARTIAL',
  watchedSeasons: 1,
  totalSeasons: 2,
  watchedMovies: 0,
  totalMovies: 0,
} as const;

function makeSeries(overrides: Partial<Series> & { entries?: SeriesEntry[] }): Series {
  return {
    id: 1,
    title: 'Series',
    coverUrl: null,
    genres: [],
    rootMalId: 1,
    type: 'SERIES',
    manualStatus: 'NONE',
    status: { kind: 'WATCHED' },
    entries: [],
    newSeasonAvailable: false,
    newSeasonAiredAtEpochMillis: null,
    liked: false,
    ...overrides,
  };
}

describe('getCatchUpEntries', () => {
  test('includes unwatched TV seasons from Watched X/Y series', () => {
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: 2, malId: 2, orderIndex: 1, watchState: 'UNWATCHED' }),
      ],
    });
    const items = getCatchUpEntries([series]);
    expect(items).toHaveLength(1);
    expect(items[0].entry.malId).toBe(2);
  });

  test('shows only the next unwatched season, not every outstanding one', () => {
    // Seasons 1-3 watched, 4-6 outstanding: the useful answer is season 4. Listing all three let
    // one half-finished show fill the screen and push every other series out of view.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: 2, malId: 2, orderIndex: 1, watchState: 'WATCHED' }),
        makeEntry({ id: 3, malId: 3, orderIndex: 2, watchState: 'WATCHED' }),
        makeEntry({ id: 4, malId: 4, orderIndex: 3, watchState: 'UNWATCHED' }),
        makeEntry({ id: 5, malId: 5, orderIndex: 4, watchState: 'UNWATCHED' }),
        makeEntry({ id: 6, malId: 6, orderIndex: 5, watchState: 'UNWATCHED' }),
      ],
    });
    const items = getCatchUpEntries([series]);
    expect(items).toHaveLength(1);
    expect(items[0].entry.malId).toBe(4);
  });

  test('picks the earliest outstanding season even when an earlier one was skipped', () => {
    // A gap doesn't change what comes next: season 2 is still the earliest thing outstanding.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: 2, malId: 2, orderIndex: 1, watchState: 'UNWATCHED' }),
        makeEntry({ id: 3, malId: 3, orderIndex: 2, watchState: 'WATCHED' }),
      ],
    });
    expect(getCatchUpEntries([series]).map((i) => i.entry.malId)).toEqual([2]);
  });

  test('a series can contribute both a next season and a next movie', () => {
    // Films are ordered too (trilogies), so they collapse the same way rather than listing in full.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, kind: 'TV_SEASON', orderIndex: 0, watchState: 'UNWATCHED' }),
        makeEntry({ id: 2, malId: 2, kind: 'TV_SEASON', orderIndex: 1, watchState: 'UNWATCHED' }),
        makeEntry({ id: 3, malId: 3, kind: 'MOVIE', orderIndex: 2, watchState: 'UNWATCHED' }),
        makeEntry({ id: 4, malId: 4, kind: 'MOVIE', orderIndex: 3, watchState: 'UNWATCHED' }),
      ],
    });
    expect(getCatchUpEntries([series]).map((i) => i.entry.malId)).toEqual([1, 3]);
  });

  test('includes unwatched movies too', () => {
    // These used to be excluded, which made an unwatched film invisible twice over: absent from
    // this list, and unable to move the season count either.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, kind: 'TV_SEASON', watchState: 'WATCHED' }),
        makeEntry({ id: 2, malId: 2, kind: 'MOVIE', watchState: 'UNWATCHED' }),
      ],
    });
    const items = getCatchUpEntries([series]);
    expect(items).toHaveLength(1);
    expect(items[0].entry.malId).toBe(2);
  });

  test("excludes entries marked won't watch", () => {
    // That mark exists precisely to stop something nagging, so it must not resurface here.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, watchState: 'WONT_WATCH' }),
        makeEntry({ id: 2, malId: 2, kind: 'MOVIE', watchState: 'WONT_WATCH' }),
      ],
    });
    expect(getCatchUpEntries([series])).toHaveLength(0);
  });

  test('excludes series with a manual status (Plan/Currently watching/Dropped/Watched-forgot)', () => {
    const series = makeSeries({
      manualStatus: 'CURRENTLY_WATCHING',
      status: { kind: 'CURRENTLY_WATCHING' },
      entries: [makeEntry({ watchState: 'UNWATCHED' })],
    });
    expect(getCatchUpEntries([series])).toHaveLength(0);
  });

  test('a fully Watched series has nothing left to catch up on', () => {
    const series = makeSeries({
      status: { kind: 'WATCHED' },
      entries: [makeEntry({ watchState: 'WATCHED' })],
    });
    expect(getCatchUpEntries([series])).toHaveLength(0);
  });
});

describe('splitCatchUpByKind / splitRecommendationsByType', () => {
  test('catch-up items separate into seasons and movies', () => {
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: 1, malId: 1, kind: 'TV_SEASON', watchState: 'UNWATCHED' }),
        makeEntry({ id: 2, malId: 2, kind: 'MOVIE', watchState: 'UNWATCHED' }),
      ],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.seasons.map((i) => i.entry.malId)).toEqual([1]);
    expect(split.movies.map((i) => i.entry.malId)).toEqual([2]);
  });

  test('recommendations separate standalone movies from series', () => {
    const recommended = [
      { title: 'A Show', type: 'SERIES' },
      { title: 'A Film', type: 'STANDALONE_MOVIE' },
    ] as ReconcileSeries[];
    const split = splitRecommendationsByType(recommended);
    expect(split.shows.map((s) => s.title)).toEqual(['A Show']);
    expect(split.movies.map((s) => s.title)).toEqual(['A Film']);
  });
});

describe('tallyMalRecommendations', () => {
  const rec = (id: number, numRecommendations = 1) => ({ id, numRecommendations });

  test('liked sources count for more than unliked ones', () => {
    const likedOnly = tallyMalRecommendations([{ liked: true, recommended: [rec(100)] }]);
    const unlikedOnly = tallyMalRecommendations([{ liked: false, recommended: [rec(100)] }]);
    expect(likedOnly.get(100)!).toBeGreaterThan(unlikedOnly.get(100)!);
    expect(likedOnly.get(100)!).toBeCloseTo(3 * unlikedOnly.get(100)!);
  });

  test('a strongly-recommended candidate outscores a weakly-recommended one', () => {
    const tally = tallyMalRecommendations([
      { liked: false, recommended: [rec(1, 500), rec(2, 1)] },
    ]);
    expect(tally.get(1)!).toBeGreaterThan(tally.get(2)!);
  });

  test('strength grows sub-linearly so one blockbuster cannot dominate', () => {
    const tally = tallyMalRecommendations([
      { liked: false, recommended: [rec(1, 10), rec(2, 1000)] },
    ]);
    // 100x the recommendations must not translate into 100x the score.
    expect(tally.get(2)!).toBeLessThan(tally.get(1)! * 10);
  });

  test('tallies across multiple sources and ids independently', () => {
    const tally = tallyMalRecommendations([
      { liked: false, recommended: [rec(1), rec(2)] },
      { liked: false, recommended: [rec(2)] },
    ]);
    expect(tally.get(2)!).toBeCloseTo(2 * tally.get(1)!);
  });
});

describe('buildGenreAffinity / scoreGenreOverlap', () => {
  test('liked series weight genres higher', () => {
    const affinity = buildGenreAffinity([
      { liked: true, genres: ['Action'] },
      { liked: false, genres: ['Comedy'] },
    ]);
    expect(affinity.get('Action')!).toBeGreaterThan(affinity.get('Comedy')!);
  });

  test('a genre on nearly every watched series counts for less than a rare one', () => {
    // "Action" is on all three; "Historical" on one. Without the frequency correction Action
    // would win purely by being ubiquitous, which says nothing about taste.
    const affinity = buildGenreAffinity([
      { liked: false, genres: ['Action'] },
      { liked: false, genres: ['Action'] },
      { liked: true, genres: ['Action', 'Historical'] },
    ]);
    expect(affinity.get('Historical')!).toBeGreaterThan(affinity.get('Action')!);
  });

  test('scores a candidate by averaging its genres against the affinity profile', () => {
    const affinity = new Map([
      ['Action', 4],
      ['Comedy', 1],
    ]);
    expect(scoreGenreOverlap(['Action', 'Comedy'], affinity)).toBe(2.5);
    expect(scoreGenreOverlap(['Romance'], affinity)).toBe(0);
    expect(scoreGenreOverlap([], affinity)).toBe(0);
  });

  test('extra unrelated genres do not inflate a candidate score', () => {
    const affinity = new Map([['Action', 4]]);
    const focused = scoreGenreOverlap(['Action'], affinity);
    const padded = scoreGenreOverlap(['Action', 'Romance', 'Sports', 'Horror'], affinity);
    expect(padded).toBeLessThan(focused);
  });
});

describe('isExcludedCandidate', () => {
  const candidate: RecommendationCandidate = { id: 5, genres: [], relatedIds: [6] };

  test('excludes already-tracked candidates', () => {
    expect(isExcludedCandidate(candidate, new Set([5]), new Set())).toBe(true);
  });

  test('excludes a candidate that is itself a dropped series', () => {
    expect(isExcludedCandidate(candidate, new Set(), new Set([5]))).toBe(true);
  });

  test('excludes a candidate related to a dropped series', () => {
    expect(isExcludedCandidate(candidate, new Set(), new Set([6]))).toBe(true);
  });

  test('keeps a candidate with no overlap at all', () => {
    expect(isExcludedCandidate(candidate, new Set([999]), new Set([888]))).toBe(false);
  });
});

describe('rankCandidates', () => {
  test('combines MAL tally and genre score, drops zero-signal candidates, sorts best first', () => {
    const candidates: RecommendationCandidate[] = [
      { id: 1, genres: ['Action'], relatedIds: [] },
      { id: 2, genres: ['Romance'], relatedIds: [] },
      { id: 3, genres: [], relatedIds: [] }, // no genre match, no MAL tally
    ];
    const malTally = new Map([[2, 5]]);
    const genreAffinity = new Map([['Action', 2]]);

    const ranked = rankCandidates(candidates, malTally, genreAffinity);

    // 2 wins on the MAL signal, 1 places on genre alone, 3 has no signal and is dropped.
    expect(ranked.map((r) => r.id)).toEqual([2, 1]);
  });

  test('a huge raw genre score cannot swamp the MAL signal', () => {
    // The regression this guards: raw genre affinity naturally runs orders of magnitude larger
    // than a MAL tally, so adding them unnormalized made ranking effectively genre-only.
    const candidates: RecommendationCandidate[] = [
      { id: 1, genres: ['Action'], relatedIds: [] }, // enormous genre score, no MAL backing
      { id: 2, genres: [], relatedIds: [] }, // top MAL tally, no genre signal
    ];
    const malTally = new Map([[2, 10]]);
    const genreAffinity = new Map([['Action', 10_000]]);

    const ranked = rankCandidates(candidates, malTally, genreAffinity);

    // Both are maxima of their own signal; MAL is weighted higher, so it should lead.
    expect(ranked[0].id).toBe(2);
  });

  test('scores stay within 0..1 regardless of raw input magnitude', () => {
    const candidates: RecommendationCandidate[] = [{ id: 1, genres: ['Action'], relatedIds: [] }];
    const ranked = rankCandidates(candidates, new Map([[1, 9_999]]), new Map([['Action', 9_999]]));
    expect(ranked[0].score).toBeGreaterThan(0);
    expect(ranked[0].score).toBeLessThanOrEqual(1);
  });
});
