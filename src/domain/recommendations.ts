import type { ReconcileSeries } from './reconcileSeries';
import type { Series, SeriesEntry } from './series';

/** Series eligible to seed recommendations from — CLAUDE.md's "non-dropped watched series". */
export function isRecommendationSource(series: Series): boolean {
  return series.status.kind === 'WATCHED' || series.status.kind === 'WATCHED_PARTIAL';
}

/** An unresolved season or movie inside an otherwise Watched/Watched X/Y series — "Catch up". */
export interface CatchUpItem {
  series: Series;
  entry: SeriesEntry;
}

/**
 * What the user should watch *next* on each show they're otherwise done with. Purely local — no
 * MAL calls needed, unlike the recommendations below.
 *
 * At most two rows per series: the next unwatched season, and the next unwatched movie. Listing
 * every outstanding entry instead meant one half-finished show could occupy six rows and push
 * every other series off the screen — the list stopped being "what do I watch next" and became a
 * second copy of the library. Ticking one off simply advances the row to the one after it.
 *
 * "Next" is the *earliest* unwatched by orderIndex, not the newest: with seasons 1-3 watched, the
 * useful answer is season 4, not the season 6 you can't start yet. Movies get the same treatment
 * rather than being listed in full, because film series are frequently ordered too (a trilogy is
 * as sequential as a season chain).
 *
 * Movies count here at all, which they originally didn't — a Demon Slayer film left unwatched used
 * to be invisible twice over: absent from this list, and unable to move the season count either.
 * Entries marked WONT_WATCH are excluded — that mark exists precisely to stop something nagging.
 */
export function getCatchUpEntries(allSeries: Series[]): CatchUpItem[] {
  const items: CatchUpItem[] = [];
  for (const series of allSeries) {
    if (!isRecommendationSource(series)) continue;
    const nextSeason = nextUnwatched(series, 'TV_SEASON');
    if (nextSeason) items.push({ series, entry: nextSeason });
    const nextMovie = nextUnwatched(series, 'MOVIE');
    if (nextMovie) items.push({ series, entry: nextMovie });
  }
  return items;
}

/** The earliest-ordered entry of one kind the user hasn't resolved yet, or undefined if none. */
function nextUnwatched(series: Series, kind: SeriesEntry['kind']): SeriesEntry | undefined {
  return series.entries
    .filter((e) => e.kind === kind && e.watchState === 'UNWATCHED')
    .sort((a, b) => a.orderIndex - b.orderIndex)[0];
}

/**
 * Catch-up items split into the screen's three sections. Seasons and movies are separated for the
 * same reason Catch up is separated from For you in the first place: a long list of skipped seasons
 * otherwise buries a couple of films at the bottom where they're never seen.
 *
 * The third section, Future releases, is the entries there's nothing to watch *yet*. MAL reports
 * `num_episodes: 0` for an announced-but-unaired entry (it can't count episodes that don't exist),
 * so a zero episode count is the signal — checked before the kind split, so an unreleased film
 * doesn't sit under Movies either. Without it, a season announced years ahead sat at the top of
 * Catch up as if it were something the user had skipped, which is exactly the nagging the list is
 * supposed to avoid. They stay listed rather than hidden: "coming, nothing to do" is genuinely
 * useful, it just isn't a backlog.
 */
export function splitCatchUpByKind(items: CatchUpItem[]): {
  seasons: CatchUpItem[];
  movies: CatchUpItem[];
  futureReleases: CatchUpItem[];
} {
  const released = items.filter((i) => !isUnreleased(i.entry));
  return {
    seasons: released.filter((i) => i.entry.kind === 'TV_SEASON'),
    movies: released.filter((i) => i.entry.kind === 'MOVIE'),
    futureReleases: items.filter((i) => isUnreleased(i.entry)),
  };
}

/** Nothing to watch yet — MAL has no episode count for it (see splitCatchUpByKind). */
function isUnreleased(entry: SeriesEntry): boolean {
  return entry.episodeCount <= 0;
}

/**
 * The same seasons/movies split applied to the "For you" side: recommended shows and recommended
 * standalone films are different commitments (a dozen hours vs. an evening), so they get their own
 * sections rather than being interleaved by score.
 */
export function splitRecommendationsByType(recommended: ReconcileSeries[]): {
  shows: ReconcileSeries[];
  movies: ReconcileSeries[];
} {
  return {
    shows: recommended.filter((s) => s.type !== 'STANDALONE_MOVIE'),
    movies: recommended.filter((s) => s.type === 'STANDALONE_MOVIE'),
  };
}

// A series the user marked `liked` counts for more than one plain vote in both the MAL-tally and
// the genre-affinity profile — CLAUDE.md §7's "liked series count for extra weight" rule.
const LIKED_WEIGHT = 3;
const DEFAULT_WEIGHT = 1;

/** One recommendation MAL returned, with how many MAL users actually made it. */
export interface RecommendedRef {
  id: number;
  /** MAL's `num_recommendations` — 500 users recommending this means far more than 1 user did. */
  numRecommendations: number;
}

export interface RecommendationSource {
  liked: boolean;
  recommended: RecommendedRef[];
}

/**
 * Tallies each candidate id across every source series' own `recommendations`.
 *
 * Two things matter here beyond a plain count. First, a series the user `liked` counts for more
 * (CLAUDE.md §7's "liked series count for extra weight"). Second, MAL tells us *how many* of its
 * users made each recommendation, and that strength is the whole point of the signal — a show 500
 * people recommended off the back of something you loved is a far better bet than one 1 person
 * did. `log1p` keeps a single runaway blockbuster from drowning out everything else while still
 * ranking strong recommendations above weak ones.
 */
export function tallyMalRecommendations(sources: RecommendationSource[]): Map<number, number> {
  const tally = new Map<number, number>();
  for (const source of sources) {
    const weight = source.liked ? LIKED_WEIGHT : DEFAULT_WEIGHT;
    for (const ref of source.recommended) {
      const strength = Math.log1p(Math.max(0, ref.numRecommendations));
      tally.set(ref.id, (tally.get(ref.id) ?? 0) + weight * strength);
    }
  }
  return tally;
}

export interface GenreProfileSource {
  liked: boolean;
  genres: string[];
}

/**
 * Builds a genre -> weight profile from the user's watched series, `liked` ones counting for more.
 *
 * Each genre's raw weight is divided by how many of the user's series carry it — a
 * TF-IDF-style correction. Without it the profile mostly measures "is this anime mainstream":
 * nearly everything is tagged Action or Comedy, so those accumulate the largest weights and end up
 * dominating, which is the opposite of useful. Dividing through means a rare match (Psychological,
 * Historical) says more about taste than yet another Action hit.
 */
export function buildGenreAffinity(sources: GenreProfileSource[]): Map<string, number> {
  const weighted = new Map<string, number>();
  const seriesCount = new Map<string, number>();
  for (const source of sources) {
    const weight = source.liked ? LIKED_WEIGHT : DEFAULT_WEIGHT;
    for (const genre of source.genres) {
      weighted.set(genre, (weighted.get(genre) ?? 0) + weight);
      seriesCount.set(genre, (seriesCount.get(genre) ?? 0) + 1);
    }
  }

  const affinity = new Map<string, number>();
  for (const [genre, total] of weighted) {
    affinity.set(genre, total / (seriesCount.get(genre) ?? 1));
  }
  return affinity;
}

/**
 * How well one candidate's genres line up with the user's affinity profile — the *mean* affinity
 * across its genres, not the sum. Summing rewarded candidates simply for carrying more tags: an
 * 8-genre show would out-score a 2-genre show mechanically, regardless of how well either matched.
 */
export function scoreGenreOverlap(candidateGenres: string[], affinity: Map<string, number>): number {
  if (candidateGenres.length === 0) return 0;
  const total = candidateGenres.reduce((sum, genre) => sum + (affinity.get(genre) ?? 0), 0);
  return total / candidateGenres.length;
}

export interface RecommendationCandidate {
  id: number;
  genres: string[];
  /** Other MAL ids this candidate is directly related to (prequel/sequel/side-story/etc.). */
  relatedIds: number[];
}

/** A candidate is excluded if it's already tracked, or it's a dropped series' relative — CLAUDE.md's
 * "exclude anything already in the list or related to dropped shows". */
export function isExcludedCandidate(
  candidate: RecommendationCandidate,
  trackedMalIds: Set<number>,
  droppedMalIds: Set<number>,
): boolean {
  if (trackedMalIds.has(candidate.id)) return true;
  if (droppedMalIds.has(candidate.id)) return true;
  return candidate.relatedIds.some((id) => droppedMalIds.has(id));
}

// How much each half of CLAUDE.md §7 contributes once both are on a 0..1 scale. The MAL tally is
// weighted higher because it reflects what real MAL users said about shows this user actually
// watched, whereas genre affinity is a much blunter instrument.
const MAL_TALLY_WEIGHT = 0.6;
const GENRE_WEIGHT = 0.4;

/** Scales values to 0..1 against the largest one present, so a max-scoring candidate gets 1. */
function normalize(values: Map<number, number>): Map<number, number> {
  const max = Math.max(0, ...values.values());
  if (max === 0) return new Map(Array.from(values.keys(), (id) => [id, 0]));
  return new Map(Array.from(values, ([id, value]) => [id, value / max]));
}

/**
 * Combines the MAL tally and genre-overlap scores, drops anything with no signal at all, and sorts
 * best-first. Candidates should already be exclusion-filtered (see isExcludedCandidate).
 *
 * Both halves are normalized to 0..1 *before* being combined, which matters more than it looks:
 * the two are naturally on wildly different scales (a MAL tally lands in the single digits while
 * raw genre affinity summed into the hundreds), so adding them raw let genre silently swamp the
 * MAL signal almost entirely — the feature was effectively genre-only ranking despite the spec
 * describing two contributions. Normalizing first is what makes the weights below mean anything.
 */
export function rankCandidates(
  candidates: RecommendationCandidate[],
  malTally: Map<number, number>,
  genreAffinity: Map<string, number>,
): { id: number; score: number }[] {
  const rawMal = new Map(candidates.map((c) => [c.id, malTally.get(c.id) ?? 0]));
  const rawGenre = new Map(candidates.map((c) => [c.id, scoreGenreOverlap(c.genres, genreAffinity)]));
  const normalizedMal = normalize(rawMal);
  const normalizedGenre = normalize(rawGenre);

  return candidates
    .map((c) => ({
      id: c.id,
      score:
        MAL_TALLY_WEIGHT * (normalizedMal.get(c.id) ?? 0) + GENRE_WEIGHT * (normalizedGenre.get(c.id) ?? 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
