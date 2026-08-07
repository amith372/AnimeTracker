// Shared vocabulary used across the domain layer, the DB schema, and the MAL API mapping.
// These mirror the enums from the original Kotlin app (EntryKind, AiringStatus, SeriesType,
// ManualStatus) as TypeScript string-literal unions, since that's what maps cleanly onto
// SQLite TEXT columns without a separate serialization step.

/** A season/movie entry belongs to exactly one of these. Each kind gets its own X/Y count. */
export type EntryKind = 'TV_SEASON' | 'MOVIE';

/**
 * Where the user stands on one specific season/movie. `WONT_WATCH` is the deliberate "I'm never
 * going to see this one, stop asking" — a recap season, a filler movie — and it's why this is a
 * tri-state rather than the boolean it started as. For status derivation it counts as *resolved*
 * exactly like WATCHED (see seriesStatus.ts): a series with nothing left unresolved is Watched.
 * The distinction from WATCHED is preserved anyway, because "seen it" and "skipping it" are
 * genuinely different things to show on the Detail screen.
 */
export type WatchState = 'UNWATCHED' | 'WATCHED' | 'WONT_WATCH';

/** True when the user has made up their mind about an entry, either way. */
export function isResolved(state: WatchState): boolean {
  return state !== 'UNWATCHED';
}

/** Whether a specific season/movie has finished airing, per MAL. */
export type AiringStatus = 'FINISHED' | 'AIRING' | 'NOT_YET_AIRED';

/** A grouped show is either a whole multi-season series, or a single standalone movie. */
export type SeriesType = 'SERIES' | 'STANDALONE_MOVIE';

/**
 * The user's manual override for a series' status. NONE means "no override" — the effective
 * status is derived from which entries are watched (see seriesStatus.ts). Manual status always
 * wins over the derived one once set.
 */
export type ManualStatus = 'PLAN' | 'CURRENTLY_WATCHING' | 'DROPPED' | 'WATCHED_FORGOT' | 'NONE';
