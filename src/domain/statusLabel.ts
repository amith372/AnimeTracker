import type { SeriesStatus } from './seriesStatus';
import type { ManualStatus } from './types';

/**
 * Generic name for a status *category*, with no series attached — used by the Library's filter
 * chips, which describe a whole bucket rather than one show. Note `WATCHED_PARTIAL` reads as the
 * literal "Watched X/Y" here, since there are no real season counts to fill in.
 */
export function statusKindLabel(kind: SeriesStatus['kind']): string {
  switch (kind) {
    case 'PLAN':
      return 'Plan to watch';
    case 'CURRENTLY_WATCHING':
      return 'Currently watching';
    case 'DROPPED':
      return 'Dropped';
    case 'WATCHED_FORGOT':
      return 'Watched (forgot details)';
    case 'WATCHED':
      return 'Watched';
    case 'WATCHED_PARTIAL':
      return 'Watched X/Y';
  }
}

/**
 * Turns one series' SeriesStatus into the exact text shown in the UI (Library rows, Detail
 * header). Identical to statusKindLabel except for WATCHED_PARTIAL, where the real counts replace
 * the generic "X/Y" — "Watched 3/5 seasons, 2/3 movies".
 *
 * Each half is dropped when the series has none of that kind, which is the common case both ways:
 * most series have no films ("Watched 3/5 seasons") and a standalone movie has no seasons
 * ("Watched 0/1 movies"). Printing "0/0 seasons" would be noise on nearly every row.
 */
export function statusLabel(status: SeriesStatus): string {
  if (status.kind !== 'WATCHED_PARTIAL') return statusKindLabel(status.kind);

  const parts: string[] = [];
  if (status.totalSeasons > 0) {
    parts.push(`${status.watchedSeasons}/${status.totalSeasons} seasons`);
  }
  if (status.totalMovies > 0) {
    parts.push(`${status.watchedMovies}/${status.totalMovies} movies`);
  }
  // Nothing to count at all can't happen alongside WATCHED_PARTIAL (a series with no entries
  // derives to WATCHED), but a bare "Watched" beats an empty string if it ever did.
  return parts.length > 0 ? `Watched ${parts.join(', ')}` : 'Watched';
}

/** Every derived status kind, in the order the Library's filter chips show them. */
export const STATUS_FILTER_KINDS: SeriesStatus['kind'][] = [
  'CURRENTLY_WATCHING',
  'PLAN',
  'WATCHED',
  'WATCHED_PARTIAL',
  'DROPPED',
  'WATCHED_FORGOT',
];

/**
 * Label for a *manual* status — what the user explicitly picked, rather than the derived status
 * above. The two differ in one important way: `NONE` isn't a status the user sees on a series,
 * it means "I haven't overridden anything, work it out from which seasons I've watched."
 */
export function manualStatusLabel(status: ManualStatus): string {
  switch (status) {
    case 'PLAN':
      return 'Plan to watch';
    case 'CURRENTLY_WATCHING':
      return 'Currently watching';
    case 'DROPPED':
      return 'Dropped';
    case 'WATCHED_FORGOT':
      return 'Watched (forgot details)';
    case 'NONE':
      return 'Auto — from watched seasons';
  }
}

/**
 * The four statuses a user can deliberately assign, in the order pickers show them. Excludes
 * `NONE`, since "auto-derive" is only meaningful as a way to *undo* an override on a series
 * that's already tracked — the Add dialogs (Discover/Recommendations) offer these four only,
 * while the Detail screen's editor appends `NONE` so there's a way back to derived status.
 */
export const MANUAL_STATUS_CHOICES: ManualStatus[] = [
  'PLAN',
  'CURRENTLY_WATCHING',
  'DROPPED',
  'WATCHED_FORGOT',
];

/**
 * What the *Add* pickers (Discover's dialog, the not-yet-tracked preview screen) offer. It's the
 * four manual statuses plus a fifth pseudo-choice, `WATCHED`, which isn't a manual status at all:
 * "Watched" is a *derived* status (CLAUDE.md's status-derivation table), so picking it here means
 * "leave the status on Auto and mark the show's first season as watched" — see applyAddChoice.
 * Without it there was no way to add a show you'd already started other than adding it and then
 * going into its Detail screen to tick season 1.
 */
export type AddChoice = ManualStatus | 'WATCHED';

export const ADD_STATUS_CHOICES: AddChoice[] = [
  'PLAN',
  'CURRENTLY_WATCHING',
  'WATCHED',
  'DROPPED',
  'WATCHED_FORGOT',
];

/** Label for an Add picker row — manualStatusLabel plus the derived-status pseudo-choice, whose
 * text spells out that it only ticks the first season rather than the whole show. */
export function addChoiceLabel(choice: AddChoice): string {
  return choice === 'WATCHED' ? 'Watched (marks season 1)' : manualStatusLabel(choice);
}
