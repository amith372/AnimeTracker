// Pushes local Plan to watch / Watched / Currently watching statuses to the signed-in user's own
// MAL list — CLAUDE.md §8, the app's one and only write path. Everything else in this app reads
// from MAL and writes only to SQLite; this is a separate, explicit, user-confirmed action, never
// run automatically (no background task, no auto-trigger on status change).
import { mapWithConcurrency } from '@/api/concurrency';
import { updateMyListStatus, type MalListStatusValue } from '@/api/malDataApi';
import { buildPushTargets, type PushStatus } from '@/domain/malPush';
import { getAllSeriesOnce } from './AnimeRepository';

// Same order-of-magnitude as Import/Discover/Recommendations' concurrency — a user-triggered,
// one-shot batch, not a tight loop, so this stays within CLAUDE.md guardrail #3.
const PUSH_CONCURRENCY = 6;

const STATUS_TO_MAL: Record<PushStatus, MalListStatusValue> = {
  PLAN_TO_WATCH: 'plan_to_watch',
  WATCHING: 'watching',
  COMPLETED: 'completed',
};

export type PushProgress =
  | { kind: 'PUSHING'; completed: number; total: number }
  | { kind: 'DONE'; updated: number; failed: number };

/**
 * Runs the push across the whole library, reporting progress as it goes. Best-effort per entry —
 * one failed PUT (a since-deleted anime, a transient MAL error) doesn't abort the batch, same
 * pattern as every other multi-request flow in this app.
 */
export async function pushStatusesToMal(onProgress: (p: PushProgress) => void): Promise<void> {
  const allSeries = await getAllSeriesOnce();
  const targets = allSeries.flatMap(buildPushTargets);

  if (targets.length === 0) {
    onProgress({ kind: 'DONE', updated: 0, failed: 0 });
    return;
  }

  let completed = 0;
  let failed = 0;
  onProgress({ kind: 'PUSHING', completed: 0, total: targets.length });
  await mapWithConcurrency(targets, PUSH_CONCURRENCY, async (target) => {
    try {
      await updateMyListStatus(target.malId, STATUS_TO_MAL[target.status]);
    } catch {
      failed++;
    }
    completed++;
    onProgress({ kind: 'PUSHING', completed, total: targets.length });
  });

  onProgress({ kind: 'DONE', updated: targets.length - failed, failed });
}
