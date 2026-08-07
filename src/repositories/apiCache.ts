// SQLite-backed cache for MAL responses — CLAUDE.md guardrail #3 ("cache results in Room … never
// hammer endpoints in tight loops").
//
// Per-anime lookups are the expensive part of this app: Discover fetches one detail per browse
// result, Recommendations one per candidate *plus* one recommendations call per watched series,
// Import one per list entry — and those sets overlap heavily, both within a run and across visits.
// The underlying data (genres, relations, cover, "people who liked this also liked…") changes on
// the order of months, so a long TTL is safe and turns repeat visits from minutes into seconds.
//
// Lives in repositories/ rather than api/ deliberately: src/api/ has no SQLite dependency today
// and keeping that layer purely about the network is worth preserving.
import { eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { apiCache } from '@/db/schema';
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
 * A corrupt/unparseable row is treated as a miss rather than throwing — a bad row should cost one
 * refetch, not break the screen.
 */
async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const rows = await db.select().from(apiCache).where(eq(apiCache.key, key)).limit(1);
  const hit = rows[0];
  if (hit && Date.now() - hit.fetchedAtEpochMillis < CACHE_TTL_MS) {
    try {
      return JSON.parse(hit.json) as T;
    } catch {
      // Fall through and refetch.
    }
  }

  const fresh = await fetcher();
  const row = { key, json: JSON.stringify(fresh), fetchedAtEpochMillis: Date.now() };
  // Upsert: the same key is refetched over time as entries expire.
  await db.insert(apiCache).values(row).onConflictDoUpdate({ target: apiCache.key, set: row });
  return fresh;
}

// Bump the version segment of a cache key whenever the *shape* of what we request changes — a row
// cached under the old key is still valid JSON, so nothing would refetch it and the new fields
// would silently read as undefined for up to a full TTL. v2 added `alternative_titles` (English
// titles); v3 added `mean` (MAL's rating, shown on Recommendations cards); v4 added `synopsis`
// (the not-yet-tracked-show preview screen's info popup). Stale rows from an older version simply
// age out and get pruned.
const DETAIL_CACHE_VERSION = 'v4';

/** Cache-first `GET /anime/{id}` — used by Import, Discover and Recommendations. */
export function getAnimeDetailCached(id: number): Promise<AnimeDetailDto> {
  return cached(`detail:${DETAIL_CACHE_VERSION}:${id}`, () => getAnimeDetail(id));
}

// Same versioning rule as DETAIL_CACHE_VERSION above — this key was missing one, which would have
// made the next change to the `recommendations` fields silently unrefreshable for a full TTL.
const RECS_CACHE_VERSION = 'v1';

/** Cache-first `GET /anime/{id}?fields=recommendations` — one call per watched series, so this is
 * the difference between Recommendations taking ~30s and ~5s on a repeat visit. */
export function getAnimeRecommendationsCached(id: number): Promise<AnimeRecommendationsDto> {
  return cached(`recs:${RECS_CACHE_VERSION}:${id}`, () => getAnimeRecommendations(id));
}

/** Drops every cached row — backs the manual "refresh" action on the Recommendations screen. */
export async function clearApiCache(): Promise<void> {
  await db.delete(apiCache);
}

/** Deletes rows past the TTL. Called once on startup so the table can't grow without bound. */
export async function pruneExpiredApiCache(): Promise<void> {
  await db.delete(apiCache).where(lt(apiCache.fetchedAtEpochMillis, Date.now() - CACHE_TTL_MS));
}
