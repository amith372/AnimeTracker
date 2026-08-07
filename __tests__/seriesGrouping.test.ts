import { groupIntoSeries, missingSequelPrequelIds, type AnimeRelationInput, type RelatedAnimeRef } from '@/domain/seriesGrouping';

// Same fixture-building helpers as the original Kotlin SeriesGroupingTest — a `tv()`/`movie()`
// pair keeps each test case readable as just "here's the relation graph, here's what should
// come out."
function tv(id: number, title: string, related: RelatedAnimeRef[] = []): AnimeRelationInput {
  return { id, title, mediaType: 'tv', numEpisodes: 12, relatedAnime: related };
}
function movie(id: number, title: string, related: RelatedAnimeRef[] = []): AnimeRelationInput {
  return { id, title, mediaType: 'movie', numEpisodes: 1, relatedAnime: related };
}
function byId(...items: AnimeRelationInput[]): Map<number, AnimeRelationInput> {
  return new Map(items.map((i) => [i.id, i]));
}

test('straightforward TV sequel chain groups into one series in order', () => {
  const season1 = tv(1, 'Show S1', [{ relatedId: 2, relationType: 'sequel' }]);
  const season2 = tv(2, 'Show S2', [
    { relatedId: 1, relationType: 'prequel' },
    { relatedId: 3, relationType: 'sequel' },
  ]);
  const season3 = tv(3, 'Show S3', [{ relatedId: 2, relationType: 'prequel' }]);

  const result = groupIntoSeries(byId(season1, season2, season3));

  expect(result).toHaveLength(1);
  const series = result[0];
  expect(series.type).toBe('SERIES');
  expect(series.rootMalId).toBe(1);
  expect(series.entries.map((e) => e.malId)).toEqual([1, 2, 3]);
  expect(series.entries.map((e) => e.orderIndex)).toEqual([0, 1, 2]);
  expect(series.entries.map((e) => e.kind)).toEqual(['TV_SEASON', 'TV_SEASON', 'TV_SEASON']);
});

test('movie attaches to its parent TV series', () => {
  const season1 = tv(1, 'Show S1', [{ relatedId: 10, relationType: 'side_story' }]);
  const film = movie(10, 'Show The Movie', [{ relatedId: 1, relationType: 'parent_story' }]);

  const result = groupIntoSeries(byId(season1, film));

  expect(result).toHaveLength(1);
  const series = result[0];
  expect(series.type).toBe('SERIES');
  expect(series.entries).toHaveLength(2);
  const movieEntry = series.entries.find((e) => e.kind === 'MOVIE')!;
  expect(movieEntry.malId).toBe(10);
});

test('standalone movie with no TV relations becomes its own series', () => {
  const film = movie(50, 'Lone Movie');

  const result = groupIntoSeries(byId(film));

  expect(result).toHaveLength(1);
  const series = result[0];
  expect(series.type).toBe('STANDALONE_MOVIE');
  expect(series.rootMalId).toBe(50);
  expect(series.entries).toHaveLength(1);
});

test('overlapping chains referenced from either direction dedupe into one series', () => {
  // Season 2 only points back to season 1 (prequel); season 1 does NOT list season 2 as
  // sequel (simulating inconsistent/partial MAL relation data). Season 3 links only to
  // season 2. All three must still merge into a single series via union-find, not three
  // separate ones or a duplicate.
  const season1 = tv(1, 'Overlap S1');
  const season2 = tv(2, 'Overlap S2', [{ relatedId: 1, relationType: 'prequel' }]);
  const season3 = tv(3, 'Overlap S3', [{ relatedId: 2, relationType: 'prequel' }]);

  const result = groupIntoSeries(byId(season1, season2, season3));

  expect(result).toHaveLength(1);
  expect(result[0].entries.map((e) => e.malId)).toEqual([1, 2, 3]);
});

test('two independent TV chains stay as separate series', () => {
  const showA1 = tv(1, 'Show A S1', [{ relatedId: 2, relationType: 'sequel' }]);
  const showA2 = tv(2, 'Show A S2', [{ relatedId: 1, relationType: 'prequel' }]);
  const showB1 = tv(3, 'Show B S1');

  const result = groupIntoSeries(byId(showA1, showA2, showB1));

  expect(result).toHaveLength(2);
  expect(new Set(result.map((s) => s.rootMalId))).toEqual(new Set([1, 3]));
});

test('missingSequelPrequelIds finds sibling seasons not yet fetched', () => {
  // Only season 1 and season 4 happen to be in the fetched batch (e.g. a search page that
  // didn't include seasons 2-3, or a MAL list that only ever tracked the first and latest
  // season) — season 1's own sequel edge points at season 2, which isn't known yet.
  const season1 = tv(1, 'S1', [{ relatedId: 2, relationType: 'sequel' }]);
  const season4 = tv(4, 'S4', [{ relatedId: 3, relationType: 'prequel' }]);

  const missing = missingSequelPrequelIds(byId(season1, season4));

  expect(missing).toEqual(new Set([2, 3]));
});

test('missingSequelPrequelIds is empty once the whole chain is known', () => {
  const season1 = tv(1, 'S1', [{ relatedId: 2, relationType: 'sequel' }]);
  const season2 = tv(2, 'S2', [
    { relatedId: 1, relationType: 'prequel' },
    { relatedId: 3, relationType: 'sequel' },
  ]);
  const season3 = tv(3, 'S3', [{ relatedId: 2, relationType: 'prequel' }]);

  expect(missingSequelPrequelIds(byId(season1, season2, season3))).toEqual(new Set());
});

test('missingSequelPrequelIds ignores non sequel/prequel relations', () => {
  // A side_story/spin_off/movie relation pointing at an unfetched id should NOT trigger a
  // fetch — only sequel/prequel edges are meant to be walked.
  const season1 = tv(1, 'S1', [{ relatedId: 99, relationType: 'side_story' }]);

  expect(missingSequelPrequelIds(byId(season1))).toEqual(new Set());
});

describe('malformed relation data', () => {
  test('a cyclic prequel chain still produces a series instead of crashing', () => {
    // Every member claims a prequel, so there is no season 1 to start the walk from. This used to
    // hit a non-null assertion on `undefined` and then crash building the entry list. The oldest
    // MAL id stands in as the root.
    const a = tv(1, 'A', [{ relatedId: 2, relationType: 'prequel' }]);
    const b = tv(2, 'B', [{ relatedId: 1, relationType: 'prequel' }]);

    const result = groupIntoSeries(byId(a, b));

    expect(result).toHaveLength(1);
    expect(result[0].rootMalId).toBe(1);
    expect(result[0].entries.map((e) => e.malId).sort()).toEqual([1, 2]);
  });

  test('a branching chain keeps every season rather than dropping the branch', () => {
    // Season 1 has two sequels. The walk can only follow one; the other used to disappear from
    // the series entirely, which also made Y in "Watched X/Y" too small.
    const season1 = tv(1, 'S1', [
      { relatedId: 2, relationType: 'sequel' },
      { relatedId: 3, relationType: 'sequel' },
    ]);
    const branchA = tv(2, 'S2-A', [{ relatedId: 1, relationType: 'prequel' }]);
    const branchB = tv(3, 'S2-B', [{ relatedId: 1, relationType: 'prequel' }]);

    const result = groupIntoSeries(byId(season1, branchA, branchB));

    expect(result).toHaveLength(1);
    expect(result[0].entries.map((e) => e.malId).sort()).toEqual([1, 2, 3]);
    // orderIndex must stay unique and contiguous, since status derivation sorts on it.
    expect(result[0].entries.map((e) => e.orderIndex).sort()).toEqual([0, 1, 2]);
  });
});
