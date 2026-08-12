import { isResolved, type EntryKind, type ManualStatus, type WatchState } from './types';

/**
 * The six statuses a series can show. `Watched` and `WatchedPartial` are *derived* — they only
 * apply when the user hasn't set a manual override (see deriveSeriesStatus below). The other
 * four are always the user's explicit choice.
 *
 * WatchedPartial carries two independent counts, seasons and movies, because a show like Demon
 * Slayer is genuinely two separate backlogs: you can be 3 of 5 seasons in and 2 of 3 films in, and
 * collapsing that into one number hides whichever half you haven't finished. Either count can be
 * 0/0 (a standalone movie has no seasons; most series have no films) — see statusLabel, which
 * simply omits an empty half.
 */
export type SeriesStatus =
  | { kind: 'PLAN' }
  | { kind: 'CURRENTLY_WATCHING' }
  | { kind: 'DROPPED' }
  | { kind: 'WATCHED_FORGOT' }
  | { kind: 'WATCHED' }
  | {
      kind: 'WATCHED_PARTIAL';
      watchedSeasons: number;
      totalSeasons: number;
      watchedMovies: number;
      totalMovies: number;
    };

/** The minimal shape deriveSeriesStatus needs from a series entry — not the full domain model. */
export interface EntryStatusInput {
  kind: EntryKind;
  orderIndex: number;
  watchState: WatchState;
}

/**
 * Works out what status a series should display.
 *
 * Manual status always wins when it's set to anything other than NONE (e.g. a show marked Dropped
 * stays Dropped even if a new season airs). When it's NONE, the status is derived from the entries:
 *
 *  - **Seasons** count as the highest *consecutive* run from season 1, so a gap breaks the streak —
 *    watching seasons 1 and 3 but not 2 is "1/3", not "2/3", because the point of the number is
 *    "where am I up to", not "how many have I seen".
 *  - **Movies** are a plain watched-of-total tally. They have no running order, so there's no
 *    streak for a gap to break.
 *  - A `WONT_WATCH` entry counts as done in both, and does not break a season streak. That's the
 *    whole reason it exists: marking the seasons you're never going to watch is what lets a show
 *    you're finished with actually reach Watched instead of sitting at 3/5 forever.
 *  - **Watched** requires *both* halves complete. A series with every season seen but an unwatched
 *    film is still partial — that film is exactly what the Catch up list is for.
 */
export function deriveSeriesStatus(
  manualStatus: ManualStatus,
  entries: EntryStatusInput[],
): SeriesStatus {
  if (manualStatus !== 'NONE') {
    switch (manualStatus) {
      case 'PLAN':
        return { kind: 'PLAN' };
      case 'CURRENTLY_WATCHING':
        return { kind: 'CURRENTLY_WATCHING' };
      case 'DROPPED':
        return { kind: 'DROPPED' };
      case 'WATCHED_FORGOT':
        return { kind: 'WATCHED_FORGOT' };
    }
  }

  const seasons = entries
    .filter((e) => e.kind === 'TV_SEASON')
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const movies = entries.filter((e) => e.kind === 'MOVIE');

  const everythingResolved =
    seasons.every((s) => isResolved(s.watchState)) && movies.every((m) => isResolved(m.watchState));
  if (everythingResolved) {
    // Also the (unreachable in practice) no-entries case: grouping always emits at least the
    // entry it grouped, so an empty series can't be created, but "nothing outstanding" is the
    // only sensible reading if one ever were.
    return { kind: 'WATCHED' };
  }

  return {
    kind: 'WATCHED_PARTIAL',
    watchedSeasons: leadingResolvedRun(seasons),
    totalSeasons: seasons.length,
    watchedMovies: movies.filter((m) => isResolved(m.watchState)).length,
    totalMovies: movies.length,
  };
}

/**
 * Which half of a series' backlog to count — the Library's "Watched X/Y" view lens.
 * `ALL` is the real, stored answer; the other two are a way of *looking* at it.
 */
export type CountScope = 'ALL' | 'SEASONS' | 'MOVIES';

/**
 * deriveSeriesStatus with one half of the entries ignored — "count seasons only" / "count movies
 * only", the toggle on the Library's Watched X/Y filter.
 *
 * This is deliberately a pure re-derivation over a filtered entry list, not a stored override:
 * nothing is written anywhere, so switching the lens back re-counts the hidden half and restores
 * the original status exactly (a show reading "Watched" under Seasons-only goes straight back to
 * "Watched 6/6 seasons, 0/6 movies" under All). That reversibility is the whole reason it works
 * this way rather than as a flag on the series row.
 *
 * A manual status still wins, same as ever — the scope only affects derived counts.
 */
export function deriveScopedSeriesStatus(
  manualStatus: ManualStatus,
  entries: EntryStatusInput[],
  scope: CountScope,
): SeriesStatus {
  if (scope === 'ALL') return deriveSeriesStatus(manualStatus, entries);
  const wanted: EntryKind = scope === 'SEASONS' ? 'TV_SEASON' : 'MOVIE';
  return deriveSeriesStatus(
    manualStatus,
    entries.filter((e) => e.kind === wanted),
  );
}

/** How far the unbroken run of resolved seasons reaches from season 1 — the "X" in X/Y. */
function leadingResolvedRun(orderedSeasons: EntryStatusInput[]): number {
  let count = 0;
  for (const season of orderedSeasons) {
    if (!isResolved(season.watchState)) break;
    count++;
  }
  return count;
}
