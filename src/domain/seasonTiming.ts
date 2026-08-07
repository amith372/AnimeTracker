/**
 * Turns MAL's `start_season` (a year + one of winter/spring/summer/fall) into an epoch-millis
 * timestamp for the 1st of that quarter's starting month. Used to work out how "new" a
 * newly-discovered season actually is (see hasVisibleNewSeasonAlert in series.ts) — we only
 * need quarter-level precision, not the exact air date.
 */
export function seasonStartEpochMillis(year: number, season: string): number {
  const month = { winter: 1, spring: 4, summer: 7, fall: 10 }[season.toLowerCase()] ?? 1;
  return Date.UTC(year, month - 1, 1);
}

export interface YearSeason {
  year: number;
  season: 'winter' | 'spring' | 'summer' | 'fall';
}

/** Which MAL season a given date falls in — used to pick the "This Season" Discover query. */
export function currentSeason(now: Date = new Date()): YearSeason {
  const month = now.getUTCMonth() + 1; // 1-12
  if (month <= 3) return { year: now.getUTCFullYear(), season: 'winter' };
  if (month <= 6) return { year: now.getUTCFullYear(), season: 'spring' };
  if (month <= 9) return { year: now.getUTCFullYear(), season: 'summer' };
  return { year: now.getUTCFullYear(), season: 'fall' };
}

/** The season immediately after the given one — used to pick the "Upcoming Next Season" query. */
export function nextSeason({ year, season }: YearSeason): YearSeason {
  switch (season) {
    case 'winter':
      return { year, season: 'spring' };
    case 'spring':
      return { year, season: 'summer' };
    case 'summer':
      return { year, season: 'fall' };
    case 'fall':
      return { year: year + 1, season: 'winter' };
  }
}
