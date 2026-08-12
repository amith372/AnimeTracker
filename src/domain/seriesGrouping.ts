import type { EntryKind, SeriesType } from './types';

/**
 * Minimal shape of what `GET /anime/{id}?fields=related_anime,media_type,...` returns — just
 * enough for the grouping algorithm below. The real MAL DTO (src/api/dto.ts) gets mapped down
 * to this before grouping runs.
 */
export interface AnimeRelationInput {
  id: number;
  title: string;
  mediaType: string;
  numEpisodes?: number;
  relatedAnime?: RelatedAnimeRef[];
}

export interface RelatedAnimeRef {
  relatedId: number;
  relationType: string;
}

export interface GroupedEntry {
  malId: number;
  kind: EntryKind;
  orderIndex: number;
  title: string;
  episodeCount: number;
}

export interface GroupedSeries {
  title: string;
  rootMalId: number;
  type: SeriesType;
  entries: GroupedEntry[];
}

const SEQUEL_PREQUEL_TV = new Set(['sequel', 'prequel']);

/**
 * Groups a flat set of MAL anime entries into whole shows: TV entries connected by
 * sequel/prequel edges form one series' season chain; movies related to a TV chain (by *any*
 * relation type — side story, parent story, etc.) attach to that series; a movie with no TV
 * chain becomes its own standalone-movie entry. Chains that overlap (reachable from either
 * side, or with inconsistent/one-directional relation data) still merge into a single series
 * rather than duplicating — this is the case real MAL data hits often enough that it has its
 * own test below.
 */
export function groupIntoSeries(animeById: Map<number, AnimeRelationInput>): GroupedSeries[] {
  const tvIds = new Set(
    Array.from(animeById.values())
      .filter((a) => a.mediaType === 'tv')
      .map((a) => a.id),
  );

  // Union-find over TV ids connected by sequel/prequel edges. `parent` maps each id to its
  // current best-known root; find() also flattens the path as it walks up, so repeated lookups
  // stay cheap.
  const parent = new Map<number, number>();
  for (const id of tvIds) parent.set(id, id);

  function find(x: number): number {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const id of tvIds) {
    const anime = animeById.get(id)!;
    for (const rel of anime.relatedAnime ?? []) {
      if (SEQUEL_PREQUEL_TV.has(rel.relationType) && tvIds.has(rel.relatedId)) {
        union(id, rel.relatedId);
      }
    }
  }

  // Group ids by their component root.
  const tvComponents = new Map<number, number[]>();
  for (const id of tvIds) {
    const root = find(id);
    if (!tvComponents.has(root)) tvComponents.set(root, []);
    tvComponents.get(root)!.push(id);
  }

  // Map every TV id to its component's root key, for quick movie-attachment lookup below.
  const tvIdToComponentRoot = new Map<number, number>();
  for (const [root, members] of tvComponents) {
    for (const id of members) tvIdToComponentRoot.set(id, root);
  }

  const movieIds = Array.from(animeById.values())
    .filter((a) => a.mediaType === 'movie')
    .map((a) => a.id);
  const moviesByComponentRoot = new Map<number, number[]>();
  const standaloneMovieIds: number[] = [];

  for (const movieId of movieIds) {
    const anime = animeById.get(movieId)!;
    const attachedRoot = (anime.relatedAnime ?? [])
      .map((rel) => tvIdToComponentRoot.get(rel.relatedId))
      .find((root) => root !== undefined);
    if (attachedRoot !== undefined) {
      if (!moviesByComponentRoot.has(attachedRoot)) moviesByComponentRoot.set(attachedRoot, []);
      moviesByComponentRoot.get(attachedRoot)!.push(movieId);
    } else {
      standaloneMovieIds.push(movieId);
    }
  }

  const seriesList: GroupedSeries[] = [];

  for (const [root, members] of tvComponents) {
    const orderedSeasons = orderTvChain(members, animeById);
    const seasonEntries: GroupedEntry[] = orderedSeasons.map((id, index) => {
      const anime = animeById.get(id)!;
      return {
        malId: id,
        kind: 'TV_SEASON',
        orderIndex: index,
        title: anime.title,
        episodeCount: anime.numEpisodes ?? 0,
      };
    });
    const movieEntries: GroupedEntry[] = (moviesByComponentRoot.get(root) ?? [])
      .slice()
      .sort((a, b) => a - b)
      .map((id, offset) => {
        const anime = animeById.get(id)!;
        return {
          malId: id,
          kind: 'MOVIE',
          orderIndex: seasonEntries.length + offset,
          title: anime.title,
          episodeCount: anime.numEpisodes ?? 0,
        };
      });
    const rootMalId = orderedSeasons[0];
    seriesList.push({
      title: animeById.get(rootMalId)!.title,
      rootMalId,
      type: 'SERIES',
      entries: [...seasonEntries, ...movieEntries],
    });
  }

  for (const movieId of standaloneMovieIds) {
    const anime = animeById.get(movieId)!;
    seriesList.push({
      title: anime.title,
      rootMalId: movieId,
      type: 'STANDALONE_MOVIE',
      entries: [{ malId: movieId, kind: 'MOVIE', orderIndex: 0, title: anime.title, episodeCount: anime.numEpisodes ?? 0 }],
    });
  }

  return seriesList;
}

/**
 * Orders a TV component's ids by following "prequel" edges back to the root (season 1).
 *
 * Two defences against MAL's relation data, which is user-maintained and not always a clean line:
 *
 *  - **No root.** If every member claims a prequel (a cycle, or contradictory edges), there's no
 *    season 1 to start from. This used to be `memberIds.find(...)!` — a non-null assertion on
 *    `undefined`, which then crashed on `animeById.get(undefined)!` while building the entry list.
 *    Falling back to the lowest MAL id picks the oldest entry, which is very nearly always the
 *    real season 1.
 *  - **Branches.** If a season has two sequels, the walk follows one and would silently drop the
 *    rest of the component — seasons vanishing from the series and Y in "Watched X/Y" quietly
 *    wrong. Anything the walk didn't reach is appended in id order instead, so every member of the
 *    component is always accounted for.
 */
function orderTvChain(memberIds: number[], animeById: Map<number, AnimeRelationInput>): number[] {
  const memberSet = new Set(memberIds);
  const prequelOf = new Map<number, number>();
  for (const id of memberIds) {
    const anime = animeById.get(id)!;
    for (const rel of anime.relatedAnime ?? []) {
      if (rel.relationType === 'prequel' && memberSet.has(rel.relatedId)) {
        prequelOf.set(id, rel.relatedId);
      }
    }
  }
  const root = memberIds.find((id) => !prequelOf.has(id)) ?? [...memberIds].sort((a, b) => a - b)[0];
  const nextOf = new Map<number, number>();
  for (const id of memberIds) {
    const prequel = prequelOf.get(id);
    if (prequel !== undefined) nextOf.set(prequel, id);
  }

  const ordered = [root];
  const visited = new Set([root]);
  let current = root;
  while (nextOf.has(current)) {
    current = nextOf.get(current)!;
    if (visited.has(current)) break; // cyclic prequel/sequel data — stop rather than loop forever
    ordered.push(current);
    visited.add(current);
  }

  const unreached = memberIds.filter((id) => !visited.has(id)).sort((a, b) => a - b);
  return [...ordered, ...unreached];
}

/**
 * Keeps only the grouped series that the user actually tracks — at least one entry present in
 * `onUserList` (the set of MAL ids from their own animelist).
 *
 * The import deliberately fetches far more than the user's list: it walks *every* `related_anime`
 * edge, not just sequel/prequel, because a series' movies attach by side_story/other/parent_story
 * edges and are often not on the list themselves. The cost is that the same walk drags in
 * spin-offs, alternative versions and unrelated franchise cousins, and `groupIntoSeries` faithfully
 * turns each of those into its own one-entry series. Those have no imported MAL status at all, so
 * they derive as "Watched 0/1 seasons" — a real 40-show library ended up buried under ~180 phantom
 * rows (Mazinger/Gatchaman-era relation webs are especially bad for this).
 *
 * A series pulled in purely as relation scaffolding is dropped here; one the user tracks keeps all
 * its entries, including the related movies that were never on the list. That's the point of doing
 * this after grouping rather than narrowing the walk itself.
 */
export function retainSeriesOnUserList(
  seriesList: GroupedSeries[],
  onUserList: ReadonlySet<number>,
): GroupedSeries[] {
  return seriesList.filter((series) => series.entries.some((entry) => onUserList.has(entry.malId)));
}

/**
 * Drops any grouped series that touches `malIds` — used by the additive MAL sync to keep to whole
 * *new* series, never entries belonging to something already in the library.
 *
 * Has to run after grouping, not on the raw candidate ids: grouping expands a candidate out to its
 * entire sequel chain, so a newly-added MAL entry that happens to be season 4 arrives here as a
 * whole series whose seasons 1-3 the user already has. Checking only the seed id would let that
 * through and then trip `add_series`' unique(user_id, root_mal_id). Same after-grouping exclusion
 * rule the recommendations pipeline already needs (CLAUDE.md §7).
 */
export function rejectSeriesOverlapping(
  seriesList: GroupedSeries[],
  malIds: ReadonlySet<number>,
): GroupedSeries[] {
  return seriesList.filter((series) => !series.entries.some((entry) => malIds.has(entry.malId)));
}

/**
 * IDs referenced by a sequel/prequel edge from a known TV entry that aren't in `known` yet.
 * `groupIntoSeries` only connects entries that are already keys in the map it's given — a
 * single search/browse/import batch can easily miss a sibling season that isn't in that same
 * page of results, so callers should fetch these and merge them in (repeating until empty)
 * before grouping. This is what fixed the real bug where Re:Zero (5 seasons split across
 * several MAL ids) showed up as if it only had one season, because a single API page didn't
 * happen to include all 5 ids at once.
 */
export function missingSequelPrequelIds(known: Map<number, AnimeRelationInput>): Set<number> {
  const tvIds = Array.from(known.values())
    .filter((a) => a.mediaType === 'tv')
    .map((a) => a.id);
  const missing = new Set<number>();
  for (const id of tvIds) {
    const anime = known.get(id)!;
    for (const rel of anime.relatedAnime ?? []) {
      if (SEQUEL_PREQUEL_TV.has(rel.relationType) && !known.has(rel.relatedId)) {
        missing.add(rel.relatedId);
      }
    }
  }
  return missing;
}
