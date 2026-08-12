// Search/browse results grouped into whole prospective series — the RN equivalent of the old
// DiscoverRepository.kt. Reuses the same groupIntoSeries() algorithm as import (Phase 3), so a
// show with multiple seasons in one response shows up as ONE row, not one per season.
//
// MAL's list endpoints (`/anime`, `/anime/ranking`, `/anime/season/{year}/{season}`) don't return
// `related_anime` even when requested — only `/anime/{id}` does. So grouping browse results needs
// the same two-phase fetch as import: list first, then one detail call per result. Unlike import
// (which sees the user's *entire* list at once), a browse/search page is a small, arbitrary slice
// of MAL's catalog — it can easily include season 2 of a show but not season 1. Left alone,
// groupIntoSeries would only connect ids it was actually given, silently splitting one show into
// multiple rows. missingSequelPrequelIds() (ported in Phase 1 for exactly this) closes that gap by
// fetching whatever sibling seasons are missing before grouping runs.
import { useEffect, useState } from 'react';
import { mapWithConcurrency } from '@/api/concurrency';
import {
  BROWSE_PAGE_SIZE,
  getRanking,
  getSeasonal,
  searchAnime,
  type AnimeBrowseNodeDto,
  type AnimeDetailDto,
} from '@/api/malDataApi';
import { getAnimeDetailCached } from './apiCache';
import { addSeries as addSeriesToLibrary, useTrackedMalIds } from './AnimeRepository';
import { applyAddChoice } from '@/domain/addChoice';
import type { AddChoice } from '@/domain/statusLabel';
import { mapAiringStatus, type ReconcileEntry, type ReconcileSeries } from '@/domain/reconcileSeries';
import { groupIntoSeries, missingSequelPrequelIds, type AnimeRelationInput, type GroupedSeries } from '@/domain/seriesGrouping';
import { displayTitle } from '@/domain/title';

export type DiscoverProgress =
  | { kind: 'FETCHING_LIST' }
  | { kind: 'FETCHING_DETAILS'; completed: number; total: number }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'FAILED'; message: string };

const MAX_CLOSURE_PASSES = 5;
// Detail fetches were the whole slowdown here: 25 results awaited one at a time took ~15s (25
// sequential round-trips). Running a handful concurrently instead cuts that to roughly
// total-time / concurrency, while staying well short of "hammering" MAL's servers.
const DETAIL_FETCH_CONCURRENCY = 6;

/**
 * One page of raw browse/search results. The three MAL list endpoints differ only in URL and
 * params — everything after this point (detail fetch, closure expansion, grouping, filtering) is
 * identical — so they're dispatched here rather than in three near-identical exported functions.
 */
function fetchBrowseNodes(query: DiscoverQuery, offset: number): Promise<AnimeBrowseNodeDto[]> {
  switch (query.kind) {
    case 'RANKING':
      return getRanking(query.rankingType, offset).then((r) => r.data.map((e) => e.node));
    case 'SEASON':
      return getSeasonal(query.year, query.season, offset).then((r) => r.data.map((e) => e.node));
    case 'SEARCH':
      return searchAnime(query.query, offset).then((r) => r.data.map((e) => e.node));
  }
}

/** Human-readable name for what we were doing, so a failure message says which part broke. */
function describeQuery(query: DiscoverQuery): string {
  switch (query.kind) {
    case 'RANKING':
      return 'fetching rankings';
    case 'SEASON':
      return 'fetching this season';
    case 'SEARCH':
      return 'searching';
  }
}

/** Result of one page: the grouped rows, plus whether MAL likely has more after this one. */
interface DiscoverPage {
  series: ReconcileSeries[];
  hasMore: boolean;
}

/**
 * Runs one page of a Discover query end to end. `nodeLimit` trims the list *before* the expensive
 * per-anime detail phase — see limitNodes.
 */
async function runDiscoverQuery(
  query: DiscoverQuery,
  onProgress: (p: DiscoverProgress) => void,
  options: { offset?: number; nodeLimit?: number } = {},
): Promise<DiscoverPage | null> {
  const { offset = 0, nodeLimit } = options;
  onProgress({ kind: 'FETCHING_LIST' });
  let nodes: AnimeBrowseNodeDto[];
  try {
    nodes = await fetchBrowseNodes(query, offset);
  } catch (e) {
    onProgress({ kind: 'FAILED', message: describeError(e, describeQuery(query)) });
    return null;
  }
  // A full page means there's probably another one; a short page is the end of the results.
  const hasMore = nodes.length === BROWSE_PAGE_SIZE;
  if (nodes.length === 0) {
    onProgress({ kind: 'READY', series: [] });
    return { series: [], hasMore: false };
  }

  let series: ReconcileSeries[] = [];
  await fetchDetailsAndGroup(limitNodes(nodes, nodeLimit), (progress) => {
    if (progress.kind === 'READY') series = progress.series;
    onProgress(progress);
  });
  return { series, hasMore };
}

/**
 * Trims a browse response before the expensive part. The list call returns 25 results but the
 * Discover home screen only renders the first handful of each row, and every result costs a
 * separate `/anime/{id}` detail call (plus closure expansion) — so without this, opening Discover
 * spent roughly 75 per-anime requests to display about 30 tiles. Guardrail #3 asks us to stay
 * light on MAL's servers, and the cheapest request is the one never made. The "View All" screen
 * passes no limit, since there the whole list really is shown.
 */
function limitNodes(nodes: AnimeBrowseNodeDto[], nodeLimit?: number): AnimeBrowseNodeDto[] {
  return nodeLimit === undefined ? nodes : nodes.slice(0, nodeLimit);
}

/** Adds one Discover/Recommendations result to the library with the status the user picked, as a
 * whole grouped series. `applyAddChoice` is what handles the "Watched" pick, which marks season 1
 * rather than setting a manual status — see src/domain/addChoice.ts. Returns the new series id. */
export async function addDiscoveredSeries(series: ReconcileSeries, choice: AddChoice): Promise<string> {
  return addSeriesToLibrary(applyAddChoice(series, choice));
}

/** A minimal MAL node reference — just enough to fetch + group into a whole series. */
export interface AnimeIdRef {
  id: number;
  title: string;
}

/**
 * Fetches detail + groups a list of candidate anime ids into whole series — exported so
 * Recommendations (Phase 6) can reuse the exact same detail-fetch/closure-expansion/grouping
 * pipeline for its own candidate ids, instead of reimplementing it.
 */
export async function fetchDetailsAndGroup(
  nodes: AnimeIdRef[],
  onProgress: (p: DiscoverProgress) => void,
  opts?: { bypassCache?: boolean },
): Promise<void> {
  const detailById = new Map<number, AnimeDetailDto>();
  let completed = 0;
  onProgress({ kind: 'FETCHING_DETAILS', completed: 0, total: nodes.length });

  // Best-effort per node — a single hung/broken MAL id (observed happening for real, not just
  // hypothetically) would otherwise abort the whole batch. It's simply left out of the grouping
  // below, same as the closure-expansion loop already treats a related id it can't fetch.
  await mapWithConcurrency(nodes, DETAIL_FETCH_CONCURRENCY, async (node) => {
    try {
      detailById.set(node.id, await getAnimeDetailCached(node.id, { bypass: opts?.bypassCache }));
    } catch {
      // Dropped — see comment above.
    }
    completed++;
    onProgress({ kind: 'FETCHING_DETAILS', completed, total: nodes.length });
  });

  if (detailById.size === 0) {
    onProgress({ kind: 'FAILED', message: 'Could not reach MAL for any of these results.' });
    return;
  }

  const animeById = new Map<number, AnimeRelationInput>();
  for (const [id, dto] of detailById) animeById.set(id, toAnimeRelationInput(dto));

  // Closure expansion: pull in any sequel/prequel siblings this batch didn't happen to include,
  // repeating until nothing's left missing (or we hit a safety cap on a pathological chain).
  for (let pass = 0; pass < MAX_CLOSURE_PASSES; pass++) {
    const missing = Array.from(missingSequelPrequelIds(animeById));
    if (missing.length === 0) break;
    await Promise.all(
      missing.map(async (id) => {
        try {
          const detail = await getAnimeDetailCached(id);
          detailById.set(id, detail);
          animeById.set(id, toAnimeRelationInput(detail));
        } catch {
          // Best-effort: if a related id can't be fetched, it's simply left out of the chain.
        }
      }),
    );
  }

  const grouped = groupIntoSeries(animeById);
  const series = grouped.map((g) => toReconcileSeries(g, detailById));
  onProgress({ kind: 'READY', series });
}

function describeError(e: unknown, action: string): string {
  return e instanceof Error ? `Error while ${action}: ${e.message}` : `Unknown error while ${action}.`;
}

function toAnimeRelationInput(dto: AnimeDetailDto): AnimeRelationInput {
  return {
    id: dto.id,
    // English where MAL has one — see domain/title.ts. Applied at the mapping boundary so every
    // downstream consumer (grouped series title, per-entry season titles) gets it for free.
    title: displayTitle(dto.title, dto.alternative_titles?.en),
    mediaType: dto.media_type,
    numEpisodes: dto.num_episodes,
    relatedAnime: (dto.related_anime ?? []).map((r) => ({
      relatedId: r.node.id,
      relationType: r.relation_type,
    })),
  };
}

function toReconcileSeries(grouped: GroupedSeries, detailById: Map<number, AnimeDetailDto>): ReconcileSeries {
  const rootDetail = detailById.get(grouped.rootMalId)!;
  const entries: ReconcileEntry[] = grouped.entries.map((entry) => ({
    malId: entry.malId,
    kind: entry.kind,
    orderIndex: entry.orderIndex,
    title: entry.title,
    episodeCount: entry.episodeCount,
    airingStatus: mapAiringStatus(detailById.get(entry.malId)?.status),
    watchState: 'UNWATCHED',
  }));

  const startSeason = rootDetail.start_season;
  const seasonLabel = startSeason
    ? `${startSeason.season.charAt(0).toUpperCase()}${startSeason.season.slice(1)} ${startSeason.year}`
    : null;

  return {
    title: grouped.title,
    coverUrl: rootDetail.main_picture?.medium ?? null,
    genres: (rootDetail.genres ?? []).map((g) => g.name),
    rootMalId: grouped.rootMalId,
    type: grouped.type,
    manualStatus: 'NONE', // placeholder; overwritten with the user's pick on Add
    entries,
    seasonLabel,
    rating: rootDetail.mean ?? null,
  };
}

/** What to load — lets one hook back both the sectioned home screen and the "View All" grid. */
export type DiscoverQuery =
  | { kind: 'RANKING'; rankingType: string }
  | { kind: 'SEASON'; year: number; season: string }
  | { kind: 'SEARCH'; query: string };

export type DiscoverState =
  | { kind: 'LOADING'; message: string }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'ERROR'; message: string };

/**
 * Runs a Discover query, tracks its progress, and filters out anything already in the library —
 * shared between the sectioned home screen (one call per section) and the "View All" grid.
 * `query: null` means idle (e.g. the search box is empty). Returns a `retry()` alongside the
 * state so error screens (e.g. a MAL 504) can re-run the same query without the caller needing to
 * change anything about `query` itself.
 */
export function useDiscoverResults(
  query: DiscoverQuery | null,
  nodeLimit?: number,
): [DiscoverState, () => void] {
  const [state, setState] = useState<DiscoverState>({ kind: 'READY', series: [] });
  const [retryNonce, setRetryNonce] = useState(0);
  const tracked = useTrackedMalIds();
  const queryKey = query ? `${retryNonce}:${nodeLimit ?? 'all'}:${JSON.stringify(query)}` : null;
  const retry = () => setRetryNonce((n) => n + 1);

  useEffect(() => {
    if (!query) {
      setState({ kind: 'READY', series: [] });
      return;
    }
    let cancelled = false;
    setState({ kind: 'LOADING', message: 'Loading...' });

    const onProgress = (progress: DiscoverProgress) => {
      if (cancelled) return;
      switch (progress.kind) {
        case 'FETCHING_LIST':
          setState({ kind: 'LOADING', message: 'Fetching results...' });
          break;
        case 'FETCHING_DETAILS':
          setState({ kind: 'LOADING', message: `Fetching details (${progress.completed}/${progress.total})...` });
          break;
        case 'READY':
          setState({ kind: 'READY', series: progress.series });
          break;
        case 'FAILED':
          setState({ kind: 'ERROR', message: progress.message });
          break;
      }
    };

    runDiscoverQuery(query, onProgress, { nodeLimit });

    return () => {
      cancelled = true;
    };
    // queryKey is a stable, deep-equality-safe stand-in for `query` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  if (state.kind !== 'READY') return [state, retry];
  return [{ kind: 'READY', series: state.series.filter((s) => isNotTracked(s, tracked)) }, retry];
}

/** A prospective series is only worth showing if none of its entries is already in the library. */
function isNotTracked(series: ReconcileSeries, tracked: Set<number>): boolean {
  return series.entries.every((e) => !tracked.has(e.malId));
}

export interface PaginatedDiscover {
  state: DiscoverState;
  retry: () => void;
  loadMore: () => void;
  loadingMore: boolean;
  hasMore: boolean;
}

/**
 * The "View All" grid's data source: the same query as a preview row, but walked page by page.
 *
 * CLAUDE.md §4 always described this screen as paginated; it wasn't — it rendered a single
 * `limit=25` response and never followed the offset, so a category was permanently capped at 25
 * results minus whatever the user already tracked. Pages accumulate rather than replace, and are
 * deduped by `rootMalId` because grouping can legitimately produce the same series from two
 * different pages (page 1 has season 3, page 2 has season 1, both group to one show).
 */
export function usePaginatedDiscover(query: DiscoverQuery | null): PaginatedDiscover {
  const [pages, setPages] = useState<ReconcileSeries[]>([]);
  const [state, setState] = useState<DiscoverState>({ kind: 'READY', series: [] });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const tracked = useTrackedMalIds();
  const queryKey = query ? `${retryNonce}:${JSON.stringify(query)}` : null;
  const retry = () => setRetryNonce((n) => n + 1);

  // `loading` guards against a scroll that fires loadMore again while a page is still in flight,
  // which would fetch the same offset twice and double every row on the screen.
  const loading = state.kind === 'LOADING' || loadingMore;

  const loadMore = () => {
    if (!query || loading || !hasMore) return;
    setLoadingMore(true);
    runDiscoverQuery(query, () => {}, { offset })
      .then((page) => {
        if (!page) return;
        setPages((current) => dedupeByRoot([...current, ...page.series]));
        setOffset((current) => current + BROWSE_PAGE_SIZE);
        setHasMore(page.hasMore);
      })
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    if (!query) {
      setPages([]);
      setState({ kind: 'READY', series: [] });
      setHasMore(false);
      return;
    }
    let cancelled = false;
    setPages([]);
    setOffset(0);
    setHasMore(false);
    setState({ kind: 'LOADING', message: 'Loading...' });

    runDiscoverQuery(
      query,
      (progress) => {
        if (cancelled) return;
        switch (progress.kind) {
          case 'FETCHING_LIST':
            setState({ kind: 'LOADING', message: 'Fetching results...' });
            break;
          case 'FETCHING_DETAILS':
            setState({ kind: 'LOADING', message: `Fetching details (${progress.completed}/${progress.total})...` });
            break;
          case 'READY':
            setState({ kind: 'READY', series: [] });
            break;
          case 'FAILED':
            setState({ kind: 'ERROR', message: progress.message });
            break;
        }
      },
      { offset: 0 },
    ).then((page) => {
      if (cancelled || !page) return;
      setPages(dedupeByRoot(page.series));
      setOffset(BROWSE_PAGE_SIZE);
      setHasMore(page.hasMore);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  if (state.kind === 'ERROR' || (state.kind === 'LOADING' && pages.length === 0)) {
    return { state, retry, loadMore, loadingMore, hasMore };
  }
  return {
    state: { kind: 'READY', series: pages.filter((s) => isNotTracked(s, tracked)) },
    retry,
    loadMore,
    loadingMore,
    hasMore,
  };
}

/** Grouping can yield the same series from two different pages — keep the first occurrence. */
function dedupeByRoot(list: ReconcileSeries[]): ReconcileSeries[] {
  const seen = new Set<number>();
  return list.filter((s) => (seen.has(s.rootMalId) ? false : (seen.add(s.rootMalId), true)));
}
