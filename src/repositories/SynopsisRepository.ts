// A show's plot summary — only needed by the not-yet-tracked show preview screen's info popup
// (src/app/series/preview.tsx). Reuses the same cached per-anime detail fetch as everything else
// (apiCache.ts), so this never costs an extra MAL request beyond what's already cached.
import { getAnimeDetailCached } from './apiCache';

export async function getSynopsis(malId: number): Promise<string | null> {
  try {
    const detail = await getAnimeDetailCached(malId);
    return detail.synopsis ?? null;
  } catch {
    // Fail gracefully — a missing summary is never worth crashing over (CLAUDE.md guardrail #5).
    return null;
  }
}
