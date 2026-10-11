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

/** One source series' own MAL recommendations, already filtered to ids worth considering. */
export interface SourceCandidatePool {
  recommended: RecommendedRef[];
}

/**
 * Chooses which candidate ids are worth spending a detail fetch on, by giving every source series
 * a turn instead of letting the biggest ones spend the whole budget.
 *
 * Why this exists: the budget is real (one MAL `anime/{id}` call per candidate, see
 * MAX_CANDIDATE_DETAILS) and a watched library easily tallies 200+ unique candidates, so something
 * has to be cut. This used to be a single global sort by MAL tally, which meant popularity decided
 * the pool *before taste was ever consulted* — and because a blockbuster contributes hundreds of
 * strongly-recommended candidates while an obscure favourite contributes ten weakly-recommended
 * ones, the top 80 came almost entirely from the user's two or three biggest shows. Nothing the
 * obscure series recommended was ever scored at all, let alone ranked, so no amount of fixing the
 * ranking downstream could surface it.
 *
 * Round-robin fixes that at the only place it can be fixed: every series contributes its own best
 * candidate, then its second best, and so on until the budget runs out. The number of MAL calls is
 * unchanged — it is the same 80, drawn from across the library rather than off the top of it.
 *
 * Within a series, "best" is that series' *own* `num_recommendations`, not the global tally: the
 * question being asked of each series in turn is "of the shows you point at, which do MAL's users
 * point at hardest", which is a judgement about that series alone. The global tally still decides
 * *ranking* afterwards (see rankCandidates) — it just no longer decides who gets to be ranked.
 *
 * Turns are equal, and a `liked` series gets no larger quota, even though liked counts for extra
 * weight elsewhere. That weight already applies twice downstream, in the tally and the genre
 * profile; applying it a third time here would spend the breadth budget on preference, which is
 * the exact failure being fixed. This stage is about *who gets heard*, not who wins.
 *
 * Pool order is the caller's and decides only who gets the extra pick in a final partial round, so
 * the result is deterministic for a given library rather than shuffling between runs.
 */
export function selectCandidatePool(pools: SourceCandidatePool[], budget: number): number[] {
  // Each series' own candidates, strongest-first by that series' num_recommendations. Sorted once
  // up front and then walked by cursor, so the round-robin below stays O(total candidates).
  const queues = pools.map((pool) =>
    [...pool.recommended].sort((a, b) => b.numRecommendations - a.numRecommendations),
  );
  const cursors = queues.map(() => 0);

  const picked: number[] = [];
  const claimed = new Set<number>();
  // Stops the moment a whole pass claims nothing, which is how "every pool is exhausted" is
  // detected without recounting what is left in each one.
  let progressed = true;

  while (picked.length < budget && progressed) {
    progressed = false;
    for (let i = 0; i < queues.length && picked.length < budget; i++) {
      const queue = queues[i];
      // Advance past anything another series already claimed. Skipping rather than forfeiting the
      // turn matters: candidates overlap heavily between related shows, so a series whose top few
      // recommendations are all shared with a bigger one would otherwise contribute nothing.
      while (cursors[i] < queue.length && claimed.has(queue[cursors[i]].id)) cursors[i]++;
      if (cursors[i] >= queue.length) continue;

      const ref = queue[cursors[i]++];
      claimed.add(ref.id);
      picked.push(ref.id);
      progressed = true;
    }
  }

  return picked;
}

export interface GenreProfileSource {
  liked: boolean;
  genres: string[];
}

/** A series the user dropped. No `liked` field - CLAUDE.md only lets a *watched* series be liked. */
export interface DroppedProfileSource {
  genres: string[];
}

// How hard a tag the user reliably bails on counts against a candidate.
//
// 1.0 is symmetric - a tag dropped every time it appeared is exactly as repellent (-1) as a tag
// watched every time is attractive (+1) - but the real reason for it is that 1.0 is the largest
// value preserving a guarantee worth having: a tag the user has watched *anything* in can be
// neutralised but never inverted. The proof is short. A watched tag's positive term is at least 1,
// and its drop rate is strictly below 1 whenever any carrying series was watched, so the result
// stays strictly above `1 - droppedWeight`; at 1.0 that floor is 0. Above 1.0 a tag the user
// mostly finishes can be driven negative, which is precisely the `Shounen` wipe-out the PRD's
// step-0 finding warns about. So treat this as a ceiling, not just a starting value: if drops feel
// over-weighted against the real library, tune it down, never up.
const DROPPED_GENRE_WEIGHT = 1.0;

/**
 * Builds a genre -> weight profile from the user's watched series, minus what their *dropped*
 * series say they bail on. `liked` watched series count for more.
 *
 * The positive half is a genre's accumulated weight divided by how many of the user's series carry
 * it, so the value is the mean weight per carrying series. Note what that does and doesn't do: it
 * cancels frequency rather than correcting for it, so in a library with no `liked` series every
 * watched tag lands at exactly 1.0, and all the profile then distinguishes is which tags appear in
 * the library at all (raised where the user liked the series carrying them). That is blunter than
 * it looks and worth revisiting, but changing it alters the positive half's behaviour and is not
 * this function's business today.
 *
 * The negative half is a drop *rate*, not a drop count: a tag's penalty is the share of the series
 * carrying it that the user dropped, `dropped / (watched + dropped)`. A count would be frequency-
 * blind in the way that actually hurts - dropping 1 Isekai out of 21 would read exactly like
 * dropping 20 out of 21, since both are just "Isekai appears among your dropped series". The rate
 * says the useful thing instead: how often, when you meet this kind of show, do you bail on it.
 *
 * That shape is also what protects the broad tags. MAL's `genres` is one flat list mixing Genres,
 * Themes and Demographics (settled 2026-10-11 - see the PRD), so `Shounen` and `Award Winning` sit
 * in it carrying almost no taste at all, and a careless negative profile would wipe out `Shounen`
 * for a user who drops the occasional shonen among the fifty they finish. A rate cannot: a tag you
 * mostly watch has a low drop rate by construction, so it stays strongly positive, while a tag you
 * *only* ever dropped takes the full penalty.
 *
 * Per-tag values run from `-droppedWeight`, for a tag the user has *only* ever dropped, up to
 * +LIKED_WEIGHT, for one where every carrying series was liked and none dropped. In between, any
 * tag with at least one watched series stays strictly above `1 - droppedWeight` - at the default
 * weight, strictly positive - so a drop can neutralise such a tag but never invert it. See
 * DROPPED_GENRE_WEIGHT for why that bound is the reason the default is what it is. A tag the user
 * has never met at all is absent from the map, which scoreGenreOverlap reads as 0.
 *
 * `droppedWeight` is a parameter for the same reason diversifyRanked's lambda is: so a test can
 * state the value its expected numbers were derived from. Production always uses the default.
 */
export function buildGenreAffinity(
  sources: GenreProfileSource[],
  dropped: DroppedProfileSource[] = [],
  droppedWeight: number = DROPPED_GENRE_WEIGHT,
): Map<string, number> {
  const weighted = new Map<string, number>();
  const watchedCount = new Map<string, number>();
  for (const source of sources) {
    const weight = source.liked ? LIKED_WEIGHT : DEFAULT_WEIGHT;
    for (const genre of source.genres) {
      weighted.set(genre, (weighted.get(genre) ?? 0) + weight);
      watchedCount.set(genre, (watchedCount.get(genre) ?? 0) + 1);
    }
  }

  const droppedCount = new Map<string, number>();
  for (const source of dropped) {
    // Deduped per series, unlike the positive loop above, which doesn't need it: there `weighted`
    // and `watchedCount` are incremented together, so a repeated tag cancels in the division. A
    // repeat here would inflate the numerator of a rate whose denominator counts series, pushing
    // the penalty past its intended ceiling. MAL doesn't repeat a tag, but the two halves fail
    // differently and only one of them fails safely.
    for (const genre of new Set(source.genres)) {
      droppedCount.set(genre, (droppedCount.get(genre) ?? 0) + 1);
    }
  }

  const affinity = new Map<string, number>();
  for (const genre of new Set([...weighted.keys(), ...droppedCount.keys()])) {
    const watched = watchedCount.get(genre) ?? 0;
    const bailed = droppedCount.get(genre) ?? 0;
    const positive = watched === 0 ? 0 : (weighted.get(genre) ?? 0) / watched;
    const dropRate = bailed === 0 ? 0 : bailed / (watched + bailed);
    affinity.set(genre, positive - droppedWeight * dropRate);
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
  // Every candidate at or below zero: there is no positive reference to scale against, so this half
  // contributes nothing and the other one decides. Only reachable on the genre side, and only for a
  // user whose dropped series condemn every candidate in the pool.
  if (max === 0) return new Map(Array.from(values.keys(), (id) => [id, 0]));
  // Floored at -1 because a genre score can now be negative (see buildGenreAffinity) while `max` is
  // whatever the best candidate managed, and those two are independent. A pool whose best candidate
  // scores 0.05 and whose worst scores -1 would normalize the worst to -20, and 0.4 x -20 would
  // swamp the MAL half entirely - destroying the scale-matching this function exists to provide.
  // The floor keeps the output in -1..1, so either half can move a combined score by at most its
  // own weight.
  return new Map(Array.from(values, ([id, value]) => [id, Math.max(-1, value / max)]));
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
    // Drops no-signal candidates and, now that genre affinity can go negative, net-negative ones
    // too: a candidate built from tags the user demonstrably bails on shouldn't be shown just
    // because MAL's tally likes it. That is the whole point of learning from dropped series.
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
