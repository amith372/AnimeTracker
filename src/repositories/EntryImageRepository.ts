// A single season/movie's own cover art, for the Series Detail screen's title-tap popup. No new
// cache table needed — getAnimeDetailCached already fetches+caches `main_picture` as part of its
// normal detail fetch (30-day TTL, SQLite-backed, see apiCache.ts), and that field has been part
// of its field set since before this repository existed, so no DETAIL_CACHE_VERSION bump either.
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
