import type { ReconcileSeries } from './reconcileSeries';

/**
 * How much show a not-yet-tracked result actually is — "3 seasons · 2 films".
 *
 * This is the app's own claim made visible at the point it matters most. A Discover or
 * Recommendations result is a whole *series*: the grouping already followed MAL's sequel/prequel
 * chain and collapsed it, and attached the related films, before anything reached the tile (see
 * seriesGrouping.ts). MAL's own list would have shown those as unrelated separate entries. The tile
 * was throwing that away and reading "TV · Fall 2024", so the one thing this app knows that MAL
 * doesn't was invisible exactly where the user is deciding whether to commit to something.
 *
 * Seasons and films are counted separately for the same reason status derivation counts them
 * separately (see statusLabel): they're two independent commitments, and one merged number hides
 * whichever half the user cares about.
 *
 * "films", not "movies", deliberately — a STANDALONE_MOVIE returns "Movie", and using the same word
 * for both would make "Movie" and "1 movie" sit in the same row meaning different things.
 *
 * Returns an empty string when there's nothing meaningful to say (no entries at all), so callers
 * can fall back rather than render a stray separator.
 */
export function seriesShapeLabel(series: ReconcileSeries): string {
  if (series.type === 'STANDALONE_MOVIE') return 'Movie';
  const seasons = series.entries.filter((e) => e.kind === 'TV_SEASON').length;
  const films = series.entries.filter((e) => e.kind === 'MOVIE').length;
  const parts: string[] = [];
  if (seasons > 0) parts.push(`${seasons} season${seasons === 1 ? '' : 's'}`);
  if (films > 0) parts.push(`${films} film${films === 1 ? '' : 's'}`);
  return parts.join(' · ');
}
