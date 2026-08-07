// Pushes local Plan to watch / Watched / Currently watching statuses to the signed-in user's own
// MAL list — CLAUDE.md §8, the app's one and only write path. Everything else in this app reads
// from MAL and writes only to SQLite; this is a separate, explicit, user-confirmed action, never
// run automatically (no background task, no auto-trigger on status change).
//
// Phase 8: the actual per-entry PUTs now happen inside the mal-push Edge Function (one call
// carrying every target, rather than this device firing N concurrent PUTs directly at MAL) — see
// supabase/functions/mal-push. buildPushTargets (which entries get pushed, and as what) stays
// client-side domain logic, unchanged.
import { callMalPush } from '@/api/edgeFunctions';
import { buildPushTargets, type PushStatus } from '@/domain/malPush';
import { getAllSeriesOnce } from './AnimeRepository';

const STATUS_TO_MAL: Record<PushStatus, 'plan_to_watch' | 'watching' | 'completed'> = {
  PLAN_TO_WATCH: 'plan_to_watch',
  WATCHING: 'watching',
  COMPLETED: 'completed',
};

export type PushProgress =
  | { kind: 'PUSHING'; completed: number; total: number }
  | { kind: 'DONE'; updated: number; failed: number };

/**
 * Runs the push across the whole library. Reports one 'PUSHING' progress tick before the (single)
 * network call, since the server does the per-entry batching now and there's no client-visible
 * incremental progress to report anymore.
 */
export async function pushStatusesToMal(onProgress: (p: PushProgress) => void): Promise<void> {
  const allSeries = await getAllSeriesOnce();
  const targets = allSeries.flatMap(buildPushTargets);

  if (targets.length === 0) {
    onProgress({ kind: 'DONE', updated: 0, failed: 0 });
    return;
  }

  onProgress({ kind: 'PUSHING', completed: 0, total: targets.length });
  const { updated, failed } = await callMalPush(
    targets.map((t) => ({ malId: t.malId, status: STATUS_TO_MAL[t.status] })),
  );
  onProgress({ kind: 'DONE', updated, failed });
}
