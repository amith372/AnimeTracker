// Server-side reader/writer for the shared `api_cache` table — the Edge Function counterpart to
// src/repositories/apiCache.ts, and the same guardrail #3 ("cache results") obligation applied to
// the one place that makes the most MAL calls by far: mal-import, which fetches one `anime/{id}`
// per list entry plus the whole related-anime closure on top.
//
// Deliberately uses the SAME key space and TTL as the client (`detail:v4:{id}`), because
// mal-import and mal-anime-detail request byte-identical `fields` — so an import warms the cache
// for Discover/Recommendations/preview and vice versa. If those two field lists ever diverge, the
// version segment here must diverge too, or one side reads the other's rows with fields missing
// (see the client file's DETAIL_CACHE_VERSION comment for why that failure is silent and lasts a
// full TTL).
//
// Batched on purpose: an import can look up several hundred ids, and doing that as one select per
// id would just trade MAL round trips for Postgres round trips.
import { supabaseAdmin } from './supabaseAdmin.ts';

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — must match src/repositories/apiCache.ts
const DETAIL_CACHE_VERSION = 'v4'; // must match the client's DETAIL_CACHE_VERSION
// Keeps the `key=in.(...)` filter from growing an unbounded URL; PostgREST takes these as a query
// string, so a single select with 500+ ids risks a 414 rather than just being slow.
const SELECT_CHUNK = 200;

function detailCacheKey(id: number): string {
  return `detail:${DETAIL_CACHE_VERSION}:${id}`;
}

/** Parses the numeric id back out of a `detail:v4:123` key, so a batched select can be re-keyed. */
function idFromDetailCacheKey(key: string): number | null {
  const id = Number(key.slice(key.lastIndexOf(':') + 1));
  return Number.isFinite(id) ? id : null;
}

/**
 * Cache-first bulk read of `anime/{id}` details. Returns only live (within-TTL) hits — anything
 * missing or stale is simply absent from the map, leaving the caller to fetch it from MAL.
 * Never throws: a cache that's unreachable must degrade to "cold", not fail the whole import.
 */
export async function readCachedDetails<T>(ids: number[]): Promise<Map<number, T>> {
  const hits = new Map<number, T>();
  if (ids.length === 0) return hits;

  for (let i = 0; i < ids.length; i += SELECT_CHUNK) {
    const keys = ids.slice(i, i + SELECT_CHUNK).map(detailCacheKey);
    try {
      const { data, error } = await supabaseAdmin.from('api_cache').select('key, json, fetched_at').in('key', keys);
      if (error || !data) continue;
      for (const row of data) {
        if (Date.now() - Date.parse(row.fetched_at) >= CACHE_TTL_MS) continue;
        const id = idFromDetailCacheKey(row.key);
        if (id !== null) hits.set(id, row.json as T);
      }
    } catch {
      // Treated as a cache miss for this chunk — see the note above.
    }
  }
  return hits;
}

/**
 * Writes freshly-fetched details back. Awaited (unlike the client's fire-and-forget write) because
 * an Edge Function invocation can be torn down the moment it returns its response, which would
 * cancel an un-awaited write in flight — and best-effort: a failed cache write must never fail the
 * import that produced the data.
 */
export async function writeCachedDetails<T>(details: Map<number, T>): Promise<void> {
  if (details.size === 0) return;
  const rows = Array.from(details.entries()).map(([id, json]) => ({ key: detailCacheKey(id), json: json as object }));
  for (let i = 0; i < rows.length; i += SELECT_CHUNK) {
    try {
      await supabaseAdmin.from('api_cache').upsert(rows.slice(i, i + SELECT_CHUNK), { onConflict: 'key' });
    } catch {
      // Best-effort, as above.
    }
  }
}
