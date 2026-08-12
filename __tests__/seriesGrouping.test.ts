import {
  groupIntoSeries,
  missingSequelPrequelIds,
  rejectSeriesOverlapping,
  retainSeriesOnUserList,
  type AnimeRelationInput,
  type RelatedAnimeRef,
} from '@/domain/seriesGrouping';

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

describe('retainSeriesOnUserList', () => {
  test('drops series pulled in only as relation scaffolding', () => {
    // The real shape of the bug: a tracked show whose spin-off (a non-sequel relation) got
    // fetched by the closure walk and then grouped into a series of its own. It has no imported
    // MAL status, so it derived as "Watched 0/1 seasons" and flooded the library.
    const tracked = tv(1, 'Tracked Show', [{ relatedId: 9, relationType: 'spin_off' }]);
    const spinOff = tv(9, 'Unrelated Spin-off', [{ relatedId: 1, relationType: 'other' }]);

    const grouped = groupIntoSeries(byId(tracked, spinOff));
    expect(grouped).toHaveLength(2); // grouping itself is unchanged — both are still separate

    const kept = retainSeriesOnUserList(grouped, new Set([1]));

    expect(kept.map((s) => s.rootMalId)).toEqual([1]);
  });

  test('keeps a tracked series whole, including entries not on the list', () => {
    // The reason the filter runs after grouping rather than narrowing the closure walk: a
    // series' movies and later seasons are routinely absent from the user's own MAL list, and
    // they must still come along with the series they belong to.
    const season1 = tv(1, 'Show S1', [
      { relatedId: 2, relationType: 'sequel' },
      { relatedId: 3, relationType: 'side_story' },
    ]);
    const season2 = tv(2, 'Show S2', [{ relatedId: 1, relationType: 'prequel' }]);
    const film = movie(3, 'Show: The Movie', [{ relatedId: 1, relationType: 'parent_story' }]);

    // Only season 1 is on the user's list.
    const kept = retainSeriesOnUserList(groupIntoSeries(byId(season1, season2, film)), new Set([1]));

    expect(kept).toHaveLength(1);
    expect(kept[0].entries.map((e) => e.malId).sort()).toEqual([1, 2, 3]);
  });

  test('keeps a standalone movie that is on the list', () => {
    const film = movie(5, 'A Film');

    expect(retainSeriesOnUserList(groupIntoSeries(byId(film)), new Set([5]))).toHaveLength(1);
    expect(retainSeriesOnUserList(groupIntoSeries(byId(film)), new Set([99]))).toHaveLength(0);
  });
});

describe('rejectSeriesOverlapping', () => {
  test('keeps a series with no entry already in the library', () => {
    const fresh = tv(1, 'Brand New Show');

    const kept = rejectSeriesOverlapping(groupIntoSeries(byId(fresh)), new Set([50, 51]));

    expect(kept.map((s) => s.rootMalId)).toEqual([1]);
  });

  test('drops a new MAL entry that groups back into a series already tracked', () => {
    // The case the additive sync exists to get right: the user adds season 3 on myanimelist.net,
    // the closure walk pulls seasons 1-2 along, and grouping hands back one whole series whose
    // earlier seasons are already in the library. Checking only the seed id would let this through
    // and then trip add_series' unique(user_id, root_mal_id).
    const season1 = tv(1, 'S1', [{ relatedId: 2, relationType: 'sequel' }]);
    const season2 = tv(2, 'S2', [
      { relatedId: 1, relationType: 'prequel' },
      { relatedId: 3, relationType: 'sequel' },
    ]);
    const season3 = tv(3, 'S3', [{ relatedId: 2, relationType: 'prequel' }]);

    const grouped = groupIntoSeries(byId(season1, season2, season3));
    expect(grouped).toHaveLength(1);

    // Seasons 1 and 2 are already tracked; only season 3 was newly added on MAL.
    expect(rejectSeriesOverlapping(grouped, new Set([1, 2]))).toEqual([]);
  });

  test('drops on a single overlapping entry, including a movie', () => {
    // Overlap on any entry is enough — a series whose film the user already has as part of that
    // same series must not be re-inserted.
    const season1 = tv(1, 'S1', [{ relatedId: 10, relationType: 'side_story' }]);
    const film = movie(10, 'The Movie', [{ relatedId: 1, relationType: 'parent_story' }]);

    const grouped = groupIntoSeries(byId(season1, film));

    expect(rejectSeriesOverlapping(grouped, new Set([10]))).toEqual([]);
    expect(rejectSeriesOverlapping(grouped, new Set([999]))).toHaveLength(1);
  });

  test('filters series independently rather than all-or-nothing', () => {
    const tracked = tv(1, 'Already Have This');
    const fresh = tv(2, 'New');

    const kept = rejectSeriesOverlapping(groupIntoSeries(byId(tracked, fresh)), new Set([1]));

    expect(kept.map((s) => s.rootMalId)).toEqual([2]);
  });
});
