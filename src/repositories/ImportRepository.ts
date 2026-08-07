// Pulls the user's full MAL list, fetches relation data for each entry, groups it into series
// via the same groupIntoSeries() algorithm used since Phase 1, and produces the reconcile
// checklist. Nothing is written to SQLite here — that only happens once the user confirms (see
// AnimeRepository.replaceAllSeries).
//
// Kotlin's version streamed progress as a Flow<ImportProgress>; React has no framework-agnostic
// equivalent to hold onto outside a component, so this takes a plain progress callback instead —
// the reconcile screen's own useState plays the role the ViewModel's StateFlow used to.
import { mapWithConcurrency } from '@/api/concurrency';
import { getAnimeList, getAnimeListPage, type AnimeDetailDto, type AnimeListEntryDto } from '@/api/malDataApi';
import { getAnimeDetailCached } from './apiCache';
import { mapMalListStatus, mergeSeriesManualStatus } from '@/domain/importStatus';
import { mapAiringStatus, type ReconcileEntry, type ReconcileSeries } from '@/domain/reconcileSeries';
import { groupIntoSeries, missingSequelPrequelIds, type AnimeRelationInput, type GroupedSeries } from '@/domain/seriesGrouping';
import { displayTitle } from '@/domain/title';

// Matches Discover's concurrency: enough to turn a few hundred sequential round-trips into
// something that finishes while the user is still watching the progress bar, while staying well
// short of "hammering" MAL's servers (guardrail #3).
const DETAIL_FETCH_CONCURRENCY = 6;

// Safety cap on closure expansion — Attack on Titan has ~10 related entries, but pathological
// chains (crossover franchises, etc.) could loop much longer without a cap.
const MAX_CLOSURE_PASSES = 5;

export type ImportProgress =
  | { kind: 'FETCHING_LIST' }
  | { kind: 'FETCHING_DETAILS'; completed: number; total: number }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'FAILED'; message: string };

/** Fetches + groups the user's MAL list, reporting progress via `onProgress` as it goes. */
export async function runImport(onProgress: (progress: ImportProgress) => void): Promise<void> {
  onProgress({ kind: 'FETCHING_LIST' });
  let listEntries: AnimeListEntryDto[];
  try {
    listEntries = await fetchFullAnimeList();
  } catch (e) {
    onProgress({ kind: 'FAILED', message: describeError(e, 'fetching your list') });
    return;
  }

  const statusByMalId = new Map(listEntries.map((e) => [e.node.id, e.list_status.status]));

  const detailById = new Map<number, AnimeDetailDto>();
  let completed = 0;
  onProgress({ kind: 'FETCHING_DETAILS', completed: 0, total: listEntries.length });
  // Concurrent, and best-effort per entry — matching what Discover and Recommendations already do.
  // This used to be a sequential await loop that also aborted the entire import on the first
  // failure, which made onboarding both the slowest thing in the app (one round-trip per entry, so
  // a few hundred shows took minutes) and the most fragile (one flaky id and you start over). A
  // dropped entry is simply left out of the grouping below; whatever it belonged to still imports.
  await mapWithConcurrency(listEntries, DETAIL_FETCH_CONCURRENCY, async (entry) => {
    try {
      detailById.set(entry.node.id, await getAnimeDetailCached(entry.node.id));
    } catch {
      // Dropped — see comment above.
    }
    completed++;
    onProgress({ kind: 'FETCHING_DETAILS', completed, total: listEntries.length });
  });

  if (listEntries.length > 0 && detailById.size === 0) {
    onProgress({ kind: 'FAILED', message: 'Could not reach MAL for any of your list.' });
    return;
  }

  const animeById = new Map<number, AnimeRelationInput>();
  for (const [id, dto] of detailById) animeById.set(id, toAnimeRelationInput(dto));

  // Closure expansion: the user's MAL list only contains entries they've explicitly added (e.g.
  // Attack on Titan season 1), but the series has many more seasons linked via sequel/prequel
  // edges. Chase those links — just like DiscoverRepository already does — so the grouped series
  // contains every season and movie, not just the one entry the user happened to add.
  for (let pass = 0; pass < MAX_CLOSURE_PASSES; pass++) {
    const missing = Array.from(missingSequelPrequelIds(animeById));
    if (missing.length === 0) break;
    await mapWithConcurrency(missing, DETAIL_FETCH_CONCURRENCY, async (id) => {
      try {
        const detail = await getAnimeDetailCached(id);
        detailById.set(id, detail);
        animeById.set(id, toAnimeRelationInput(detail));
      } catch {
        // Best-effort: if a related id can't be fetched, it's simply left out of the chain.
      }
    });
  }

  const grouped = groupIntoSeries(animeById);
  const reconcileSeries = grouped.map((g) => toReconcileSeries(g, detailById, statusByMalId));

  onProgress({ kind: 'READY', series: reconcileSeries });
}

async function fetchFullAnimeList(): Promise<AnimeListEntryDto[]> {
  const all: AnimeListEntryDto[] = [];
  let response = await getAnimeList();
  all.push(...response.data);
  let nextUrl = response.paging.next;
  while (nextUrl) {
    response = await getAnimeListPage(nextUrl);
    all.push(...response.data);
    nextUrl = response.paging.next;
  }
  return all;
}

function describeError(e: unknown, action: string): string {
  return e instanceof Error ? `Error while ${action}: ${e.message}` : `Unknown error while ${action}.`;
}

function toAnimeRelationInput(dto: AnimeDetailDto): AnimeRelationInput {
  return {
    id: dto.id,
    // English where MAL has one — see domain/title.ts. Same treatment as Discover, so a show
    // imported from the user's list and the same show found in Discover carry identical titles.
    title: displayTitle(dto.title, dto.alternative_titles?.en),
    mediaType: dto.media_type,
    numEpisodes: dto.num_episodes,
    relatedAnime: (dto.related_anime ?? []).map((r) => ({
      relatedId: r.node.id,
      relationType: r.relation_type,
    })),
  };
}

function toReconcileSeries(
  grouped: GroupedSeries,
  detailById: Map<number, AnimeDetailDto>,
  statusByMalId: Map<number, string>,
): ReconcileSeries {
  const rootDetail = detailById.get(grouped.rootMalId)!;

  // Only TV seasons participate in the series-level status merge — movies never affect derived
  // status, same as the rest of the status-derivation model.
  const tvSeasonStatuses = grouped.entries
    .filter((e) => e.kind === 'TV_SEASON')
    .map((e) => statusByMalId.get(e.malId))
    .filter((s): s is string => s !== undefined)
    .map(mapMalListStatus);
  const manualStatus = mergeSeriesManualStatus(tvSeasonStatuses);

  const entries: ReconcileEntry[] = grouped.entries.map((entry) => {
    const rawStatus = statusByMalId.get(entry.malId);
    const imported = rawStatus !== undefined ? mapMalListStatus(rawStatus) : undefined;
    return {
      malId: entry.malId,
      kind: entry.kind,
      orderIndex: entry.orderIndex,
      title: entry.title,
      episodeCount: entry.episodeCount,
      airingStatus: mapAiringStatus(detailById.get(entry.malId)?.status),
      // MAL has no "won't watch" equivalent, so an import only ever produces these two — the user
      // adds the third state later, on the Detail screen.
      watchState: imported?.kind === 'COMPLETED' ? 'WATCHED' : 'UNWATCHED',
    };
  });

  return {
    title: grouped.title,
    coverUrl: rootDetail.main_picture?.medium ?? null,
    genres: (rootDetail.genres ?? []).map((g) => g.name),
    rootMalId: grouped.rootMalId,
    type: grouped.type,
    manualStatus,
    entries,
    rating: rootDetail.mean ?? null,
  };
}
