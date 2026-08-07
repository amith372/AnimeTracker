// Pulls the user's full MAL list, groups it into series via the same groupIntoSeries() algorithm
// used since Phase 1, and produces the reconcile checklist. Nothing is written to SQLite here —
// that only happens once the user confirms (see AnimeRepository.replaceAllSeries).
//
// Phase 8: the list fetch + related-anime detail-closure expansion (the slow, many-round-trip part
// this used to do client-side with mapWithConcurrency) now happens inside the mal-import Edge
// Function in one call — see supabase/functions/mal-import. groupIntoSeries and the
// DTO-to-ReconcileSeries mapping stay here, deliberately: that's real domain logic
// (src/domain/seriesGrouping.ts), not something to duplicate into Deno (see the plan doc's §4).
// One consequence: there's no more granular "fetching details, N of M" progress phase, since it's
// a single opaque server call now — this only ever emits FETCHING_LIST while awaiting it, then
// READY/FAILED. ImportProgress keeps its FETCHING_DETAILS case so app/onboarding/reconcile.tsx
// doesn't need to change; it just never fires anymore.
import { callMalImport } from '@/api/edgeFunctions';
import type { AnimeDetailDto } from '@/api/malDataApi';
import { mapMalListStatus, mergeSeriesManualStatus } from '@/domain/importStatus';
import { mapAiringStatus, type ReconcileEntry, type ReconcileSeries } from '@/domain/reconcileSeries';
import { groupIntoSeries, type AnimeRelationInput, type GroupedSeries } from '@/domain/seriesGrouping';
import { displayTitle } from '@/domain/title';

interface AnimeNodeDto {
  id: number;
  title: string;
}
interface AnimeListEntryDto {
  node: AnimeNodeDto;
  list_status: { status: string };
}

export type ImportProgress =
  | { kind: 'FETCHING_LIST' }
  | { kind: 'FETCHING_DETAILS'; completed: number; total: number }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'FAILED'; message: string };

/** Fetches + groups the user's MAL list, reporting progress via `onProgress` as it goes. */
export async function runImport(onProgress: (progress: ImportProgress) => void): Promise<void> {
  onProgress({ kind: 'FETCHING_LIST' });

  let entries: AnimeListEntryDto[];
  let detailById: Map<number, AnimeDetailDto>;
  try {
    const result = await callMalImport();
    entries = result.entries as AnimeListEntryDto[];
    detailById = new Map(Object.entries(result.details).map(([id, dto]) => [Number(id), dto as AnimeDetailDto]));
  } catch (e) {
    onProgress({ kind: 'FAILED', message: describeError(e, 'fetching your list') });
    return;
  }

  if (entries.length > 0 && detailById.size === 0) {
    onProgress({ kind: 'FAILED', message: 'Could not reach MAL for any of your list.' });
    return;
  }

  const statusByMalId = new Map(entries.map((e) => [e.node.id, e.list_status.status]));
  const animeById = new Map<number, AnimeRelationInput>();
  for (const [id, dto] of detailById) animeById.set(id, toAnimeRelationInput(dto));

  const grouped = groupIntoSeries(animeById);
  const reconcileSeries = grouped.map((g) => toReconcileSeries(g, detailById, statusByMalId));

  onProgress({ kind: 'READY', series: reconcileSeries });
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
