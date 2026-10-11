import {
  buildGenreAffinity,
  diversifyRanked,
  getCatchUpEntries,
  isExcludedCandidate,
  meetsMinimumEpisodes,
  MIN_EPISODE_THRESHOLDS,
  rankCandidates,
  scoreGenreOverlap,
  selectCandidatePool,
  splitCatchUpByKind,
  splitRecommendationsByType,
  tallyMalRecommendations,
  type RecommendationCandidate,
} from '@/domain/recommendations';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import type { Series, SeriesEntry } from '@/domain/series';

function makeEntry(overrides: Partial<SeriesEntry>): SeriesEntry {
  return {
    id: '1',
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
    id: '1',
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
        makeEntry({ id: '1', malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, orderIndex: 1, watchState: 'UNWATCHED' }),
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
        makeEntry({ id: '1', malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, orderIndex: 1, watchState: 'WATCHED' }),
        makeEntry({ id: '3', malId: 3, orderIndex: 2, watchState: 'WATCHED' }),
        makeEntry({ id: '4', malId: 4, orderIndex: 3, watchState: 'UNWATCHED' }),
        makeEntry({ id: '5', malId: 5, orderIndex: 4, watchState: 'UNWATCHED' }),
        makeEntry({ id: '6', malId: 6, orderIndex: 5, watchState: 'UNWATCHED' }),
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
        makeEntry({ id: '1', malId: 1, orderIndex: 0, watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, orderIndex: 1, watchState: 'UNWATCHED' }),
        makeEntry({ id: '3', malId: 3, orderIndex: 2, watchState: 'WATCHED' }),
      ],
    });
    expect(getCatchUpEntries([series]).map((i) => i.entry.malId)).toEqual([2]);
  });

  test('a series can contribute both a next season and a next movie', () => {
    // Films are ordered too (trilogies), so they collapse the same way rather than listing in full.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', orderIndex: 0, watchState: 'UNWATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'TV_SEASON', orderIndex: 1, watchState: 'UNWATCHED' }),
        makeEntry({ id: '3', malId: 3, kind: 'MOVIE', orderIndex: 2, watchState: 'UNWATCHED' }),
        makeEntry({ id: '4', malId: 4, kind: 'MOVIE', orderIndex: 3, watchState: 'UNWATCHED' }),
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
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'MOVIE', watchState: 'UNWATCHED' }),
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
        makeEntry({ id: '1', malId: 1, watchState: 'WONT_WATCH' }),
        makeEntry({ id: '2', malId: 2, kind: 'MOVIE', watchState: 'WONT_WATCH' }),
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
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', watchState: 'UNWATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'MOVIE', watchState: 'UNWATCHED' }),
      ],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.seasons.map((i) => i.entry.malId)).toEqual([1]);
    expect(split.movies.map((i) => i.entry.malId)).toEqual([2]);
    expect(split.futureReleases).toHaveLength(0);
  });

  test('an entry with no episode count yet is a future release, not a skipped season', () => {
    // MAL reports num_episodes: 0 for an announced-but-unaired entry — there's nothing to watch,
    // so it must not sit in the backlog sections.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'TV_SEASON', orderIndex: 1, episodeCount: 0, airingStatus: 'NOT_YET_AIRED' }),
      ],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.seasons).toHaveLength(0);
    expect(split.futureReleases.map((i) => i.entry.malId)).toEqual([2]);
  });

  test('an unreleased film is a future release too, not a Movies row', () => {
    const series = makeSeries({
      status: PARTIAL,
      entries: [makeEntry({ id: '2', malId: 2, kind: 'MOVIE', episodeCount: 0 })],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.movies).toHaveLength(0);
    expect(split.futureReleases.map((i) => i.entry.malId)).toEqual([2]);
  });

  test('airingStatus alone marks a future release, even with an episode count published', () => {
    // The real signal is MAL's own status field, not the zero-episode proxy this used to key off:
    // MAL does publish a planned episode count for some announced-but-unaired entries, and those
    // were landing in the backlog as if the user had skipped them.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'TV_SEASON', orderIndex: 1, episodeCount: 12, airingStatus: 'NOT_YET_AIRED' }),
      ],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.seasons).toHaveLength(0);
    expect(split.futureReleases.map((i) => i.entry.malId)).toEqual([2]);
  });

  test('a currently-airing season with episodes out stays a backlog row', () => {
    // The guard is NOT_YET_AIRED specifically, not "anything unfinished" — a season airing weekly
    // has episodes to watch right now and belongs in Seasons.
    const series = makeSeries({
      status: PARTIAL,
      entries: [
        makeEntry({ id: '1', malId: 1, kind: 'TV_SEASON', watchState: 'WATCHED' }),
        makeEntry({ id: '2', malId: 2, kind: 'TV_SEASON', orderIndex: 1, episodeCount: 6, airingStatus: 'AIRING' }),
      ],
    });
    const split = splitCatchUpByKind(getCatchUpEntries([series]));
    expect(split.seasons.map((i) => i.entry.malId)).toEqual([2]);
    expect(split.futureReleases).toHaveLength(0);
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

describe('diversifyRanked', () => {
  // One fixture, used by three lambdas. Every expected order below is worked out on paper from
  // these numbers and the MMR rule `score - lambda x maxJaccard(to what's already picked)`; none
  // of them is read off what the implementation returned.
  //
  // Jaccard similarities within the fixture:
  //   a~b = 2/2 = 1      (identical sets)
  //   a~c = 1/3          (share Action; union Action/Shounen/Comedy)
  //   a~d = 0            (nothing shared)
  //   a~e = 2/3          (share Action+Shounen; union of three)
  //   c~e = 2/3          (share Action+Comedy; union of three)
  //   b~c = 1/3, b~e = 2/3, d~anything = 0
  const CANDIDATES = [
    { id: 1, score: 1.0, genres: ['Action', 'Shounen'] },
    { id: 2, score: 0.8, genres: ['Action', 'Shounen'] },
    { id: 3, score: 0.7, genres: ['Action', 'Comedy'] },
    { id: 4, score: 0.55, genres: ['Romance', 'Slice of Life'] },
    { id: 5, score: 0.5, genres: ['Action', 'Shounen', 'Comedy'] },
  ];

  test('lambda 0 leaves pure score order untouched', () => {
    // With no penalty the rule collapses to "highest score next", which is the input order.
    expect(diversifyRanked(CANDIDATES, 0).map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  test('a moderate lambda promotes a different-genre candidate over a near-duplicate', () => {
    // Derived by hand at lambda 0.3. Pick 1 outright (top score).
    //   slot 2: 2 -> 0.8-0.3(1)=0.50 | 3 -> 0.7-0.3(1/3)=0.60 | 4 -> 0.55-0=0.55
    //           5 -> 0.5-0.3(2/3)=0.30                                   => 3 (0.60)
    //   slot 3: 2 -> 0.50 | 4 -> 0.55 | 5 -> 0.5-0.3(2/3)=0.30           => 4 (0.55)
    //   slot 4: 2 -> 0.50 | 5 -> 0.30                                    => 2
    //   slot 5: 5
    expect(diversifyRanked(CANDIDATES, 0.3).map((c) => c.id)).toEqual([1, 3, 4, 2, 5]);
  });

  test('a strong lambda pushes the most distinct candidate straight to second place', () => {
    // Same fixture at lambda 1.0.
    //   slot 2: 2 -> 0.8-1=-0.20 | 3 -> 0.7-1/3=0.3667 | 4 -> 0.55 | 5 -> 0.5-2/3=-0.1667 => 4
    //   slot 3: 2 -> -0.20 | 3 -> 0.3667 | 5 -> -0.1667                                    => 3
    //   slot 4: 2 -> -0.20 | 5 -> -0.1667                                                  => 5
    //   slot 5: 2
    expect(diversifyRanked(CANDIDATES, 1.0).map((c) => c.id)).toEqual([1, 4, 3, 5, 2]);
  });

  test('nothing is dropped - the whole list comes back, only re-ordered', () => {
    // The caller slices afterwards; diversification must not silently shorten the list.
    const out = diversifyRanked(CANDIDATES, 0.3);
    expect(out).toHaveLength(CANDIDATES.length);
    expect(new Set(out.map((c) => c.id))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  test('a candidate with no genres is never penalized', () => {
    // MAL does return empty genre arrays; "we know nothing about this one" must not read as
    // "this is a duplicate of everything".
    //   slot 2: 2 -> 0.9-0.3(1)=0.60 | 3 -> 0.8-0.3(0)=0.80 => 3
    const out = diversifyRanked(
      [
        { id: 1, score: 1.0, genres: ['Action'] },
        { id: 2, score: 0.9, genres: ['Action'] },
        { id: 3, score: 0.8, genres: [] },
      ],
      0.3,
    );
    expect(out.map((c) => c.id)).toEqual([1, 3, 2]);
  });

  test('identical candidates keep their input order', () => {
    // Every slot after the first is a dead tie (0.5-0.3 = 0.2 for both), and a tie must fall to
    // the earlier candidate so the list is stable rather than reshuffling run to run.
    const out = diversifyRanked(
      [
        { id: 1, score: 0.5, genres: ['X'] },
        { id: 2, score: 0.5, genres: ['X'] },
        { id: 3, score: 0.5, genres: ['X'] },
      ],
      0.3,
    );
    expect(out.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  test('a list too short to diversify comes back as-is', () => {
    const two = [
      { id: 1, score: 0.5, genres: ['X'] },
      { id: 2, score: 0.4, genres: ['X'] },
    ];
    expect(diversifyRanked(two, 0.3).map((c) => c.id)).toEqual([1, 2]);
    expect(diversifyRanked([], 0.3)).toEqual([]);
  });

  test('the production default diversifies rather than passing the list through', () => {
    // Guards the wiring, not a specific lambda: whatever DIVERSITY_LAMBDA is, it must be non-zero,
    // or every test above is testing a function the app never really applies.
    expect(diversifyRanked(CANDIDATES).map((c) => c.id)).not.toEqual([1, 2, 3, 4, 5]);
  });
});

describe('selectCandidatePool', () => {
  // Shorthand: a pool from [id, num_recommendations] pairs.
  function pool(...refs: [number, number][]) {
    return { recommended: refs.map(([id, numRecommendations]) => ({ id, numRecommendations })) };
  }

  test('one huge source series cannot crowd the three small ones out of the budget', () => {
    // The shape this function exists for. BIG recommends 50 shows, every one of them more strongly
    // recommended than anything the three small series point at, so a single global sort by MAL
    // tally spends the entire budget inside BIG and the other three are never scored at all.
    //
    // ids 100..149 at num 500 down to 451; the small series offer 10/9/8 each.
    const big = {
      recommended: Array.from({ length: 50 }, (_, i) => ({ id: 100 + i, numRecommendations: 500 - i })),
    };
    const a = pool([200, 10], [201, 9], [202, 8]);
    const b = pool([300, 10], [301, 9], [302, 8]);
    const c = pool([400, 10], [401, 9], [402, 8]);

    // Derived on paper. Pools take turns in order [big, a, b, c]:
    //   pass 1 -> 100, 200, 300, 400   (4)
    //   pass 2 -> 101, 201, 301, 401   (8)
    //   pass 3 -> 102, 202             (10 = budget, so b and c get no third turn)
    const picked = selectCandidatePool([big, a, b, c], 10);
    expect(picked).toEqual([100, 200, 300, 400, 101, 201, 301, 401, 102, 202]);

    // The success criterion stated independently of the exact order: all four are represented.
    expect(picked.some((id) => id >= 100 && id < 150)).toBe(true);
    expect(picked.some((id) => id >= 200 && id < 300)).toBe(true);
    expect(picked.some((id) => id >= 300 && id < 400)).toBe(true);
    expect(picked.some((id) => id >= 400 && id < 500)).toBe(true);
  });

  test("a series' turn spends on its own strongest recommendation, not on input order", () => {
    // Input order is 1, 2, 3; num_recommendations order is 2 (50), 3 (20), 1 (5).
    expect(selectCandidatePool([pool([1, 5], [2, 50], [3, 20])], 3)).toEqual([2, 3, 1]);
  });

  test('a candidate two series both recommend is taken once, and the second series picks again', () => {
    // A: 1 (10), 2 (5).  B: 1 (99), 3 (1).  Both point at 1.
    //   pass 1 -> A takes 1; B's best is also 1, already claimed, so it moves on and takes 3
    //   pass 2 -> A takes 2; B is exhausted
    // Forfeiting B's turn instead would have cost it its only unshared candidate.
    expect(selectCandidatePool([pool([1, 10], [2, 5]), pool([1, 99], [3, 1])], 4)).toEqual([1, 3, 2]);
  });

  test('an exhausted series is skipped rather than ending the rounds early', () => {
    // A has one candidate, B has three, budget 4.
    //   pass 1 -> 1, 10 | pass 2 -> A empty, 11 | pass 3 -> 12
    expect(selectCandidatePool([pool([1, 1]), pool([10, 9], [11, 8], [12, 7])], 4)).toEqual([
      1, 10, 11, 12,
    ]);
  });

  test('a budget smaller than the number of series gives the earliest pools the turns', () => {
    // Nothing clever to do here, but it must be deterministic rather than arbitrary.
    expect(selectCandidatePool([pool([1, 9]), pool([2, 9]), pool([3, 9])], 2)).toEqual([1, 2]);
  });

  test('fewer unique candidates than the budget returns all of them and stops', () => {
    // Every pool exhausted well inside the budget; the loop must end, not spin.
    expect(selectCandidatePool([pool([1, 5], [2, 4]), pool([2, 99], [3, 1])], 80)).toEqual([1, 2, 3]);
  });

  test('no pools, no candidates, or no budget yields nothing', () => {
    expect(selectCandidatePool([], 80)).toEqual([]);
    expect(selectCandidatePool([pool(), pool()], 80)).toEqual([]);
    expect(selectCandidatePool([pool([1, 5])], 0)).toEqual([]);
  });
});

describe('buildGenreAffinity with dropped series', () => {
  // Every number below is derived on paper from the two rules in buildGenreAffinity:
  //   positive(tag) = sum of carrying series' weights / number of carrying watched series
  //                   (weight 1, or LIKED_WEIGHT = 3 for a liked series)
  //   penalty(tag)  = droppedWeight x dropped / (watched + dropped)
  // All of these pass droppedWeight explicitly as 1.0 so the expectations stay pinned to a stated
  // value rather than to whatever the production default becomes.
  const watched = (...genres: string[]) => ({ liked: false, genres });

  test('a tag only ever dropped is penalised; one only ever watched is untouched', () => {
    // Action: positive 1/1 = 1, never dropped          -> 1
    // Gag Comedy: never watched so positive 0, dropped 1/1 = 1 -> 0 - 1 = -1
    const affinity = buildGenreAffinity([watched('Action')], [{ genres: ['Gag Comedy'] }], 1.0);
    expect(affinity.get('Action')).toBeCloseTo(1);
    expect(affinity.get('Gag Comedy')).toBeCloseTo(-1);
  });

  test('the penalty is a drop rate, not a drop count', () => {
    // The distinction this design turns on. A count cannot tell these two libraries apart - both
    // are just "Isekai appears among the dropped series" - yet they mean opposite things.
    const twentyWatched = Array.from({ length: 20 }, () => watched('Isekai'));
    const twentyDropped = Array.from({ length: 20 }, () => ({ genres: ['Isekai'] }));

    // Watched 20, dropped 1: positive 1, rate 1/21 -> 1 - 1/21 = 20/21
    const mostlyFinished = buildGenreAffinity(twentyWatched, [{ genres: ['Isekai'] }], 1.0);
    expect(mostlyFinished.get('Isekai')).toBeCloseTo(20 / 21);

    // Watched 1, dropped 20: positive 1, rate 20/21 -> 1 - 20/21 = 1/21
    const mostlyAbandoned = buildGenreAffinity([watched('Isekai')], twentyDropped, 1.0);
    expect(mostlyAbandoned.get('Isekai')).toBeCloseTo(1 / 21);
  });

  test('a broad tag the user mostly finishes survives being dropped once', () => {
    // The PRD's step-0 warning in test form: MAL's flat genre list puts Shounen beside real taste
    // tags, so a user who drops one shonen among the ten they finish must not lose Shounen.
    // Shounen:    positive 9/9 = 1, rate 1/10 = 0.1 -> 0.9
    // Gag Comedy: positive 0,       rate 1/1   = 1   -> -1
    const nine = Array.from({ length: 9 }, () => watched('Shounen'));
    const affinity = buildGenreAffinity(nine, [{ genres: ['Shounen', 'Gag Comedy'] }], 1.0);
    expect(affinity.get('Shounen')).toBeCloseTo(0.9);
    expect(affinity.get('Gag Comedy')).toBeCloseTo(-1);
  });

  test('a tag with any watched series is never driven negative at the default weight', () => {
    // The guarantee DROPPED_GENRE_WEIGHT = 1.0 exists to preserve. Dropped 99 times against a
    // single finished series is as lopsided as a real library can get, and it still only
    // neutralises: positive 1, rate 99/100 = 0.99 -> 0.01, above zero rather than below it.
    const ninetyNine = Array.from({ length: 99 }, () => ({ genres: ['Shounen'] }));
    const affinity = buildGenreAffinity([watched('Shounen')], ninetyNine, 1.0);
    expect(affinity.get('Shounen')).toBeCloseTo(0.01);
    expect(affinity.get('Shounen')!).toBeGreaterThan(0);
  });

  test('no dropped series leaves the profile exactly as it was', () => {
    // A: liked(3) + unliked(1) over 2 carrying series -> 4/2 = 2.  B: 1/1 = 1.
    const sources = [
      { liked: true, genres: ['A'] },
      { liked: false, genres: ['A', 'B'] },
    ];
    for (const affinity of [buildGenreAffinity(sources), buildGenreAffinity(sources, [], 1.0)]) {
      expect(affinity.get('A')).toBeCloseTo(2);
      expect(affinity.get('B')).toBeCloseTo(1);
      expect(affinity.size).toBe(2);
    }
  });

  test('a series repeating a tag cannot push the penalty past its ceiling', () => {
    // Deduped per dropped series, so this is one drop of Gag Comedy, not three: positive 0,
    // rate 1/1 = 1 -> -1. Undeduped it would read 3/3, still -1 here, but a tag that was also
    // watched would exceed the bound the weight is chosen to guarantee.
    const affinity = buildGenreAffinity(
      [watched('Shounen')],
      [{ genres: ['Shounen', 'Shounen', 'Shounen'] }],
      1.0,
    );
    // positive 1, rate 1/2 = 0.5 -> 0.5. Counting the repeat would give 3/4 and 0.25.
    expect(affinity.get('Shounen')).toBeCloseTo(0.5);
  });
});

describe('rankCandidates with a negative genre profile', () => {
  test('a dropped tag sinks a candidate the ranking would otherwise have put top', () => {
    // The PRD's test for this step. Candidate 1 has the stronger MAL tally AND shares the user's
    // one watched tag, so it ranks first on the old profile; it also carries a tag that only ever
    // appears in a dropped series, which is the thing the old profile could not see.
    const watchedSources = [{ liked: false, genres: ['Psychological'] }];
    const dropped = [{ genres: ['Gag Comedy'] }];
    const candidates: RecommendationCandidate[] = [
      { id: 1, genres: ['Psychological', 'Gag Comedy'], relatedIds: [] },
      { id: 2, genres: ['Psychological'], relatedIds: [] },
    ];
    const tally = new Map([
      [1, 10],
      [2, 5],
    ]);

    // Without the negative half: affinity { Psychological: 1 }.
    //   raw genre  1 -> (1 + 0)/2 = 0.5   2 -> 1/1 = 1      (Gag Comedy unknown, reads 0)
    //   normalized 1 -> 0.5               2 -> 1
    //   raw MAL    1 -> 10                2 -> 5    => normalized 1 -> 1, 2 -> 0.5
    //   score      1 -> 0.6(1) + 0.4(0.5) = 0.80
    //              2 -> 0.6(0.5) + 0.4(1) = 0.70
    const before = rankCandidates(candidates, tally, buildGenreAffinity(watchedSources));
    expect(before.map((r) => r.id)).toEqual([1, 2]);
    expect(before[0].score).toBeCloseTo(0.8);
    expect(before[1].score).toBeCloseTo(0.7);

    // With it: affinity { Psychological: 1, Gag Comedy: -1 }.
    //   raw genre  1 -> (1 + -1)/2 = 0    2 -> 1    => normalized (max 1) 1 -> 0, 2 -> 1
    //   MAL unchanged.
    //   score      1 -> 0.6(1) + 0.4(0)   = 0.60
    //              2 -> 0.6(0.5) + 0.4(1) = 0.70   => 2 now first
    const after = rankCandidates(candidates, tally, buildGenreAffinity(watchedSources, dropped, 1.0));
    expect(after.map((r) => r.id)).toEqual([2, 1]);
    expect(after.find((r) => r.id === 1)!.score).toBeCloseTo(0.6);
    expect(after.find((r) => r.id === 2)!.score).toBeCloseTo(0.7);
  });

  test('a condemned candidate cannot swamp the MAL half of the score', () => {
    // Why normalize() floors at -1. The profile here is deliberately lopsided:
    //   Mixed: positive 1, rate 19/20 = 0.95 -> 0.05   (watched once, dropped nineteen times)
    //   Pure:  positive 0, rate 1/1   = 1    -> -1     (only ever dropped)
    // So the best genre score in the pool is 0.05 while the worst is -1, and raw normalization
    // would divide -1 by 0.05 to get -20. At 0.4 weight that is -8, which buries a MAL score that
    // can only ever reach 0.6 - the exact scale mismatch normalize exists to prevent.
    const nineteen = Array.from({ length: 19 }, () => ({ genres: ['Mixed'] }));
    const affinity = buildGenreAffinity(
      [{ liked: false, genres: ['Mixed'] }],
      [...nineteen, { genres: ['Pure'] }],
      1.0,
    );
    expect(affinity.get('Mixed')).toBeCloseTo(0.05);
    expect(affinity.get('Pure')).toBeCloseTo(-1);

    const candidates: RecommendationCandidate[] = [
      { id: 1, genres: ['Mixed'], relatedIds: [] },
      { id: 2, genres: ['Pure'], relatedIds: [] },
    ];
    //   normalized genre 1 -> 0.05/0.05 = 1     2 -> max(-1, -20) = -1
    //   normalized MAL   1 -> 1/100 = 0.01      2 -> 1
    //   score 1 -> 0.6(0.01) + 0.4(1)  = 0.406
    //         2 -> 0.6(1)    + 0.4(-1) = 0.200  (still above zero, so it survives the filter)
    const ranked = rankCandidates(
      candidates,
      new Map([
        [1, 1],
        [2, 100],
      ]),
      affinity,
    );
    expect(ranked.map((r) => r.id)).toEqual([1, 2]);
    expect(ranked[0].score).toBeCloseTo(0.406);
    expect(ranked[1].score).toBeCloseTo(0.2);
  });
});

describe('meetsMinimumEpisodes', () => {
  // A recommended series as the "For you" list holds it. Only `kind` and `episodeCount` matter to
  // the predicate, but ReconcileEntry is a closed shape, so the rest is filled with plausible
  // values rather than cast away.
  function makeReconcile(entries: { kind: 'TV_SEASON' | 'MOVIE'; episodeCount: number }[]): ReconcileSeries {
    return {
      title: 'Candidate',
      coverUrl: null,
      genres: [],
      rootMalId: 1,
      type: entries.every((e) => e.kind === 'MOVIE') ? 'STANDALONE_MOVIE' : 'SERIES',
      manualStatus: 'NONE',
      entries: entries.map((e, i) => ({
        malId: i + 1,
        kind: e.kind,
        orderIndex: i,
        title: `Entry ${i + 1}`,
        episodeCount: e.episodeCount,
        airingStatus: e.episodeCount > 0 ? 'FINISHED' : 'NOT_YET_AIRED',
        watchState: 'UNWATCHED',
      })),
    };
  }

  test('a two-season, 25-episode series passes 24+ and fails 50+', () => {
    // 13 + 12 = 25 total TV episodes. 25 >= 12, 25 >= 24, 25 < 50 with no unknown count to save it.
    const series = makeReconcile([
      { kind: 'TV_SEASON', episodeCount: 13 },
      { kind: 'TV_SEASON', episodeCount: 12 },
    ]);
    expect(meetsMinimumEpisodes(series, 12)).toBe(true);
    expect(meetsMinimumEpisodes(series, 24)).toBe(true);
    expect(meetsMinimumEpisodes(series, 50)).toBe(false);
  });

  test('the threshold is inclusive — exactly 12 episodes passes 12+', () => {
    const series = makeReconcile([{ kind: 'TV_SEASON', episodeCount: 12 }]);
    expect(meetsMinimumEpisodes(series, 12)).toBe(true);
    expect(meetsMinimumEpisodes(series, 24)).toBe(false);
  });

  test('"Any" (0) passes anything, including a series nothing else would keep', () => {
    const series = makeReconcile([{ kind: 'TV_SEASON', episodeCount: 6 }]);
    expect(meetsMinimumEpisodes(series, 0)).toBe(true);
    expect(meetsMinimumEpisodes(series, 12)).toBe(false);
  });

  test('a series with no published episode counts passes every threshold', () => {
    // MAL reports num_episodes: 0 for announced-but-unaired entries. Unknown is not zero, so an
    // airing show with nothing published must not be hidden.
    const series = makeReconcile([
      { kind: 'TV_SEASON', episodeCount: 0 },
      { kind: 'TV_SEASON', episodeCount: 0 },
    ]);
    for (const threshold of [12, 24, 50]) {
      expect(meetsMinimumEpisodes(series, threshold)).toBe(true);
    }
  });

  test('one unknown season keeps a series its known seasons alone would fail', () => {
    // Known: 13. Unknown: one season. 13 >= 12 passes on the known sum alone; 24 and 50 are short
    // on what's known, but the real total isn't known to be short, so the series stays.
    const series = makeReconcile([
      { kind: 'TV_SEASON', episodeCount: 13 },
      { kind: 'TV_SEASON', episodeCount: 0 },
    ]);
    expect(meetsMinimumEpisodes(series, 12)).toBe(true);
    expect(meetsMinimumEpisodes(series, 24)).toBe(true);
    expect(meetsMinimumEpisodes(series, 50)).toBe(true);
  });

  test('a standalone movie is exempt, so the Movies section is untouched at every threshold', () => {
    const film = makeReconcile([{ kind: 'MOVIE', episodeCount: 1 }]);
    for (const threshold of [12, 24, 50]) {
      expect(meetsMinimumEpisodes(film, threshold)).toBe(true);
    }
  });

  test('films hanging off a series do not count toward its TV length', () => {
    // TV only: 20 episodes, which fails 24+. Were the five films summed in as well the total would
    // be 20 + 5 = 25 and the series would wrongly pass — this is the test that pins that down.
    const series = makeReconcile([
      { kind: 'TV_SEASON', episodeCount: 20 },
      { kind: 'MOVIE', episodeCount: 1 },
      { kind: 'MOVIE', episodeCount: 1 },
      { kind: 'MOVIE', episodeCount: 1 },
      { kind: 'MOVIE', episodeCount: 1 },
      { kind: 'MOVIE', episodeCount: 1 },
    ]);
    expect(meetsMinimumEpisodes(series, 12)).toBe(true);
    expect(meetsMinimumEpisodes(series, 24)).toBe(false);
  });

  test('a movie with no published runtime does not make a series exempt', () => {
    // The exemption is "no TV seasons", not "an unknown count somewhere" — the unknown film is
    // irrelevant, and the one short TV season is what decides it.
    const series = makeReconcile([
      { kind: 'TV_SEASON', episodeCount: 6 },
      { kind: 'MOVIE', episodeCount: 0 },
    ]);
    expect(meetsMinimumEpisodes(series, 12)).toBe(false);
  });

  test('the presets are Any / 12+ / 24+ / 50+', () => {
    expect(MIN_EPISODE_THRESHOLDS).toEqual([0, 12, 24, 50]);
  });
});
