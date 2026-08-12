import { seriesShapeLabel } from '@/domain/seriesShape';
import type { ReconcileEntry, ReconcileSeries } from '@/domain/reconcileSeries';

function makeEntry(overrides: Partial<ReconcileEntry> = {}): ReconcileEntry {
  return {
    malId: 1,
    kind: 'TV_SEASON',
    orderIndex: 0,
    title: 'Entry',
    episodeCount: 12,
    watchState: 'UNWATCHED',
    airingStatus: 'FINISHED',
    ...overrides,
  };
}

function makeSeries(overrides: Partial<ReconcileSeries> = {}): ReconcileSeries {
  return {
    rootMalId: 1,
    title: 'Show',
    coverUrl: null,
    genres: [],
    type: 'SERIES',
    manualStatus: 'NONE',
    entries: [makeEntry()],
    ...overrides,
  };
}

describe('seriesShapeLabel', () => {
  test('counts seasons and films separately', () => {
    // The whole point: MAL would list these as unrelated entries, and one merged number would hide
    // whichever half the user cares about.
    const series = makeSeries({
      entries: [
        makeEntry({ malId: 1, kind: 'TV_SEASON' }),
        makeEntry({ malId: 2, kind: 'TV_SEASON', orderIndex: 1 }),
        makeEntry({ malId: 3, kind: 'TV_SEASON', orderIndex: 2 }),
        makeEntry({ malId: 4, kind: 'MOVIE' }),
        makeEntry({ malId: 5, kind: 'MOVIE', orderIndex: 1 }),
      ],
    });
    expect(seriesShapeLabel(series)).toBe('3 seasons · 2 films');
  });

  test('singularizes both halves', () => {
    const series = makeSeries({
      entries: [makeEntry({ malId: 1, kind: 'TV_SEASON' }), makeEntry({ malId: 2, kind: 'MOVIE' })],
    });
    expect(seriesShapeLabel(series)).toBe('1 season · 1 film');
  });

  test('omits an empty half rather than printing a zero', () => {
    expect(seriesShapeLabel(makeSeries())).toBe('1 season');
  });

  test('a standalone movie is named, not counted', () => {
    // "Movie", never "1 film" — the two would otherwise sit in the same row meaning different
    // things (a film that is the whole thing, vs. a film attached to a series).
    const series = makeSeries({ type: 'STANDALONE_MOVIE', entries: [makeEntry({ kind: 'MOVIE' })] });
    expect(seriesShapeLabel(series)).toBe('Movie');
  });

  test('returns empty rather than a stray separator when there is nothing to say', () => {
    expect(seriesShapeLabel(makeSeries({ entries: [] }))).toBe('');
  });
});
