// Turns a pick from an Add picker (Discover's dialog, the preview screen) into the ReconcileSeries
// that actually gets written to the library. Four of the five choices are plain manual statuses and
// just set manualStatus; the fifth, `WATCHED`, is the interesting one — see below.
import type { AddChoice } from './statusLabel';
import type { ReconcileEntry, ReconcileSeries } from './reconcileSeries';

/**
 * Applies the user's Add choice to a prospective series.
 *
 * `WATCHED` deliberately does *not* set a manual status: "Watched" is derived from which entries
 * are resolved (CLAUDE.md's status-derivation table), so a manual override would be a one-way door
 * that stops the count ever moving. Instead it leaves manualStatus on `NONE` (Auto) and marks the
 * *first season only* — the user is saying "I've seen this show", and season 1 is the only part
 * that's safe to assume from that. A show with more seasons then correctly reads "Watched 1/3
 * seasons" rather than falsely claiming the whole thing is finished, and a single-season show
 * derives straight to "Watched" with no further tapping.
 */
export function applyAddChoice(series: ReconcileSeries, choice: AddChoice): ReconcileSeries {
  if (choice !== 'WATCHED') return { ...series, manualStatus: choice };
  return { ...series, manualStatus: 'NONE', entries: markFirstSeasonWatched(series.entries) };
}

/**
 * Marks exactly one entry WATCHED: the lowest-ordered TV season, or — for a standalone movie, which
 * has no seasons at all — the lowest-ordered movie, since otherwise "Watched" would add the film
 * marked unwatched and immediately read "Watched 0/1 movies".
 */
function markFirstSeasonWatched(entries: ReconcileEntry[]): ReconcileEntry[] {
  const seasons = entries.filter((e) => e.kind === 'TV_SEASON');
  const candidates = seasons.length > 0 ? seasons : entries;
  if (candidates.length === 0) return entries;
  const first = candidates.reduce((lowest, e) => (e.orderIndex < lowest.orderIndex ? e : lowest));
  return entries.map((e) => (e.malId === first.malId ? { ...e, watchState: 'WATCHED' } : e));
}
