import type { Series } from './series';

/** Domain-level target status — mapped to MAL's exact wire strings by the repository layer, so
 * this module stays ignorant of MAL's API shape (same domain/API separation used everywhere
 * else in this app). */
export type PushStatus = 'PLAN_TO_WATCH' | 'WATCHING' | 'COMPLETED';

export interface PushTarget {
  malId: number;
  status: PushStatus;
}

/**
 * Decides which MAL entries a "push to MyAnimeList" run should touch and what to set them to —
 * CLAUDE.md §8's rules, pulled out as a pure function since this is the part most likely to have
 * a bug, and a bug here edits a real external account rather than just local data.
 *
 * `WATCHED`/`WATCHED_PARTIAL` are handled per entry, not per series: only entries locally marked
 * `WATCHED` become `COMPLETED` on MAL. An `UNWATCHED` entry inside an otherwise-"Watched 3/5"
 * series must never be pushed as completed just because the series overall reads as watched.
 *
 * `DROPPED` and `WATCHED_FORGOT` are deliberately excluded — see CLAUDE.md §8 for why.
 */
export function buildPushTargets(series: Series): PushTarget[] {
  switch (series.status.kind) {
    case 'PLAN':
      return series.entries.map((e) => ({ malId: e.malId, status: 'PLAN_TO_WATCH' as const }));
    case 'CURRENTLY_WATCHING':
      return series.entries.map((e) => ({ malId: e.malId, status: 'WATCHING' as const }));
    case 'WATCHED':
    case 'WATCHED_PARTIAL':
      return series.entries
        .filter((e) => e.watchState === 'WATCHED')
        .map((e) => ({ malId: e.malId, status: 'COMPLETED' as const }));
    default:
      return [];
  }
}
