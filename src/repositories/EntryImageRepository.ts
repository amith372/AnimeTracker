// A single season/movie's own cover art, for the Series Detail screen's title-tap popup. No new
// cache table needed — getAnimeDetailCached already fetches+caches `main_picture` as part of its
// normal detail fetch (30-day TTL, shared Postgres table, see apiCache.ts), and that field has
// been part of its field set since before this repository existed, so no DETAIL_CACHE_VERSION
// bump either.
import { getAnimeDetailCached } from './apiCache';

export async function getEntryImageUrl(malId: number): Promise<string | null> {
  try {
    const detail = await getAnimeDetailCached(malId);
    return detail.main_picture?.large ?? detail.main_picture?.medium ?? null;
  } catch {
    // Fail gracefully — a season's picture failing to load is never worth crashing over
    // (CLAUDE.md guardrail #5).
    return null;
  }
}

/** Cover art *and* summary for one season/movie, for the title-tap popup. Both fields come from the
 * same cached detail response, so this is deliberately one call rather than getEntryImageUrl +
 * getSynopsis back to back — those would be two round trips to the shared api_cache table for data
 * that arrives together. Each half is independently nullable: MAL genuinely omits a synopsis for
 * many individual seasons. */
export interface EntryPreview {
  imageUrl: string | null;
  synopsis: string | null;
}

export async function getEntryPreview(malId: number): Promise<EntryPreview> {
  try {
    const detail = await getAnimeDetailCached(malId);
    return {
      imageUrl: detail.main_picture?.large ?? detail.main_picture?.medium ?? null,
      synopsis: detail.synopsis?.trim() || null,
    };
  } catch {
    return { imageUrl: null, synopsis: null };
  }
}
