import { applyAddChoice } from '@/domain/addChoice';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import type { ReconcileEntry, ReconcileSeries } from '@/domain/reconcileSeries';

function entry(malId: number, orderIndex: number, kind: ReconcileEntry['kind'] = 'TV_SEASON'): ReconcileEntry {
  return {
    malId,
    kind,
    orderIndex,
    title: `Entry ${malId}`,
    episodeCount: 12,
    airingStatus: 'FINISHED',
    watchState: 'UNWATCHED',
  };
}

function series(entries: ReconcileEntry[], type: ReconcileSeries['type'] = 'SERIES'): ReconcileSeries {
  return {
    title: 'Test show',
    coverUrl: null,
    genres: [],
    rootMalId: 1,
    type,
    manualStatus: 'NONE',
    entries,
  };
}

describe('applyAddChoice', () => {
  it('sets the manual status for the four deliberate statuses, touching no entry', () => {
    const input = series([entry(10, 0), entry(11, 1)]);
    const result = applyAddChoice(input, 'PLAN');
    expect(result.manualStatus).toBe('PLAN');
    expect(result.entries.every((e) => e.watchState === 'UNWATCHED')).toBe(true);
  });

  it('"Watched" stays on Auto and marks only the first season', () => {
    const result = applyAddChoice(series([entry(10, 0), entry(11, 1), entry(12, 2)]), 'WATCHED');
    expect(result.manualStatus).toBe('NONE');
    expect(result.entries.map((e) => e.watchState)).toEqual(['WATCHED', 'UNWATCHED', 'UNWATCHED']);
  });

  it('picks the lowest orderIndex, not the array order', () => {
    const result = applyAddChoice(series([entry(11, 2), entry(10, 0), entry(12, 1)]), 'WATCHED');
    expect(result.entries.find((e) => e.watchState === 'WATCHED')?.malId).toBe(10);
  });

  it('ignores movies when the series has seasons', () => {
    const result = applyAddChoice(series([entry(20, 0, 'MOVIE'), entry(10, 1)]), 'WATCHED');
    expect(result.entries.find((e) => e.watchState === 'WATCHED')?.malId).toBe(10);
  });

  it('marks the movie itself for a standalone movie, which has no seasons', () => {
    const result = applyAddChoice(series([entry(20, 0, 'MOVIE')], 'STANDALONE_MOVIE'), 'WATCHED');
    expect(result.entries[0].watchState).toBe('WATCHED');
    expect(deriveSeriesStatus(result.manualStatus, result.entries).kind).toBe('WATCHED');
  });

  it('a single-season show added as Watched derives straight to Watched, a multi-season one to partial', () => {
    const single = applyAddChoice(series([entry(10, 0)]), 'WATCHED');
    expect(deriveSeriesStatus(single.manualStatus, single.entries).kind).toBe('WATCHED');

    const multi = applyAddChoice(series([entry(10, 0), entry(11, 1)]), 'WATCHED');
    expect(deriveSeriesStatus(multi.manualStatus, multi.entries)).toMatchObject({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 1,
      totalSeasons: 2,
    });
  });
});
