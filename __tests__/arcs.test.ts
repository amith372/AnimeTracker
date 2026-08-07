import { ONE_PIECE_ARCS, ONE_PIECE_MAL_ID, arcsForMalId } from '@/domain/arcs';
import { allArcsWatched } from '@/domain/series';

test('arcsForMalId returns the full One Piece arc list', () => {
  const arcs = arcsForMalId(ONE_PIECE_MAL_ID);
  expect(arcs).toBe(ONE_PIECE_ARCS);
  expect(arcs?.length).toBeGreaterThan(0);
});

test('arcs are in ascending, non-overlapping episode order', () => {
  for (let i = 1; i < ONE_PIECE_ARCS.length; i++) {
    expect(ONE_PIECE_ARCS[i].episodeStart).toBeGreaterThan(ONE_PIECE_ARCS[i - 1].episodeStart);
    expect(ONE_PIECE_ARCS[i].episodeStart).toBeGreaterThan(ONE_PIECE_ARCS[i - 1].episodeEnd - 1);
  }
});

test('every arc has a unique key', () => {
  const keys = ONE_PIECE_ARCS.map((a) => a.key);
  expect(new Set(keys).size).toBe(keys.length);
});

test('arcsForMalId returns undefined for any other malId', () => {
  expect(arcsForMalId(1)).toBeUndefined();
  expect(arcsForMalId(5114)).toBeUndefined();
});

describe('allArcsWatched', () => {
  const arcs = ONE_PIECE_ARCS.slice(0, 3);
  const keys = arcs.map((a) => a.key);

  test('null or empty watchedArcKeys is false', () => {
    expect(allArcsWatched(arcs, null)).toBe(false);
    expect(allArcsWatched(arcs, [])).toBe(false);
  });

  test('a partial set is false', () => {
    expect(allArcsWatched(arcs, [keys[0]])).toBe(false);
  });

  test('the exact full set, in any order, is true', () => {
    expect(allArcsWatched(arcs, [...keys].reverse())).toBe(true);
  });

  test('the full set plus an unrelated stale key is still true', () => {
    expect(allArcsWatched(arcs, [...keys, 'some_removed_arc'])).toBe(true);
  });
});
