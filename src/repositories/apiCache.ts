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
import { supabase } from '@/account/supabaseClient';
import {
  getAnimeDetail,
  getAnimeRecommendations,
  type AnimeDetailDto,
  type AnimeRecommendationsDto,
} from '@/api/malDataApi';

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
 */
async function cached<T>(key: string, fetcher: () => Promise<T>, opts?: { bypass?: boolean }): Promise<T> {
  if (!opts?.bypass) {
    const { data } = await supabase.from('api_cache').select('json, fetched_at').eq('key', key).maybeSingle();
    if (data && Date.now() - Date.parse(data.fetched_at) < CACHE_TTL_MS) {
      return data.json as T;
    }
  }

  const fresh = await fetcher();
  void supabase.from('api_cache').upsert({ key, json: fresh as object }, { onConflict: 'key' });
  return fresh;
}

// Bump the version segment of a cache key whenever the *shape* of what we request changes — a row
// cached under the old key is still valid JSON, so nothing would refetch it and the new fields
// would silently read as undefined for up to a full TTL. v2 added `alternative_titles` (English
// titles); v3 added `mean` (MAL's rating, shown on Recommendations cards); v4 added `synopsis`
// (the not-yet-tracked-show preview screen's info popup). Stale rows from an older version simply
// age out and get pruned by the migration's daily cron job.
const DETAIL_CACHE_VERSION = 'v4';

/** Cache-first `GET /anime/{id}` — used by Import, Discover and Recommendations. */
export function getAnimeDetailCached(id: number, opts?: { bypass?: boolean }): Promise<AnimeDetailDto> {
  return cached(`detail:${DETAIL_CACHE_VERSION}:${id}`, () => getAnimeDetail(id), opts);
}

// Same versioning rule as DETAIL_CACHE_VERSION above — this key was missing one, which would have
// made the next change to the `recommendations` fields silently unrefreshable for a full TTL.
const RECS_CACHE_VERSION = 'v1';

/** Cache-first `GET /anime/{id}?fields=recommendations` — one call per watched series, so this is
 * the difference between Recommendations taking ~30s and ~5s on a repeat visit. */
export function getAnimeRecommendationsCached(
  id: number,
  opts?: { bypass?: boolean },
): Promise<AnimeRecommendationsDto> {
  return cached(`recs:${RECS_CACHE_VERSION}:${id}`, () => getAnimeRecommendations(id), opts);
}
