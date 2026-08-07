import type { AiringStatus, EntryKind, ManualStatus, SeriesType, WatchState } from './types';

/** One row on the reconcile checklist — a season/movie the user can tick before confirming import. */
export interface ReconcileEntry {
  malId: number;
  kind: EntryKind;
  orderIndex: number;
  title: string;
  episodeCount: number;
  airingStatus: AiringStatus;
  /** Reconcile only ever produces UNWATCHED or WATCHED — "won't watch" is a decision made later,
   * on the Detail screen, not something MAL's list has any equivalent of. */
  watchState: WatchState;
}

/** One grouped show on the reconcile checklist, before it's written to SQLite. */
export interface ReconcileSeries {
  title: string;
  coverUrl: string | null;
  genres: string[];
  rootMalId: number;
  type: SeriesType;
  manualStatus: ManualStatus;
  entries: ReconcileEntry[];
  /** Only populated for Discover results (e.g. "Fall 2024") — import/reconcile leaves this null. */
  seasonLabel?: string | null;
  /** MAL's own rating (0..10) for the root entry, shown on Recommendations cards. Null when MAL
   * hasn't published one (too few scores) rather than 0, so callers don't render a "0.0". */
  rating?: number | null;
}

export function mapAiringStatus(malStatus: string | null | undefined): AiringStatus {
  switch (malStatus) {
    case 'currently_airing':
      return 'AIRING';
    case 'not_yet_aired':
      return 'NOT_YET_AIRED';
    default:
      return 'FINISHED';
  }
}
