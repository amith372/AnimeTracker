// Recommendations (Phase 6) — CLAUDE.md §7. Two independent halves feed one ranked candidate
// list: a MAL-based tally (how often each candidate shows up across every non-dropped watched
// series' own `recommendations`) and a genre-affinity score (how well a candidate's genres match
// a profile built from those same series). `liked` series count for more in both halves. The
// "Catch up" list is unrelated and purely local — no MAL calls, no ranking, just unwatched TV
// seasons inside series that are already Watched/Watched X/Y.
import { mapWithConcurrency } from '@/api/concurrency';
import { type AnimeDetailDto } from '@/api/malDataApi';
import { getAnimeDetailCached, getAnimeRecommendationsCached } from './apiCache';
import {
  buildGenreAffinity,
  getCatchUpEntries,
  isExcludedCandidate,
  isRecommendationSource,
  rankCandidates,
  tallyMalRecommendations,
  type CatchUpItem,
  type RecommendationCandidate,
  type RecommendedRef,
} from '@/domain/recommendations';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { fetchDetailsAndGroup, type DiscoverProgress } from './DiscoverRepository';
import { useMemo } from 'react';
import { getAllSeriesOnce, useLibrary } from './AnimeRepository';

export type RecommendProgress =
  | { kind: 'FETCHING_SOURCES'; completed: number; total: number }
  | { kind: 'FETCHING_CANDIDATES'; completed: number; total: number }
  | { kind: 'GROUPING'; completed: number; total: number }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'FAILED'; message: string };

// Bumped from 8 (Discover/Import's concurrency) to 12: unlike those, this screen is a one-shot
// action the user is actively staring at a spinner for — CLAUDE.md guardrail #3 asks us not to
// hammer MAL in *tight loops*, not to throttle a single user-triggered burst. A cold run (no cache)
// against a real-sized watched library was observed taking close to a minute; the two fetch stages
// below are the whole cost, so cutting each stage's wall time is the whole fix.
const SOURCE_FETCH_CONCURRENCY = 12;
const CANDIDATE_FETCH_CONCURRENCY = 12;
// Raised from 30 at the user's request — the wide-web list now wraps into a vertically scrolling
// grid rather than a horizontal row, so a longer list is genuinely browsable instead of running off
// the edge of the window. Costs nothing extra by itself: this trims an already-ranked list.
const MAX_RECOMMENDATIONS = 60;
// A watched library can easily tally 200+ unique candidates across all its series'
// recommendations — fetching detail for every one of them made this take minutes. A candidate
// that barely shows up in the tally is extremely unlikely to out-rank a popular one purely on
// genre overlap (which is bounded by how many genres the user has weight in), so it's safe to
// only fetch full detail for the top N by raw tally count before scoring/grouping. Trimmed from 60
// to 40 for the same reason as the concurrency bump above — fewer detail round-trips, same result
// quality since anything past the top 40 by raw tally was already vanishingly unlikely to rank.
//
// Raised back to 80 to feed the larger MAX_RECOMMENDATIONS below: grouping collapses sequel chains,
// so 40 candidates couldn't produce 60 distinct series no matter how they ranked. This is the one
// knob here that genuinely costs MAL requests (one detail call each, plus closure expansion), which
// is why it's the number to lower first if this ever feels slow — the shared api_cache absorbs
// repeat runs, but a cold one really does make ~80 calls.
const MAX_CANDIDATE_DETAILS = 80;

/**
 * Reactive "Catch up" list — unwatched TV seasons inside Watched/Watched X/Y series. Purely local
 * (no MAL calls), so unlike fetchRecommendations below it needs no progress reporting.
 *
 * Passes the underlying library read's loading/error state through rather than just the items:
 * derived from an empty list, "nothing to catch up on" and "the library read failed" are the same
 * value, and the screen was rendering the failure as "you're all caught up!" — the most misleading
 * possible reading of a network error.
 */
export function useCatchUp(): { items: CatchUpItem[]; isLoading: boolean; error: Error | null } {
  const { series, isLoading, error } = useLibrary();
  // Memoized on `series`, whose identity is stable between renders thanks to TanStack Query's
  // structural sharing. Without this, getCatchUpEntries built a fresh array on every render, which
  // the Recommendations screen then fed into a genre-options memo and a prune effect — a new
  // identity each pass defeated the memo and re-ran the effect constantly (see the guard in
  // recommend.tsx, which exists to stop that turning into an update loop).
  const items = useMemo(() => getCatchUpEntries(series), [series]);
  return { items, isLoading, error };
}

/** Runs the full MAL-based + genre-based recommendation pipeline and reports progress as it goes.
 * `bypassCache` backs the Recommendations screen's manual "refresh" action — it skips reading
 * (never skips writing) the shared api_cache table, so a refresh gets genuinely fresh MAL data
 * without wiping what every other user has cached (see apiCache.ts's cached() for why a full-table
 * clear would be wrong on a shared cache). */
export async function fetchRecommendations(
  onProgress: (p: RecommendProgress) => void,
  opts?: { bypassCache?: boolean },
): Promise<void> {
  const allSeries = await getAllSeriesOnce();
  const sourceSeries = allSeries.filter(isRecommendationSource);

  if (sourceSeries.length === 0) {
    onProgress({ kind: 'READY', series: [] });
    return;
  }

  onProgress({ kind: 'FETCHING_SOURCES', completed: 0, total: sourceSeries.length });
  let sourcesCompleted = 0;
  const recommendedBySeries = new Map<string, RecommendedRef[]>();
  // Best-effort here too — a series whose recommendations can't be fetched just contributes
  // nothing to the tally/profile, rather than failing every other series' contribution too.
  await mapWithConcurrency(sourceSeries, SOURCE_FETCH_CONCURRENCY, async (series) => {
    try {
      const result = await getAnimeRecommendationsCached(series.rootMalId, { bypass: opts?.bypassCache });
      recommendedBySeries.set(
        series.id,
        (result.recommendations ?? []).map((r) => ({
          id: r.node.id,
          numRecommendations: r.num_recommendations ?? 0,
        })),
      );
    } catch {
      // Dropped — see comment above.
    }
    sourcesCompleted++;
    onProgress({ kind: 'FETCHING_SOURCES', completed: sourcesCompleted, total: sourceSeries.length });
  });

  const malTally = tallyMalRecommendations(
    sourceSeries.map((s) => ({ liked: s.liked, recommended: recommendedBySeries.get(s.id) ?? [] })),
  );
  const genreAffinity = buildGenreAffinity(sourceSeries.map((s) => ({ liked: s.liked, genres: s.genres })));

  const allCandidateIds = Array.from(
    new Set(Array.from(recommendedBySeries.values()).flatMap((refs) => refs.map((r) => r.id))),
  );
  if (allCandidateIds.length === 0) {
    onProgress({ kind: 'READY', series: [] });
    return;
  }

  const trackedMalIds = new Set(allSeries.flatMap((s) => s.entries.map((e) => e.malId)));
  const droppedMalIds = new Set(
    allSeries.filter((s) => s.manualStatus === 'DROPPED').flatMap((s) => s.entries.map((e) => e.malId)),
  );

  // Cheap pre-filter (no fetch needed): drop anything already tracked or itself a dropped series,
  // then cap to the top scorers by raw tally before spending a network call on any of them.
  const candidateIds = allCandidateIds
    .filter((id) => !trackedMalIds.has(id) && !droppedMalIds.has(id))
    .sort((a, b) => (malTally.get(b) ?? 0) - (malTally.get(a) ?? 0))
    .slice(0, MAX_CANDIDATE_DETAILS);

  if (candidateIds.length === 0) {
    onProgress({ kind: 'READY', series: [] });
    return;
  }

  onProgress({ kind: 'FETCHING_CANDIDATES', completed: 0, total: candidateIds.length });
  let candidatesCompleted = 0;
  const detailById = new Map<number, AnimeDetailDto>();
  // Best-effort per candidate: one bad MAL id (a genuine, observed failure mode — one candidate
  // consistently timed out here, not just a flaky one-off) shouldn't sink every recommendation.
  // It's simply dropped from consideration, same as the closure-expansion loop in
  // fetchDetailsAndGroup already does for a related id it can't fetch.
  await mapWithConcurrency(candidateIds, CANDIDATE_FETCH_CONCURRENCY, async (id) => {
    try {
      detailById.set(id, await getAnimeDetailCached(id, { bypass: opts?.bypassCache }));
    } catch {
      // Dropped — see comment above.
    }
    candidatesCompleted++;
    onProgress({ kind: 'FETCHING_CANDIDATES', completed: candidatesCompleted, total: candidateIds.length });
  });

  const candidates: RecommendationCandidate[] = candidateIds
    .filter((id) => detailById.has(id))
    .map((id) => {
      const detail = detailById.get(id)!;
      return {
        id,
        genres: (detail.genres ?? []).map((g) => g.name),
        relatedIds: (detail.related_anime ?? []).map((r) => r.node.id),
      };
    });
  const survivors = candidates.filter((c) => !isExcludedCandidate(c, trackedMalIds, droppedMalIds));
  const ranked = rankCandidates(survivors, malTally, genreAffinity).slice(0, MAX_RECOMMENDATIONS);

  if (ranked.length === 0) {
    onProgress({ kind: 'READY', series: [] });
    return;
  }

  const scoreById = new Map(ranked.map((r) => [r.id, r.score]));
  const nodesToGroup = ranked.map((r) => ({ id: r.id, title: detailById.get(r.id)!.title }));

  let grouped: ReconcileSeries[] | null = null;
  let groupingError: string | null = null;
  await fetchDetailsAndGroup(
    nodesToGroup,
    (progress: DiscoverProgress) => {
      switch (progress.kind) {
        case 'FETCHING_DETAILS':
          onProgress({ kind: 'GROUPING', completed: progress.completed, total: progress.total });
          break;
        case 'READY':
          grouped = progress.series;
          break;
        case 'FAILED':
          groupingError = progress.message;
          break;
        case 'FETCHING_LIST':
          break;
      }
    },
    { bypassCache: opts?.bypassCache },
  );

  if (groupingError !== null) {
    onProgress({ kind: 'FAILED', message: groupingError });
    return;
  }

  // Re-apply the tracked/dropped exclusion *after* grouping, not just before it. The pre-filter
  // above can only judge the candidate ids themselves, but fetchDetailsAndGroup deliberately
  // expands each candidate outwards to its whole sequel/prequel chain — so a recommendation for
  // "Attack on Titan Season 3" gets rebuilt into the entire Attack on Titan series, whose season 1
  // the user may well already have. Without this pass those rows came back as recommendations for
  // shows already in the library, labelled with a season rather than the series. This is the same
  // rule Discover applies in useDiscoverResults; Recommendations was simply missing it.
  const recommendable = (grouped ?? []).filter((s: ReconcileSeries) =>
    s.entries.every((e) => !trackedMalIds.has(e.malId) && !droppedMalIds.has(e.malId)),
  );

  // groupIntoSeries doesn't preserve rank order (it groups by connected component), so re-sort
  // the grouped rows by the best score among their constituent MAL ids.
  const series = recommendable.sort((a, b) => bestScore(b, scoreById) - bestScore(a, scoreById));
  onProgress({ kind: 'READY', series });
}

function bestScore(series: ReconcileSeries, scoreById: Map<number, number>): number {
  return Math.max(0, ...series.entries.map((e) => scoreById.get(e.malId) ?? 0));
}
