// Monthly sync — the RN equivalent of SyncWorker.kt + SyncRepository.kt combined. There's no
// WorkManager here; expo-background-task + expo-task-manager is the cross-platform stand-in —
// TaskManager.defineTask registers *what* the task does (must run at module load, since the OS
// can invoke it even if the app was fully closed), and BackgroundTask.registerTaskAsync tells the
// OS *when* to run it (a minimum interval, not a guaranteed schedule — see registerBackgroundSync).
//
// For every series currently derived as Watched or Watched X/Y, this walks forward from its last
// known TV season via `sequel` relation edges to find newly-aired seasons. Only TV_SEASON entries
// are ever added here — X/Y is TV-season-specific by definition, and new movies/spin-offs stay a
// Discover/manual-add concern, not an automatic sync one.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getAnimeDetail, type AnimeDetailDto } from '@/api/malDataApi';
import { isLoggedIn, refreshAccessToken } from '@/auth/authRepository';
import { mapAiringStatus } from '@/domain/reconcileSeries';
import { seasonStartEpochMillis } from '@/domain/seasonTiming';
import type { Series } from '@/domain/series';
import { displayTitle } from '@/domain/title';
import {
  addNewEntries,
  getAllSeriesOnce,
  recordSyncRun,
  setNewSeasonAvailable,
  type NewSeriesEntry,
} from './AnimeRepository';

const SYNC_TASK_NAME = 'monthly-mal-sync';
const MONTHLY_INTERVAL_MINUTES = 30 * 24 * 60;

TaskManager.defineTask(SYNC_TASK_NAME, async () => {
  try {
    await runMonthlySync();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Registers the monthly sync with the OS — idempotent, safe to call on every app launch. */
export async function registerBackgroundSync(): Promise<void> {
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK_NAME);
  if (alreadyRegistered) return;
  await BackgroundTask.registerTaskAsync(SYNC_TASK_NAME, { minimumInterval: MONTHLY_INTERVAL_MINUTES });
}

/**
 * Refreshes the access token, then checks every Watched/Watched X/Y series for new seasons.
 * Also called directly by a manual "Check for new seasons" action in the Library screen — real
 * background-task timing is OS-controlled and can't be observed/tested on demand, so a direct
 * user-triggered path is the only reliable way to verify (and use) this outside of waiting for
 * the OS to decide it's time.
 *
 * Returns how many series got at least one new season this run.
 */
export async function runMonthlySync(): Promise<number> {
  if (!(await isLoggedIn())) return 0;
  const refreshResult = await refreshAccessToken();
  if (!refreshResult.success) throw new Error(refreshResult.message);

  const eligible = (await getAllSeriesOnce()).filter(
    (s) => s.status.kind === 'WATCHED' || s.status.kind === 'WATCHED_PARTIAL',
  );

  let seriesWithNewSeasons = 0;
  for (const series of eligible) {
    if (await syncSeries(series)) seriesWithNewSeasons++;
  }
  // Stamped only on a completed pass, so a run that threw partway doesn't claim the library is
  // up to date.
  await recordSyncRun();
  return seriesWithNewSeasons;
}

async function syncSeries(series: Series): Promise<boolean> {
  const tvSeasons = series.entries.filter((e) => e.kind === 'TV_SEASON');
  if (tvSeasons.length === 0) return false;
  const knownTvIds = new Set(tvSeasons.map((e) => e.malId));
  const lastKnownSeason = tvSeasons.reduce((latest, e) => (e.orderIndex > latest.orderIndex ? e : latest));

  const discovered: AnimeDetailDto[] = [];
  let currentDetail = await fetchDetailOrNull(lastKnownSeason.malId);
  if (!currentDetail) return false;

  while (true) {
    const sequel = (currentDetail.related_anime ?? []).find((r) => r.relation_type === 'sequel');
    if (!sequel) break;
    const sequelId = sequel.node.id;
    if (knownTvIds.has(sequelId) || discovered.some((d) => d.id === sequelId)) break; // cycle guard
    const nextDetail = await fetchDetailOrNull(sequelId);
    if (!nextDetail || nextDetail.media_type !== 'tv') break;
    discovered.push(nextDetail);
    currentDetail = nextDetail;
  }

  if (discovered.length === 0) return false;

  const newEntries: NewSeriesEntry[] = discovered.map((detail, index) => ({
    malId: detail.id,
    kind: 'TV_SEASON',
    orderIndex: lastKnownSeason.orderIndex + 1 + index,
    title: displayTitle(detail.title, detail.alternative_titles?.en),
    episodeCount: detail.num_episodes ?? 0,
    airingStatus: mapAiringStatus(detail.status),
  }));

  const newestSeason = discovered[discovered.length - 1].start_season;
  const airedAtEpochMillis = newestSeason ? seasonStartEpochMillis(newestSeason.year, newestSeason.season) : null;

  await addNewEntries(series.id, newEntries);
  await setNewSeasonAvailable(series.id, airedAtEpochMillis);
  return true;
}

/**
 * Deliberately calls the raw `getAnimeDetail`, NOT the cached `getAnimeDetailCached` that Discover,
 * Import and Recommendations use. Detecting a new season *is* a request for fresh `related_anime`
 * data, so serving it from a 30-day cache would silently defeat the entire point of the monthly
 * sync — it would keep "discovering" the same stale chain it saw last month. This is the one place
 * in the app where a cache hit would be a bug, not an optimization.
 */
async function fetchDetailOrNull(id: number): Promise<AnimeDetailDto | null> {
  try {
    return await getAnimeDetail(id);
  } catch {
    return null;
  }
}
