import { hasVisibleNewSeasonAlert, type Series } from '@/domain/series';

const NOW = Date.UTC(2026, 7, 4); // 2026-08-04, an arbitrary fixed "now" so tests don't depend on the real clock

function baseSeries(overrides: Partial<Series>): Series {
  return {
    id: 1,
    title: 'Test Show',
    coverUrl: null,
    genres: [],
    rootMalId: 1,
    type: 'SERIES',
    manualStatus: 'NONE',
    status: { kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 2, watchedMovies: 0, totalMovies: 0 },
    entries: [],
    newSeasonAvailable: false,
    newSeasonAiredAtEpochMillis: null,
    liked: false,
    ...overrides,
  };
}

test('no alert when the flag is false, regardless of air date', () => {
  const series = baseSeries({ newSeasonAvailable: false, newSeasonAiredAtEpochMillis: NOW });
  expect(hasVisibleNewSeasonAlert(series, NOW)).toBe(false);
});

test('alert shown when the air date is unknown (default to showing rather than hiding)', () => {
  const series = baseSeries({ newSeasonAvailable: true, newSeasonAiredAtEpochMillis: null });
  expect(hasVisibleNewSeasonAlert(series, NOW)).toBe(true);
});

test('alert shown when the new season aired less than a year ago', () => {
  const sixMonthsAgo = NOW - 180 * 24 * 60 * 60 * 1000;
  const series = baseSeries({ newSeasonAvailable: true, newSeasonAiredAtEpochMillis: sixMonthsAgo });
  expect(hasVisibleNewSeasonAlert(series, NOW)).toBe(true);
});

test('alert hidden once the new season is over a year old', () => {
  const twoYearsAgo = NOW - 2 * 365 * 24 * 60 * 60 * 1000;
  const series = baseSeries({ newSeasonAvailable: true, newSeasonAiredAtEpochMillis: twoYearsAgo });
  expect(hasVisibleNewSeasonAlert(series, NOW)).toBe(false);
});

test('exactly one year ago is still shown (boundary is inclusive)', () => {
  const oneYearAgo = NOW - 365 * 24 * 60 * 60 * 1000;
  const series = baseSeries({ newSeasonAvailable: true, newSeasonAiredAtEpochMillis: oneYearAgo });
  expect(hasVisibleNewSeasonAlert(series, NOW)).toBe(true);
});
