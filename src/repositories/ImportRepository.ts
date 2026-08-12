// Pulls the user's full MAL list, groups it into series via the same groupIntoSeries() algorithm
// used since Phase 1, and produces the reconcile checklist. Nothing is written to SQLite here —
// that only happens once the user confirms (see AnimeRepository.replaceAllSeries).
//
// Phase 8 moved the list fetch and the per-anime detail fetches server-side (they need the user's
// MAL token, and the Client ID, neither of which the client holds) — see supabase/functions/
// mal-import. groupIntoSeries and the DTO-to-ReconcileSeries mapping stay here, deliberately:
// that's real domain logic (src/domain/seriesGrouping.ts), not something to duplicate into Deno
// (see the plan doc's §4).
//
// That briefly made the whole import one opaque server call, which meant no "fetching details,
// N of M" progress — the reconcile screen just sat on "Fetching your MyAnimeList..." for the entire
// run. This file now drives the fetching itself again, in batches, purely so it can count them:
// ask for the list, then walk the relation closure asking for details a batch at a time, emitting
// FETCHING_DETAILS after each. The Edge Function answers "give me these DTOs" and nothing more, so
// the closure bookkeeping (which ids are still missing) lives here rather than there.
import { callMalImportDetails, callMalImportList } from '@/api/edgeFunctions';
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

// How many ids each mal-import 'details' call asks for. Small enough that the progress bar moves
// visibly and often, large enough that per-request overhead stays a rounding error next to the MAL
// calls themselves.
const DETAIL_BATCH_SIZE = 25;

// Bounds the relation-closure walk, same guard the Edge Function used to hold: related_anime chains
// can be long, and a cycle or a very deep franchise shouldn't turn one import into hundreds of
// rounds. 5 passes has always been enough for real libraries.
const MAX_CLOSURE_PASSES = 5;

/** Fetches + groups the user's MAL list, reporting progress via `onProgress` as it goes. */
export async function runImport(onProgress: (progress: ImportProgress) => void): Promise<void> {
  onProgress({ kind: 'FETCHING_LIST' });

  let entries: AnimeListEntryDto[];
  try {
    const result = await callMalImportList();
    entries = result.entries as AnimeListEntryDto[];
  } catch (e) {
    onProgress({ kind: 'FAILED', message: describeError(e, 'fetching your list') });
    return;
  }

  const detailById = new Map<number, AnimeDetailDto>();
  // Ids MAL wouldn't return (404s on stale relation edges are common) — remembered so the closure
  // passes below don't re-request the same dead id every single pass.
  const unavailable = new Set<number>();
  let lastError: unknown = null;

  // `total` grows as each pass discovers more related ids, so the bar can move backwards slightly
  // when a new pass starts. That's honest — the real total genuinely isn't known until the closure
  // settles — and preferable to a bar that sits at 100% while work continues.
  let completed = 0;
  let total = entries.length;
  let queue = entries.map((entry) => entry.node.id);

  onProgress({ kind: 'FETCHING_DETAILS', completed, total });

  for (let pass = 0; pass <= MAX_CLOSURE_PASSES; pass++) {
    const wanted = queue.filter((id) => !detailById.has(id) && !unavailable.has(id));
    if (wanted.length === 0) break;

    for (let i = 0; i < wanted.length; i += DETAIL_BATCH_SIZE) {
      const batch = wanted.slice(i, i + DETAIL_BATCH_SIZE);
      try {
        const { details } = await callMalImportDetails(batch);
        for (const [id, dto] of Object.entries(details)) detailById.set(Number(id), dto as AnimeDetailDto);
      } catch (e) {
        // One failed batch shouldn't abandon a long import — record it and carry on, same
        // best-effort stance the per-id fetches take. If *everything* fails, the guard below turns
        // that into a single clear error using this message.
        lastError = e;
      }
      // Anything still missing after its batch returned is one MAL wouldn't serve.
      for (const id of batch) if (!detailById.has(id)) unavailable.add(id);

      completed += batch.length;
      onProgress({ kind: 'FETCHING_DETAILS', completed, total });
    }

    // Next pass: every related id we've seen referenced but haven't resolved yet.
    const missing = new Set<number>();
    for (const detail of detailById.values()) {
      for (const related of detail.related_anime ?? []) {
        if (!detailById.has(related.node.id) && !unavailable.has(related.node.id)) missing.add(related.node.id);
      }
    }
    queue = Array.from(missing);
    total += queue.length;
  }

  if (entries.length > 0 && detailById.size === 0) {
    onProgress({
      kind: 'FAILED',
      message: lastError
        ? describeError(lastError, 'fetching your list')
        : 'Could not reach MAL for any of your list.',
    });
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
