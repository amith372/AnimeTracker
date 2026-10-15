// src/repositories/sharedLibraryMapping.ts — what a shared-library payload means (plan 4 step 3 /
// prd/2-public-share.md).
//
// The property under test is success criterion 5: a viewer and the owner must never read a
// different status for the same show. The mapping is what carries that, by handing the payload
// straight to the app's own deriveSeriesStatus instead of reading a label off the wire — so these
// cases are deliberately the awkward ones from the status rules (a broken season streak, a
// WONT_WATCH that counts as done, a manual status that overrides a complete library), checked
// through the public payload shape rather than through a Postgres row.
//
// Every figure below is counted by hand from the entries written above it, never read off what the
// implementation returned.
import {
  sharedLibraryHeading,
  toSharedLibrary,
  type SharedEntryPayload,
  type SharedLibraryPayload,
  type SharedSeriesPayload,
} from '@/repositories/sharedLibraryMapping';

function season(orderIndex: number, watchState: SharedEntryPayload['watchState']): SharedEntryPayload {
  return { kind: 'TV_SEASON', orderIndex, episodeCount: 12, watchState, airingStatus: 'FINISHED' };
}

function movie(orderIndex: number, watchState: SharedEntryPayload['watchState']): SharedEntryPayload {
  return { kind: 'MOVIE', orderIndex, episodeCount: 1, watchState, airingStatus: 'FINISHED' };
}

function series(overrides: Partial<SharedSeriesPayload> = {}): SharedSeriesPayload {
  return {
    title: 'Demon Slayer',
    coverUrl: 'https://example.invalid/cover.jpg',
    genres: ['Action'],
    type: 'SERIES',
    manualStatus: 'NONE',
    entries: [],
    ...overrides,
  };
}

function payload(rows: SharedSeriesPayload[], displayName: string | null = null): SharedLibraryPayload {
  return { displayName, series: rows };
}

describe('toSharedLibrary', () => {
  test('derives the two counts independently', () => {
    // 5 seasons, the first 3 watched; 3 movies, 2 of them watched. Seasons 1-2-3 are an unbroken
    // run from the start, so X is 3 of 5; movies are a plain tally, 2 of 3.
    const [row] = toSharedLibrary(
      payload([
        series({
          entries: [
            season(1, 'WATCHED'),
            season(2, 'WATCHED'),
            season(3, 'WATCHED'),
            season(4, 'UNWATCHED'),
            season(5, 'UNWATCHED'),
            movie(1, 'WATCHED'),
            movie(2, 'WATCHED'),
            movie(3, 'UNWATCHED'),
          ],
        }),
      ]),
    ).series;

    expect(row.status).toEqual({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 3,
      totalSeasons: 5,
      watchedMovies: 2,
      totalMovies: 3,
    });
  });

  test('a gap in the seasons breaks the streak', () => {
    // Seasons 1 and 3 watched, 2 not. The run from season 1 stops at 1, so this is 1/3 — not 2/3.
    // A viewer reading "Watched 2/3" would be told the show is nearly finished when the next
    // thing to watch is season 2.
    const [row] = toSharedLibrary(
      payload([series({ entries: [season(1, 'WATCHED'), season(2, 'UNWATCHED'), season(3, 'WATCHED')] })]),
    ).series;

    expect(row.status).toEqual({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 1,
      totalSeasons: 3,
      watchedMovies: 0,
      totalMovies: 0,
    });
  });

  test("a WONT_WATCH entry counts as done and doesn't break the streak", () => {
    // 3 watched + 1 skipped of 5: the run reaches 4. This is the mark that lets a show someone is
    // genuinely finished with stop reading as unfinished on a page they published.
    const [row] = toSharedLibrary(
      payload([
        series({
          entries: [
            season(1, 'WATCHED'),
            season(2, 'WATCHED'),
            season(3, 'WATCHED'),
            season(4, 'WONT_WATCH'),
            season(5, 'UNWATCHED'),
          ],
        }),
      ]),
    ).series;

    expect(row.status).toEqual({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 4,
      totalSeasons: 5,
      watchedMovies: 0,
      totalMovies: 0,
    });
  });

  test('every entry resolved reads as Watched', () => {
    const [row] = toSharedLibrary(
      payload([series({ entries: [season(1, 'WATCHED'), season(2, 'WONT_WATCH'), movie(1, 'WATCHED')] })]),
    ).series;

    expect(row.status).toEqual({ kind: 'WATCHED' });
  });

  test('an unseen film keeps a fully-watched series partial', () => {
    // Both seasons seen, the film not: 2/2 seasons and 0/1 movies, which is partial rather than
    // Watched. The two counts are independent precisely so this case can't hide.
    const [row] = toSharedLibrary(
      payload([series({ entries: [season(1, 'WATCHED'), season(2, 'WATCHED'), movie(1, 'UNWATCHED')] })]),
    ).series;

    expect(row.status).toEqual({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 2,
      totalSeasons: 2,
      watchedMovies: 0,
      totalMovies: 1,
    });
  });

  test('a manual status wins over a complete library', () => {
    // Dropped stays dropped even with every entry resolved — the owner's deliberate choice, and
    // the scope says a dropped show is published like any other.
    const [row] = toSharedLibrary(
      payload([series({ manualStatus: 'DROPPED', entries: [season(1, 'WATCHED'), season(2, 'WATCHED')] })]),
    ).series;

    expect(row.status).toEqual({ kind: 'DROPPED' });
  });

  test('a standalone movie derives from its own entry', () => {
    // No seasons at all, so this is 0/0 seasons and 0/1 movies. It must not read as Watched just
    // because it has nothing else outstanding — an unseen film imported from a plan-to-watch list
    // would otherwise be published as already watched.
    const [row] = toSharedLibrary(
      payload([series({ type: 'STANDALONE_MOVIE', entries: [movie(1, 'UNWATCHED')] })]),
    ).series;

    expect(row.status).toEqual({
      kind: 'WATCHED_PARTIAL',
      watchedSeasons: 0,
      totalSeasons: 0,
      watchedMovies: 0,
      totalMovies: 1,
    });
  });

  test('carries the fields the page renders, and defaults the ones a row may lack', () => {
    const [row] = toSharedLibrary(
      payload([
        series({
          title: 'Mushishi',
          coverUrl: null,
          // `genres` is jsonb; an old row can hold null, and a page that trusted it would throw on
          // .length rather than simply showing no genres.
          genres: null as unknown as string[],
          entries: [season(1, 'WATCHED')],
        }),
      ]),
    ).series;

    expect(row.title).toBe('Mushishi');
    expect(row.coverUrl).toBeNull();
    expect(row.genres).toEqual([]);
    expect(row.type).toBe('SERIES');
  });

  test('carries a plain resolved-of-total tally for the progress bar', () => {
    // 3 of 5 seasons and 2 of 3 movies resolved -> 5 of 8 overall, which is what the bar fills to.
    const [row] = toSharedLibrary(
      payload([
        series({
          entries: [
            season(1, 'WATCHED'),
            season(2, 'WATCHED'),
            season(3, 'WATCHED'),
            season(4, 'UNWATCHED'),
            season(5, 'UNWATCHED'),
            movie(1, 'WATCHED'),
            movie(2, 'WATCHED'),
            movie(3, 'UNWATCHED'),
          ],
        }),
      ]),
    ).series;

    expect(row.progress).toEqual({ seasons: { watched: 3, total: 5 }, movies: { watched: 2, total: 3 } });
  });

  test('the tally counts a gap that the status label does not', () => {
    // Seasons 1 and 3 watched, 2 not. The label is run-based and says 1/3 ("where am I up to");
    // the tally is 2/3 ("how much have I got through"). They are different questions and the two
    // numbers are allowed to differ — the Series Detail screen already pairs them this way. This
    // test exists so that pairing is deliberate rather than something a later change "fixes".
    const [row] = toSharedLibrary(
      payload([series({ entries: [season(1, 'WATCHED'), season(2, 'UNWATCHED'), season(3, 'WATCHED')] })]),
    ).series;

    expect(row.status).toMatchObject({ kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 3 });
    expect(row.progress.seasons).toEqual({ watched: 2, total: 3 });
  });

  test('counts WONT_WATCH as resolved in the tally too', () => {
    // Same rule as the status derivation: the mark means "I'm done with this one", so a bar that
    // ignored it would show a show you have finished as permanently incomplete.
    const [row] = toSharedLibrary(
      payload([series({ entries: [season(1, 'WATCHED'), season(2, 'WONT_WATCH'), season(3, 'UNWATCHED')] })]),
    ).series;

    expect(row.progress.seasons).toEqual({ watched: 2, total: 3 });
  });

  test('gives a manual-status series real counts, which its status has none of', () => {
    // A dropped show derives to {kind:'DROPPED'} with no figures at all. "1/4 seasons in, then
    // dropped" is exactly the row a reader wants a number on, which is why the tally is computed
    // from the entries rather than read off the status.
    const [row] = toSharedLibrary(
      payload([
        series({
          manualStatus: 'DROPPED',
          entries: [season(1, 'WATCHED'), season(2, 'UNWATCHED'), season(3, 'UNWATCHED'), season(4, 'UNWATCHED')],
        }),
      ]),
    ).series;

    expect(row.status).toEqual({ kind: 'DROPPED' });
    expect(row.progress.seasons).toEqual({ watched: 1, total: 4 });
  });

  test('an empty library maps to an empty list, not a failure', () => {
    expect(toSharedLibrary(payload([]))).toEqual({ displayName: null, series: [] });
  });
});

describe('sharedLibraryHeading', () => {
  test('uses the name the sharer typed', () => {
    expect(sharedLibraryHeading('Amith')).toBe('Amith’s anime list');
  });

  test('falls back to a neutral phrase when there is no name', () => {
    // Never anything the app already holds about them — no address, no MyAnimeList username, no
    // account id. That is the whole of the PRD's "whose list it is" decision.
    expect(sharedLibraryHeading(null)).toBe('A shared anime list');
    expect(sharedLibraryHeading(undefined)).toBe('A shared anime list');
  });

  test('treats a blank name as no name', () => {
    // Postgres rejects '' and the client normalizes blanks to null, but a payload is a wire format
    // and a heading that renders as nothing is the sort of thing only production finds.
    expect(sharedLibraryHeading('   ')).toBe('A shared anime list');
  });

  test('trims a name rather than publishing the spaces', () => {
    expect(sharedLibraryHeading('  Amith  ')).toBe('Amith’s anime list');
  });
});
