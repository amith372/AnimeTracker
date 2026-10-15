// Plan 9 step 3's pure half: when a stored "For you" list may be rendered as-is, and when it has
// to be rebuilt.
//
// The whole point of the step is that the pipeline re-ran on every mount and every page reload to
// rebuild a list that usually could not have changed. What decides that is the same question the
// taste profile already asks -- "has the library moved in a way that matters" -- so this reuses
// tasteFingerprint() rather than inventing a second notion of change. It moves when a series is
// liked or unliked, dropped or undropped, or finally finished, and when a contributing series is
// added or removed; it deliberately does not move on an episode or season tick short of
// completion, which is what makes most visits free.
//
// Why that is enough even though the ranking also depends on which shows are *tracked* (a show
// just added to Plan to watch must not still be offered): the Recommendations screen already
// filters whatever list it holds against the live tracked-id set on every render, so a newly
// tracked show disappears from a restored list without any recompute. A *fresh ranking* after a
// removal still needs the refresh button, exactly as it did before this step.
import type { ReconcileSeries } from './reconcileSeries';
import type { Series } from './series';
import { tasteFingerprint } from './tasteProfile';

/**
 * The shape of a stored row, versioned. Bump it whenever what a stored list *contains* changes --
 * a new field on ReconcileSeries that the screen then reads, say -- and every stored row becomes
 * stale and is rebuilt on its owner's next visit. Without it an old row is still valid JSON, so
 * nothing would rebuild it and the new field would read as undefined for as long as the library
 * sat still. The same reasoning as apiCache.ts's DETAIL_CACHE_VERSION, one layer up.
 */
export const RECOMMENDATION_ROWS_VERSION = 'r1';

/** The digest a stored list is filed under: the row shape it was written in, plus the taste state
 * it was computed from. */
export function recommendationListFingerprint(library: Series[]): string {
  return `${RECOMMENDATION_ROWS_VERSION}:${tasteFingerprint(library)}`;
}

/**
 * Whether a stored list still matches the library it was computed from. A missing list is stale by
 * definition, which is what makes "compute" and "recompute" the same call -- the same shape
 * isTasteProfileStale() uses, for the same reason.
 */
export function isRecommendationListStale(storedFingerprint: string | null, library: Series[]): boolean {
  return storedFingerprint !== recommendationListFingerprint(library);
}

/**
 * Narrows whatever came back from the `series` column into a list the screen can render, or null
 * if it is unusable.
 *
 * Unlike the taste profile's parser this is not guarding against an untrusted model -- we wrote
 * these rows ourselves. It guards against *our own past*: a row written by an older build, or a
 * row somehow truncated, would otherwise reach a FlatList and crash the screen that is supposed to
 * be the fast path. Returning null degrades to "nothing stored", i.e. compute it, which is always
 * correct and only ever slow.
 *
 * Deliberately shallow: it checks the fields the list's own render and filtering read -- title,
 * rootMalId and the entries' malIds -- and does not re-validate every leaf. A deep validator here
 * would be a second copy of the type, drifting from the first.
 */
export function parseStoredRecommendations(raw: unknown): ReconcileSeries[] | null {
  if (!Array.isArray(raw)) return null;
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const series = item as Partial<ReconcileSeries>;
    if (typeof series.title !== 'string' || typeof series.rootMalId !== 'number') return null;
    if (!Array.isArray(series.entries)) return null;
    if (!series.entries.every((entry) => entry && typeof entry.malId === 'number')) return null;
  }
  return raw as ReconcileSeries[];
}
