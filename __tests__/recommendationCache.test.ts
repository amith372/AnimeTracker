// Plan 9 step 3: the stored "For you" list is rendered as-is unless the library has moved in a way
// that changes what the list would contain.
//
// Both halves are tested because both fail silently. A fingerprint that moves too readily turns
// the step back into "recompute on every visit" and nothing on screen says so; one that moves too
// rarely leaves a list that no longer matches the library, which looks like the recommendations
// are simply wrong. The expected values below are reasoned from what each library *is*, not read
// off the implementation.
import {
  isRecommendationListStale,
  parseStoredRecommendations,
  recommendationListFingerprint,
  RECOMMENDATION_ROWS_VERSION,
} from '@/domain/recommendationCache';
import type { Series } from '@/domain/series';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

function makeSeries(overrides: Partial<Series>): Series {
  return {
    id: 'series-id',
    title: 'Series',
    coverUrl: null,
    genres: [],
    rootMalId: 9999,
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

// A finished show, a liked finished show and a dropped one: one series in each of the three
// buckets tasteFingerprint() distinguishes.
const WATCHED = makeSeries({ id: 'a', rootMalId: 1, title: 'A' });
const LIKED = makeSeries({ id: 'b', rootMalId: 2, title: 'B', liked: true });
const DROPPED = makeSeries({ id: 'c', rootMalId: 3, title: 'C', manualStatus: 'DROPPED' });
const LIBRARY = [WATCHED, LIKED, DROPPED];

describe('recommendationListFingerprint', () => {
  it('carries the row-shape version, so a shape change invalidates every stored list', () => {
    expect(recommendationListFingerprint(LIBRARY).startsWith(`${RECOMMENDATION_ROWS_VERSION}:`)).toBe(true);
  });

  it('does not depend on library order', () => {
    // Same three series, listed back to front. tasteFingerprint sorts by rootMalId, so a library
    // read in a different order must not recompute a list that is already correct.
    expect(recommendationListFingerprint([DROPPED, LIKED, WATCHED])).toBe(recommendationListFingerprint(LIBRARY));
  });
});

describe('isRecommendationListStale', () => {
  const fresh = recommendationListFingerprint(LIBRARY);

  it('treats a missing list as stale, so compute and recompute are one call', () => {
    expect(isRecommendationListStale(null, LIBRARY)).toBe(true);
  });

  it('holds a list that matches the library it was computed from', () => {
    expect(isRecommendationListStale(fresh, LIBRARY)).toBe(false);
  });

  it('moves when a series is liked', () => {
    // WATCHED goes from the neutral bucket to the liked one, which is a real ranking input
    // (LIKED_WEIGHT across four signals), so the list genuinely changes.
    const liked = [{ ...WATCHED, liked: true }, LIKED, DROPPED];
    expect(isRecommendationListStale(fresh, liked)).toBe(true);
  });

  it('moves when a series is dropped', () => {
    const dropped = [{ ...WATCHED, manualStatus: 'DROPPED' as const }, LIKED, DROPPED];
    expect(isRecommendationListStale(fresh, dropped)).toBe(true);
  });

  it('moves when a watched series is added or removed', () => {
    const added = [...LIBRARY, makeSeries({ id: 'd', rootMalId: 4, title: 'D' })];
    expect(isRecommendationListStale(fresh, added)).toBe(true);
    expect(isRecommendationListStale(fresh, [WATCHED, LIKED])).toBe(true);
  });

  it('does NOT move on a tick short of finishing, which is what makes most visits free', () => {
    // A series still part-watched stays in no bucket at all, so its progress changing cannot move
    // the fingerprint. Both of these are the same library as far as taste is concerned.
    const partial = makeSeries({
      id: 'e',
      rootMalId: 5,
      status: { kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 3, watchedMovies: 0, totalMovies: 0 },
    });
    const ticked = { ...partial, status: { kind: 'WATCHED_PARTIAL' as const, watchedSeasons: 2, totalSeasons: 3, watchedMovies: 0, totalMovies: 0 } };

    expect(recommendationListFingerprint([...LIBRARY, ticked])).toBe(
      recommendationListFingerprint([...LIBRARY, partial]),
    );
  });

  it('moves when that same series is finally finished', () => {
    const partial = makeSeries({
      id: 'e',
      rootMalId: 5,
      status: { kind: 'WATCHED_PARTIAL', watchedSeasons: 2, totalSeasons: 3, watchedMovies: 0, totalMovies: 0 },
    });
    const finished = { ...partial, status: { kind: 'WATCHED' as const } };

    expect(recommendationListFingerprint([...LIBRARY, finished])).not.toBe(
      recommendationListFingerprint([...LIBRARY, partial]),
    );
  });

  it('does NOT move when a plan-to-watch series is added -- the renderer is what hides it', () => {
    // A PLAN series is in no taste bucket, so the fingerprint cannot see it -- which is exactly
    // why the screen filters its list against the live tracked-id set on every render. This test
    // pins the division of labour rather than asserting a recompute: adding a show to Plan to
    // watch must NOT invalidate the list.
    const planned = makeSeries({ id: 'f', rootMalId: 6, manualStatus: 'PLAN', status: { kind: 'PLAN' } });
    expect(isRecommendationListStale(fresh, [...LIBRARY, planned])).toBe(false);
  });
});

describe('parseStoredRecommendations', () => {
  const row: ReconcileSeries = {
    title: 'A',
    coverUrl: null,
    genres: ['Action'],
    rootMalId: 1,
    type: 'SERIES',
    manualStatus: 'NONE',
    entries: [{ malId: 10, title: 'Season 1', kind: 'TV_SEASON', orderIndex: 0, episodeCount: 12, airingStatus: 'FINISHED', watchState: 'UNWATCHED' }],
  };

  it('accepts a list we wrote', () => {
    expect(parseStoredRecommendations([row])).toEqual([row]);
  });

  it('accepts an empty list, which is a real answer rather than a missing one', () => {
    expect(parseStoredRecommendations([])).toEqual([]);
  });

  it('rejects anything that is not a list', () => {
    expect(parseStoredRecommendations(null)).toBeNull();
    expect(parseStoredRecommendations({})).toBeNull();
    expect(parseStoredRecommendations('[]')).toBeNull();
  });

  it('rejects a row missing what the screen reads', () => {
    expect(parseStoredRecommendations([{ ...row, rootMalId: undefined }])).toBeNull();
    expect(parseStoredRecommendations([{ ...row, title: 42 }])).toBeNull();
    expect(parseStoredRecommendations([{ ...row, entries: undefined }])).toBeNull();
    expect(parseStoredRecommendations([{ ...row, entries: [{ title: 'no id' }] }])).toBeNull();
  });

  it('rejects the list if any row is bad, not just that row', () => {
    // Half a list is worse than none: the screen would render a short list with no sign anything
    // was dropped, and the fingerprint would still say it is fresh.
    expect(parseStoredRecommendations([row, { nope: true }])).toBeNull();
  });
});
