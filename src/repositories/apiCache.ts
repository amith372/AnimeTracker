// Shared Postgres-backed cache for MAL responses — CLAUDE.md guardrail #3 ("cache results … never
// hammer endpoints in tight loops"). Direct-Postgres cutover note: this table is SHARED across
// every account (and readable by guests), not per-device like the old SQLite version, because
// anime detail/recommendations data is user-independent — one user's fetch warms it for everyone,
// including guests browsing Discover with no account of their own. See
// supabase/migrations/20260812000000_direct_postgres.sql for the table, RLS, and prune cron.
//
// Per-anime lookups are the expensive part of this app: Discover fetches one detail per browse
// result, Recommendations one per candidate *plus* one recommendations call per watched series,
// Import one per list entry — and those sets overlap heavily, both within a run and across visits,
// and now across *users* too. The underlying data (genres, relations, cover, "people who liked this
// also liked…") changes on the order of months, so a long TTL is safe.
//
// Single-key and bulk reads live side by side here: `cached()` for a genuine one-off lookup, and
// `cachedMany()` for a stage that knows every key it wants up front. On a warm cache the bulk form
// is the difference between one round trip and hundreds — see its comment.
import { supabase } from '@/account/supabaseClient';
import { mapWithConcurrency } from '@/api/concurrency';
import {
  getAnimeDetail,
  getAnimeRecommendations,
  type AnimeDetailDto,
  type AnimeRecommendationsDto,
} from '@/api/malDataApi';
import { chunk, partitionCacheRows, type CacheRow } from './cachePartition';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generic cache-first read. On a hit within the TTL the stored JSON is returned with no network
 * call at all; otherwise `fetcher` runs and the result is written back.
 *
 * The write-back is fire-and-forget with errors swallowed — this is the one line in this file that
 * must not be gotten wrong. For a guest (`anon`) caller the write always fails (RLS grants `anon`
 * select only), and Discover/Recommendations must keep working with an unwarmed cache rather than
 * break because the write couldn't happen. `bypass: true` skips the read (not the write) — used by
 * the manual "refresh" action so it fetches fresh data without wiping what everyone else has cached.
 *
 * `ttlMs` overrides the 30-day default for a key space whose data ages differently — see
 * getTitleResolutionCached, where the mapping being cached is effectively permanent.
 */
async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { bypass?: boolean; ttlMs?: number },
): Promise<T> {
  if (!opts?.bypass) {
    const { data } = await supabase.from('api_cache').select('json, fetched_at').eq('key', key).maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < (opts?.ttlMs ?? CACHE_TTL_MS)) {
      return data.json as T;
    }
  }

  const fresh = await fetcher();
  void supabase.from('api_cache').upsert({ key, json: fresh as object }, { onConflict: 'key' });
  return fresh;
}

// How many keys travel in one `.in()` list, and how many rows in one upsert. A `.in()` list is
// serialized into the request URL, so a few hundred keys would run into a URL-length limit — a
// failure that arrives as an opaque 4xx rather than as anything pointing back here. 200 keys of
// `detail:v5:12345` shape is roughly 3-4KB, comfortably inside any limit, and Recommendations' two
// largest stages (160 candidates, and a closure pass over them) each fit in one or two chunks.
const CACHE_READ_CHUNK_SIZE = 200;
const CACHE_WRITE_CHUNK_SIZE = 200;

/**
 * Bulk cache-first read: one round trip for every key a stage wants, then a MAL call for only the
 * keys that were absent or past the TTL.
 *
 * This exists because `cached()` makes its own round trip *per key*, and since the Phase 12
 * direct-Postgres cutover every one of those costs a full edge→region→edge leg (~350ms measured).
 * A warm Recommendations run asked for several hundred keys one at a time and spent minutes doing
 * nothing but waiting — all of it on our own Postgres, none of it on MAL. Same rows, same keys,
 * same TTL; only the number of requests changes, which moves guardrail #3 in the right direction.
 *
 * Semantics deliberately match `cached()` key for key:
 *  - `bypass` skips the read, never the write (the manual "refresh" action).
 *  - the write-back is one array upsert, fire-and-forget with errors swallowed, because an `anon`
 *    guest can never write this table and must keep working with an unwarmed cache.
 *  - `fetchOne` failures are best-effort: the key simply doesn't appear in the returned map, which
 *    is what every per-anime caller here already did with its own try/catch.
 *
 * `onResolved` fires once per key — for hits, for fetched misses and for failed misses alike — so a
 * caller's progress counter still reaches its total. Every hit fires before the first fetch is
 * awaited, which is what makes a warm stage's counter jump to its total instead of ticking.
 *
 * `concurrency` is required rather than defaulted: it is the pacing of real MAL requests, and
 * guardrail #3 is better served by each call site stating its own than by inheriting a number.
 */
async function cachedMany<T>(
  keys: string[],
  fetchOne: (key: string) => Promise<T>,
  opts: { concurrency: number; bypass?: boolean; ttlMs?: number; onResolved?: (key: string) => void },
): Promise<Map<string, T>> {
  const wanted = Array.from(new Set(keys));
  const resolved = new Map<string, T>();
  let misses = wanted;

  if (!opts.bypass) {
    const rows: CacheRow[] = [];
    // Chunks go out together: these are reads of our own Postgres, a handful of them at most, and
    // paying the ~350ms leg once per chunk sequentially would give back part of what this is for.
    await Promise.all(
      chunk(wanted, CACHE_READ_CHUNK_SIZE).map(async (part) => {
        const { data } = await supabase.from('api_cache').select('key, json, fetched_at').in('key', part);
        if (data) rows.push(...(data as CacheRow[]));
      }),
    );
    const partition = partitionCacheRows<T>(wanted, rows, {
      ttlMs: opts.ttlMs ?? CACHE_TTL_MS,
      now: Date.now(),
    });
    for (const [key, value] of partition.hits) {
      resolved.set(key, value);
      opts.onResolved?.(key);
    }
    misses = partition.misses;
  }

  const fetched: { key: string; json: object }[] = [];
  await mapWithConcurrency(misses, opts.concurrency, async (key) => {
    try {
      const fresh = await fetchOne(key);
      resolved.set(key, fresh);
      fetched.push({ key, json: fresh as object });
    } catch {
      // Best-effort — see the header. The key is absent from the result map and the caller drops it.
    }
    opts.onResolved?.(key);
  });

  for (const part of chunk(fetched, CACHE_WRITE_CHUNK_SIZE)) {
    void supabase.from('api_cache').upsert(part, { onConflict: 'key' });
  }
  return resolved;
}

/**
 * Runs `cachedMany` over MAL ids rather than cache keys, so no caller outside this file ever
 * builds a key — the key space and its version segment stay owned here, exactly as they are for
 * the single-id functions. Shared by both key spaces below.
 */
async function cachedManyByMalId<T>(
  ids: number[],
  keyOf: (id: number) => string,
  fetchOne: (id: number) => Promise<T>,
  opts: BulkCacheOptions,
): Promise<Map<number, T>> {
  const idByKey = new Map(ids.map((id) => [keyOf(id), id]));
  const resolved = await cachedMany<T>(ids.map(keyOf), (key) => fetchOne(idByKey.get(key)!), {
    concurrency: opts.concurrency,
    bypass: opts.bypass,
    onResolved: opts.onResolved && ((key) => opts.onResolved!(idByKey.get(key)!)),
  });

  const byId = new Map<number, T>();
  for (const [key, value] of resolved) byId.set(idByKey.get(key)!, value);
  return byId;
}

/** What every bulk wrapper takes: the pacing of the MAL calls its misses need, plus the same
 * `bypass` every cached read has, plus a per-id progress tick. */
export interface BulkCacheOptions {
  concurrency: number;
  bypass?: boolean;
  onResolved?: (id: number) => void;
}

// Bump the version segment of a cache key whenever the *shape* of what we request changes — a row
// cached under the old key is still valid JSON, so nothing would refetch it and the new fields
// would silently read as undefined for up to a full TTL. v2 added `alternative_titles` (English
// titles); v3 added `mean` (MAL's rating, shown on Recommendations cards); v4 added `synopsis`
// (the not-yet-tracked-show preview screen's info popup); v5 added `studios`, `source` and
// `num_list_users` (the taste axes beyond genre, and the obscurity signal). Stale rows from an
// older version simply age out and get pruned by the migration's daily cron job.
//
// `num_list_users` has no reader yet — it is step 7's obscurity ceiling and the PRD's success
// criterion 8. It is requested now anyway, because the alternative is bumping the version a second
// time later and throwing away a warm 30-day cache twice for one feature.
const DETAIL_CACHE_VERSION = 'v5';

// Written once and read by both the single and the bulk form, so the two can never drift onto
// different key spaces for the same data.
const detailKey = (id: number) => `detail:${DETAIL_CACHE_VERSION}:${id}`;

/** Cache-first `GET /anime/{id}` — used by Import, Discover and Recommendations. */
export function getAnimeDetailCached(id: number, opts?: { bypass?: boolean }): Promise<AnimeDetailDto> {
  return cached(detailKey(id), () => getAnimeDetail(id), opts);
}

/** Cache-first `GET /anime/{id}` for a whole batch of ids in one cache round trip — the bulk form
 * of the call above, and the hot path of both Discover's grouping and Recommendations' candidate
 * stage. An id whose fetch fails is absent from the map rather than throwing. */
export function getAnimeDetailCachedMany(
  ids: number[],
  opts: BulkCacheOptions,
): Promise<Map<number, AnimeDetailDto>> {
  return cachedManyByMalId(ids, detailKey, getAnimeDetail, opts);
}

// Same versioning rule as DETAIL_CACHE_VERSION above — this key was missing one, which would have
// made the next change to the `recommendations` fields silently unrefreshable for a full TTL.
const RECS_CACHE_VERSION = 'v1';

const recsKey = (id: number) => `recs:${RECS_CACHE_VERSION}:${id}`;

/** Cache-first `GET /anime/{id}?fields=recommendations` — one call per watched series, so this is
 * the difference between Recommendations taking ~30s and ~5s on a repeat visit. */
export function getAnimeRecommendationsCached(
  id: number,
  opts?: { bypass?: boolean },
): Promise<AnimeRecommendationsDto> {
  return cached(recsKey(id), () => getAnimeRecommendations(id), opts);
}

/** The bulk form: every watched series' recommendations in one cache round trip. */
export function getAnimeRecommendationsCachedMany(
  ids: number[],
  opts: BulkCacheOptions,
): Promise<Map<number, AnimeRecommendationsDto>> {
  return cachedManyByMalId(ids, recsKey, getAnimeRecommendations, opts);
}

const RESOLVE_CACHE_VERSION = 'v1';

// A year rather than the 30-day default. What this key space holds is a title→MAL-id mapping, and
// a show's title does not change — so the usual reason for a TTL (the data drifts) doesn't apply,
// and the PRD asks for it explicitly. The TTL is not zero only because a *failed* resolution is
// cached too (see below) and MAL's catalogue does gain entries.
const RESOLVE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** What one title resolved to, or null when nothing on MAL matched it closely enough. */
export interface ResolvedTitle {
  malId: number | null;
}

/**
 * Cache-first title→id resolution for plan 1 step 7's generator gate. Keyed by the *normalized*
 * title (src/domain/candidateGenerator.ts's normalizeTitle), so two spellings of one show share a
 * row instead of each paying a MAL search.
 *
 * The caller supplies `resolve` because the matching decision is domain logic and belongs in
 * src/domain, not in a cache — this function owns the key space and the TTL and nothing else.
 *
 * A null result is cached deliberately. A fabricated title is the common case this gate exists
 * for, and re-searching MAL for the same invented show on every refresh would be exactly the
 * tight loop guardrail #3 forbids. Being in the shared table is fine and in fact desirable: the
 * mapping is a fact about MAL's catalogue, identical for every account, and carries nothing about
 * whose library prompted the lookup.
 */
export function getTitleResolutionCached(
  normalizedTitle: string,
  resolve: () => Promise<ResolvedTitle>,
  opts?: { bypass?: boolean },
): Promise<ResolvedTitle> {
  return cached(`resolve:${RESOLVE_CACHE_VERSION}:${normalizedTitle}`, resolve, {
    bypass: opts?.bypass,
    ttlMs: RESOLVE_TTL_MS,
  });
}
