// Plan 9 step 2's partition: given the keys a stage wants and the rows one bulk select returned,
// which keys are answered and which still need a MAL call.
//
// It is tested because all three of its outcomes look identical from outside the function — a
// stale row and an absent one both just get fetched — so a TTL comparison with the wrong sign
// would present as a cache that silently never hits, and the only visible symptom would be a slow
// screen, which is what this step exists to fix. The boundary case below (a row exactly one TTL
// old) is the one a `<=` would get wrong.
//
// Every expected result here is derived from the timestamps on paper, not read off the
// implementation: `now` is injected, so each row's age is stated rather than raced for.
import { chunk, partitionCacheRows, type CacheRow } from '@/repositories/cachePartition';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 2,592,000,000 — the api_cache default
const NOW = Date.parse('2026-10-15T12:00:00.000Z');

function row(key: string, fetchedAt: string, json: unknown = { key }): CacheRow {
  return { key, json, fetched_at: fetchedAt };
}

describe('partitionCacheRows', () => {
  // Ages, counted by hand against NOW = 2026-10-15T12:00Z:
  //   a: 1 hour          =         3,600,000ms  -> fresh
  //   b: 29 days         =     2,505,600,000ms  -> fresh (Sep 16->30 is 14 days, + Oct 1->15 is 15)
  //   c: exactly 30 days =     2,592,000,000ms  -> STALE, the comparison is strictly less-than
  //   d: 75 days                                -> stale
  //   e: no row at all                           -> missing
  //   f: an undateable fetched_at                -> stale, because it cannot be trusted
  const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
  const rows = [
    row('d', '2026-08-01T12:00:00.000Z'),
    row('b', '2026-09-16T12:00:00.000Z'),
    row('f', 'whenever'),
    row('a', '2026-10-15T11:00:00.000Z'),
    row('c', '2026-09-15T12:00:00.000Z'),
  ];

  it('splits fresh rows from stale, undateable and absent ones', () => {
    const { hits, misses } = partitionCacheRows<{ key: string }>(keys, rows, { ttlMs: TTL_MS, now: NOW });

    expect(Array.from(hits.keys())).toEqual(['a', 'b']);
    expect(hits.get('a')).toEqual({ key: 'a' });
    expect(hits.get('b')).toEqual({ key: 'b' });
    expect(misses).toEqual(['c', 'd', 'e', 'f']);
  });

  it('counts a row exactly one TTL old as stale', () => {
    const oneTtlOld = [row('a', new Date(NOW - TTL_MS).toISOString())];
    const justInside = [row('a', new Date(NOW - TTL_MS + 1).toISOString())];

    expect(partitionCacheRows(['a'], oneTtlOld, { ttlMs: TTL_MS, now: NOW }).misses).toEqual(['a']);
    expect(partitionCacheRows(['a'], justInside, { ttlMs: TTL_MS, now: NOW }).misses).toEqual([]);
  });

  it('collapses duplicate keys, keeping the order first asked in', () => {
    // 'c' is stale and 'a' is fresh (same rows as above), each asked for twice.
    const { hits, misses } = partitionCacheRows(['c', 'a', 'c', 'a'], rows, { ttlMs: TTL_MS, now: NOW });

    expect(Array.from(hits.keys())).toEqual(['a']);
    expect(misses).toEqual(['c']);
  });

  it('ignores a row nobody asked for', () => {
    const withForeign = [...rows, row('z', '2026-10-15T11:59:00.000Z')];
    const { hits, misses } = partitionCacheRows(['a'], withForeign, { ttlMs: TTL_MS, now: NOW });

    expect(Array.from(hits.keys())).toEqual(['a']);
    expect(misses).toEqual([]);
  });

  it('honours a TTL other than the default', () => {
    // 'b' is 29 days old, so a 7-day TTL makes it a miss where the 30-day one made it a hit. This
    // is the getTitleResolutionCached case (a one-year TTL) read from the other direction.
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    expect(partitionCacheRows(['b'], rows, { ttlMs: sevenDays, now: NOW }).misses).toEqual(['b']);
    expect(partitionCacheRows(['b'], rows, { ttlMs: TTL_MS, now: NOW }).misses).toEqual([]);
  });

  it('asks for everything when there are no rows at all', () => {
    const { hits, misses } = partitionCacheRows(keys, [], { ttlMs: TTL_MS, now: NOW });

    expect(hits.size).toBe(0);
    expect(misses).toEqual(keys);
  });
});

describe('chunk', () => {
  it('splits into runs of at most size, last one short', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns one chunk when everything fits', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 200)).toEqual([]);
  });

  it('never loops forever on a non-positive size', () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
  });
});
