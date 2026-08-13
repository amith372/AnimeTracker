// A show's plot summary — needed by the not-yet-tracked show preview screen
// (src/app/series/preview.tsx), both for the blurb under the genres line and the full-text popup.
// Reuses the same cached per-anime detail fetch as everything else (apiCache.ts), so this never
// costs an extra MAL request beyond what's already cached.
import { getAnimeDetailCached } from './apiCache';

/** Attribution footers MAL appends to its own synopsis text. Fine at the bottom of a scrollable
 * popup, but in a three-line blurb they can eat a whole line of the little space there is — and on
 * a short synopsis they can be most of what's visible. Stripped for display only; we still credit
 * MyAnimeList app-wide (MalAttribution, CLAUDE.md guardrail #4). */
const SOURCE_TAG = /\s*\[(Written by MAL Rewrite|Source:[^\]]*)\]\s*$/i;

/**
 * Cleans MAL's raw synopsis for display: drops the trailing source tag and collapses the hard line
 * breaks MAL embeds mid-paragraph, which otherwise render as ragged short lines in a clamped blurb.
 */
function tidy(raw: string): string {
  return raw.replace(SOURCE_TAG, '').replace(/\r/g, '').replace(/\n{2,}/g, '\n\n').trim();
}

export async function getSynopsis(malId: number): Promise<string | null> {
  try {
    const detail = await getAnimeDetailCached(malId);
    const raw = detail.synopsis?.trim();
    return raw ? tidy(raw) : null;
  } catch {
    // Fail gracefully — a missing summary is never worth crashing over (CLAUDE.md guardrail #5).
    return null;
  }
}
