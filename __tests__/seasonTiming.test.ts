import { currentSeason, nextSeason, seasonStartEpochMillis } from '@/domain/seasonTiming';

test('each season maps to its starting quarter, in calendar order', () => {
  const winter = seasonStartEpochMillis(2026, 'winter');
  const spring = seasonStartEpochMillis(2026, 'spring');
  const summer = seasonStartEpochMillis(2026, 'summer');
  const fall = seasonStartEpochMillis(2026, 'fall');
  expect(winter).toBeLessThan(spring);
  expect(spring).toBeLessThan(summer);
  expect(summer).toBeLessThan(fall);
});

test('season name matching is case-insensitive', () => {
  expect(seasonStartEpochMillis(2026, 'Spring')).toBe(seasonStartEpochMillis(2026, 'spring'));
  expect(seasonStartEpochMillis(2026, 'SPRING')).toBe(seasonStartEpochMillis(2026, 'spring'));
});

test('spring 2026 lands on April 1st 2026 UTC', () => {
  expect(seasonStartEpochMillis(2026, 'spring')).toBe(Date.UTC(2026, 3, 1));
});

describe('currentSeason', () => {
  test('maps each month to its calendar-quarter season', () => {
    expect(currentSeason(new Date(Date.UTC(2026, 0, 15)))).toEqual({ year: 2026, season: 'winter' });
    expect(currentSeason(new Date(Date.UTC(2026, 3, 15)))).toEqual({ year: 2026, season: 'spring' });
    expect(currentSeason(new Date(Date.UTC(2026, 6, 15)))).toEqual({ year: 2026, season: 'summer' });
    expect(currentSeason(new Date(Date.UTC(2026, 9, 15)))).toEqual({ year: 2026, season: 'fall' });
  });
});

describe('nextSeason', () => {
  test('advances through the year in order', () => {
    expect(nextSeason({ year: 2026, season: 'winter' })).toEqual({ year: 2026, season: 'spring' });
    expect(nextSeason({ year: 2026, season: 'spring' })).toEqual({ year: 2026, season: 'summer' });
    expect(nextSeason({ year: 2026, season: 'summer' })).toEqual({ year: 2026, season: 'fall' });
  });

  test('fall rolls over into next year\'s winter', () => {
    expect(nextSeason({ year: 2026, season: 'fall' })).toEqual({ year: 2027, season: 'winter' });
  });
});
