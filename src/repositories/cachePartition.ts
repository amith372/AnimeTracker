// The pure half of apiCache.ts's bulk read (plan 9 step 2): given the keys a stage wants and the
// rows one `select ... in (keys)` returned, decide which keys are answered and which still need a
// MAL call. No Supabase, no clock, no network — so it is unit-testable, which the partition
// genuinely needs: "fresh", "stale" and "absent" are three outcomes that look identical from the
// outside (a stale key and an absent one both just get fetched), so a TTL comparison with the
// wrong sign would show up only as a cache that silently never hits.
//
// It lives beside apiCache.ts rather than inside it because importing apiCache.ts pulls in
// src/account/supabaseClient.ts and, through it, AsyncStorage's native module — which no Jest
// test can load.

/** One `api_cache` row, as the bulk select returns it. `json` is whatever was cached. */
export interface CacheRow {
  key: string;
  json: unknown;
  fetched_at: string;
}

export interface CachePartition<T> {
  /** Keys answered from cache, within the TTL. */
  hits: Map<string, T>;
  /** Keys the caller must fetch: absent rows and rows past the TTL, in the order asked for. */
  misses: string[];
}

/**
 * Splits `keys` into cache hits and keys still needing a fetch.
 *
 * Four rules, each one a case that actually arises:
 *  - A row is a hit only while `now - fetched_at < ttlMs` — the same strict comparison the
 *    single-key `cached()` uses, so bulk and single reads can never disagree about one row.
 *  - An unparseable `fetched_at` is a miss. `Date.parse` gives NaN and every comparison against
 *    NaN is false, so this falls out of the rule above rather than needing its own branch — but it
 *    is deliberate, not incidental: a row we cannot date is a row we cannot trust.
 *  - Duplicate keys collapse to one, keeping first-asked order. A duplicate would otherwise be
 *    fetched twice and written back twice for one result.
 *  - A row whose key nobody asked for is ignored. An `in` query cannot return one, but partitioning
 *    is also what decides what gets *refetched*, and silently treating a foreign row as an answer
 *    would be the worse failure.
 *
 * `now` is injected rather than read from `Date.now()` so a test can state the age of each row
 * instead of racing the clock.
 */
export function partitionCacheRows<T>(
  keys: string[],
  rows: CacheRow[],
  opts: { ttlMs: number; now: number },
): CachePartition<T> {
  const wanted = new Set(keys);
  const freshByKey = new Map<string, T>();
  for (const row of rows) {
    if (!wanted.has(row.key) || freshByKey.has(row.key)) continue;
    if (opts.now - Date.parse(row.fetched_at) < opts.ttlMs) freshByKey.set(row.key, row.json as T);
  }

  const hits = new Map<string, T>();
  const misses: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (freshByKey.has(key)) hits.set(key, freshByKey.get(key)!);
    else misses.push(key);
  }
  return { hits, misses };
}

/**
 * Splits `items` into runs of at most `size`. Used on both halves of the bulk read: a `.in()` list
 * travels in the URL, so a long one would hit a URL-length limit rather than erroring usefully,
 * and one upsert of several hundred rows is worth breaking up for the same reason.
 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  const width = Math.max(1, size);
  for (let i = 0; i < items.length; i += width) out.push(items.slice(i, i + width));
  return out;
}
