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
 * The third section, Future releases, is the entries there's nothing to watch *yet*. Checked before
 * the kind split, so an unreleased film doesn't sit under Movies either. Without it, a season
 * announced years ahead sat at the top of Catch up as if it were something the user had skipped,
 * which is exactly the nagging the list is supposed to avoid. They stay listed rather than hidden:
 * "coming, nothing to do" is genuinely useful, it just isn't a backlog.
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

/**
 * Nothing to watch yet (see splitCatchUpByKind).
 *
 * `airingStatus` is the real signal: it's MAL's own `status` field, mapped at every import/discover
 * boundary (see mapAiringStatus) and stored per entry, and it's what AiringBadge already reads on
 * Series Detail. This used to key off `episodeCount <= 0` instead — a proxy, on the reasoning that
 * MAL can't count episodes that don't exist yet. That's usually true but it isn't what the field
 * means, and it misfiled any entry MAL happened to publish a zero count for.
 *
 * The zero-episode case is kept as a fallback rather than dropped, because mapAiringStatus defaults
 * an absent status to FINISHED: an entry whose status MAL omitted would otherwise land in the
 * backlog as something the user had skipped, which is the exact nagging this section prevents.
 * Treating "no episodes yet" as still-unreleased fails in the safer direction.
 */
function isUnreleased(entry: SeriesEntry): boolean {
  return entry.airingStatus === 'NOT_YET_AIRED' || entry.episodeCount <= 0;
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

// How hard diversification pushes back against a one-note list. Each slot's pick is scored
// `score − lambda × maxSimilarity(to what's already picked)`, so lambda is denominated in the same
// 0..1 units rankCandidates emits: at 0.3, a candidate whose genres are *identical* to something
// already picked gives up 0.3 of its score, while a genuinely different one gives up nothing.
//
// 0.3 rather than something larger because the scores coming out of rankCandidates are bunched —
// the gap between rank 1 and rank 20 is often less than 0.2 — so a lambda near 1 would reorder
// almost entirely on novelty and start promoting candidates the user has no signal for at all.
// That is the failure mode the step's check watches for ("top entries now obviously worse fits").
const DIVERSITY_LAMBDA = 0.3;

/** A ranked candidate plus the genres diversification judges similarity on. */
export interface DiversifiableCandidate {
  id: number;
  score: number;
  genres: string[];
}

/**
 * Genre overlap between two candidates as a Jaccard index — shared genres over total distinct
 * genres, 0 (nothing in common) to 1 (identical sets).
 *
 * Jaccard rather than a raw count of shared genres because the count rewards breadth: two 8-genre
 * shows sharing 3 tags would look more alike than two 2-genre shows sharing both, which is
 * backwards. A candidate with no genres at all scores 0 against everything rather than NaN — MAL
 * does return empty genre arrays, and the safe reading of "we know nothing about this one" is
 * "don't penalize it", matching how isUnreleased and the episode filter both fail toward showing
 * things rather than hiding them.
 */
function genreSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const genre of setA) if (setB.has(genre)) shared++;
  const union = setA.size + setB.size - shared;
  return union === 0 ? 0 : shared / union;
}

/**
 * Re-orders an already-ranked list so the top of it isn't one genre cluster — greedy MMR (maximal
 * marginal relevance).
 *
 * Why this exists: rankCandidates is pure score order, and score is "how well does this one fit
 * the profile". Each individual answer is right and the list as a whole is useless — a library
 * with three shonen in it scores sixty shonen highest, so the user scrolls sixty variations of
 * what they've already watched. Diversity is a property of the *list*, which no per-candidate
 * score can express, so it has to be imposed at selection time.
 *
 * The algorithm: take the highest scorer outright, then fill each remaining slot with whichever
 * candidate maximizes `score − lambda × maxSimilarity(to everything already picked)`. Similarity
 * is against the *most* similar pick, not the average — the question being asked is "is this
 * basically a repeat of something up there already", and one near-duplicate is enough for it to be.
 *
 * Nothing is dropped; the whole list comes back re-ordered, so the caller's own slice decides how
 * much of it is shown. Ties fall to the higher raw score, which is the input order, making this
 * stable: identical candidates keep their relative positions instead of shuffling run to run.
 *
 * O(n²) in the candidate count, which is bounded by MAX_CANDIDATE_DETAILS (80) — a few thousand
 * set comparisons, nowhere near worth optimizing.
 *
 * `lambda` is a parameter rather than only a constant so a test can state the value its expected
 * order was derived from on paper; production always uses the default.
 */
export function diversifyRanked<T extends DiversifiableCandidate>(
  ranked: T[],
  lambda: number = DIVERSITY_LAMBDA,
): T[] {
  if (ranked.length <= 2) return [...ranked];

  const remaining = [...ranked];
  // The input is already score-sorted, so the first element is the outright best fit and is taken
  // as-is: MMR has nothing to be diverse against yet, and the top pick should be the one the
  // profile actually likes most.
  const picked: T[] = [remaining.shift()!];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      let maxSimilarity = 0;
      for (const chosen of picked) {
        const similarity = genreSimilarity(candidate.genres, chosen.genres);
        if (similarity > maxSimilarity) maxSimilarity = similarity;
      }
      const value = candidate.score - lambda * maxSimilarity;
      // Strictly greater, so a tie keeps the earlier (higher-scoring) candidate — see "stable" above.
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    picked.push(remaining.splice(bestIndex, 1)[0]);
  }

  return picked;
}
