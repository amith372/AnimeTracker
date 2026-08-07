import type { ManualStatus } from './types';

/**
 * What a single imported MAL list entry means for the app. `completed` doesn't map to a
 * ManualStatus directly — it means "pre-check this entry as watched, let status derive
 * normally" (WATCHED_FORGOT has no MAL equivalent, so it's never produced here).
 */
export type ImportedEntryStatus = { kind: 'COMPLETED' } | { kind: 'MANUAL'; status: ManualStatus };

/** Maps a MAL `list_status.status` value to what it means for a single imported entry. */
export function mapMalListStatus(malStatus: string): ImportedEntryStatus {
  switch (malStatus) {
    case 'completed':
      return { kind: 'COMPLETED' };
    case 'watching':
      return { kind: 'MANUAL', status: 'CURRENTLY_WATCHING' };
    case 'on_hold':
      return { kind: 'MANUAL', status: 'CURRENTLY_WATCHING' };
    case 'dropped':
      return { kind: 'MANUAL', status: 'DROPPED' };
    case 'plan_to_watch':
      return { kind: 'MANUAL', status: 'PLAN' };
    default:
      return { kind: 'MANUAL', status: 'PLAN' };
  }
}

/**
 * Collapses each TV-season entry's imported status into the single series-level manual status.
 * Priority: dropped > currently watching > plan (only if nothing is completed) > NONE (let
 * Watched/Watched X/Y auto-derive from the per-entry watched marks). Dropped wins outright,
 * mirroring CLAUDE.md's rule that a dropped show stays dropped even as new seasons appear.
 */
export function mergeSeriesManualStatus(perSeasonStatuses: ImportedEntryStatus[]): ManualStatus {
  if (perSeasonStatuses.length === 0) return 'NONE';

  const manualStatuses = perSeasonStatuses
    .filter((s): s is { kind: 'MANUAL'; status: ManualStatus } => s.kind === 'MANUAL')
    .map((s) => s.status);
  if (manualStatuses.includes('DROPPED')) return 'DROPPED';
  if (manualStatuses.includes('CURRENTLY_WATCHING')) return 'CURRENTLY_WATCHING';

  const hasCompleted = perSeasonStatuses.some((s) => s.kind === 'COMPLETED');
  if (manualStatuses.includes('PLAN') && !hasCompleted) return 'PLAN';

  return 'NONE';
}
