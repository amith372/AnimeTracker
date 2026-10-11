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

/**
 * The thresholds the "For you" length filter offers. Presets rather than a free number: the point
 * is "is this a short or a long commitment", which three cut points answer, and a typed box would
 * need a keyboard on a screen that otherwise has none. 12 is one cour, 24 two, 50 the long-runner
 * mark (Hunter x Hunter, Bleach, Fullmetal Alchemist all sit above it).
 *
 * 0 means "Any" — no filter — so it doubles as the off switch and meetsMinimumEpisodes can take it
 * without the caller special-casing an undefined.
 */
export const MIN_EPISODE_THRESHOLDS = [0, 12, 24, 50] as const;
export type MinEpisodeThreshold = (typeof MIN_EPISODE_THRESHOLDS)[number];

/**
 * Whether a recommended series is long enough to pass an active minimum-episode filter.
 *
 * Length is the **sum of `episodeCount` across `TV_SEASON` entries only** — the question the filter
 * answers is "how many hours of television is this", and a film that happens to hang off the series
 * isn't television. Three deliberate consequences, each the subject of a test below:
 *
 *  - **A series with no TV seasons at all is exempt**, never filtered out. A standalone movie would
 *    otherwise total 0 and vanish from every threshold above Any, which would make the Movies
 *    section empty the moment the filter was touched — the filter is about TV length, so it has
 *    nothing to say about a film.
 *  - **An unknown count can never hide a series.** MAL publishes `num_episodes: 0` for anything
 *    announced-but-unaired and for some currently-airing shows, so a season with no count makes the
 *    true total unknown, not zero. When the known seasons alone don't reach the threshold but some
 *    season's count is missing, the series is kept: the real total might well clear it, and failing
 *    in the direction that doesn't silently hide things is the same call already written into
 *    `isUnreleased` above.
 *  - **Known counts are summed across seasons**, not judged per season, because "50+ episodes" is a
 *    statement about the whole show — two 25-episode seasons is a 50-episode commitment.
 *
 * Note this counts every TV season, watched or not. A recommendation is by definition a series the
 * user has none of, so there is no watched half to subtract.
 */
export function meetsMinimumEpisodes(series: ReconcileSeries, minEpisodes: number): boolean {
  if (minEpisodes <= 0) return true;
  const tvSeasons = series.entries.filter((e) => e.kind === 'TV_SEASON');
  if (tvSeasons.length === 0) return true;
  const known = tvSeasons.filter((e) => e.episodeCount > 0);
  const knownTotal = known.reduce((sum, e) => sum + e.episodeCount, 0);
  if (knownTotal >= minEpisodes) return true;
  // Short on the known seasons alone — but if any season's count is missing, the total isn't
  // actually known to be short, so keep it rather than hide it.
  return known.length < tvSeasons.length;
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
 * has never met at all is absent from the map, which scoreTagOverlap reads as 0.
 *
 * `droppedWeight` is a parameter for the same reason diversifyRanked's lambda is: so a test can
 * state the value its expected numbers were derived from. Production always uses the default.
 */
export function buildGenreAffinity(
  sources: GenreProfileSource[],
  dropped: DroppedProfileSource[] = [],
  droppedWeight: number = DROPPED_GENRE_WEIGHT,
): Map<string, number> {
  return buildTagAffinity(
    sources.map((s) => ({ liked: s.liked, tags: s.genres })),
    dropped.map((s) => ({ tags: s.genres })),
    droppedWeight,
  );
}

/** One watched series' tags on whichever axis is being profiled. */
export interface TagProfileSource {
  liked: boolean;
  tags: string[];
}

/** One dropped series' tags. No `liked` — CLAUDE.md only lets a *watched* series be liked. */
export interface DroppedTagSource {
  tags: string[];
}

/**
 * The affinity maths behind every tag-shaped taste axis — genre, studio and source all run through
 * this. `buildGenreAffinity` above is the genre-specific entry point and carries the full
 * explanation of both halves; this is the same algorithm with the axis's name taken out of it.
 *
 * Studio and source pass no dropped series, so their profiles are positive-only. That is
 * deliberate and is what the PRD scopes to this step: the negative half was built for genre
 * specifically, where a drop *rate* over a deep ~70-tag vocabulary says something real. Over the
 * handful of studios a library touches, the same rate would be computed from one or two series and
 * would mostly be noise, and `source` has a vocabulary of about ten values, so a single dropped
 * light-novel adaptation would condemn a quarter of everything MAL has. Both axes can grow a
 * negative half later if the positive one proves out; neither gets one on no evidence.
 */
export function buildTagAffinity(
  sources: TagProfileSource[],
  dropped: DroppedTagSource[] = [],
  droppedWeight: number = DROPPED_GENRE_WEIGHT,
): Map<string, number> {
  const weighted = new Map<string, number>();
  const watchedCount = new Map<string, number>();
  for (const source of sources) {
    const weight = source.liked ? LIKED_WEIGHT : DEFAULT_WEIGHT;
    for (const tag of source.tags) {
      weighted.set(tag, (weighted.get(tag) ?? 0) + weight);
      watchedCount.set(tag, (watchedCount.get(tag) ?? 0) + 1);
    }
  }

  const droppedCount = new Map<string, number>();
  for (const source of dropped) {
    // Deduped per series, unlike the positive loop above, which doesn't need it: there `weighted`
    // and `watchedCount` are incremented together, so a repeated tag cancels in the division. A
    // repeat here would inflate the numerator of a rate whose denominator counts series, pushing
    // the penalty past its intended ceiling. MAL doesn't repeat a tag, but the two halves fail
    // differently and only one of them fails safely.
    for (const tag of new Set(source.tags)) {
      droppedCount.set(tag, (droppedCount.get(tag) ?? 0) + 1);
    }
  }

  const affinity = new Map<string, number>();
  for (const tag of new Set([...weighted.keys(), ...droppedCount.keys()])) {
    const watched = watchedCount.get(tag) ?? 0;
    const bailed = droppedCount.get(tag) ?? 0;
    const positive = watched === 0 ? 0 : (weighted.get(tag) ?? 0) / watched;
    const dropRate = bailed === 0 ? 0 : bailed / (watched + bailed);
    affinity.set(tag, positive - droppedWeight * dropRate);
  }
  return affinity;
}

// How many years apart two anime have to be before they count as entirely different eras. 15 is
// one viewing generation: a 2010 show and a 2025 show share almost no production conventions, art
// pipeline or source-material fashion, while a 2010 and a 2018 show plainly do. Linear decay
// between the two, so nothing is a cliff.
const ERA_SPAN_YEARS = 15;

/**
 * The user's era centre — the `liked`-weighted mean start year of their watched series, or null
 * when not one of them has a year on it.
 *
 * Era is handled as a number rather than as tags (a decade bucket, say), unlike every other axis
 * here, for a reason worth stating: era is the one taste axis that is genuinely *ordinal*. 2014 is
 * nearly 2015 in a way that Madhouse is not nearly Bones, so bucketing throws away precisely the
 * information that makes the axis useful, and puts a cliff at a boundary (1999/2000) that means
 * nothing to anybody. A centre plus a distance keeps the ordering and has no boundary at all.
 *
 * It also has no negative half, and not only for the reasons given on buildTagAffinity: nobody
 * drops a show for being from 2013. A drop carries information about its genre and maybe its
 * studio; its year is incidental.
 */
export function buildEraCentre(sources: { liked: boolean; startYear: number | null }[]): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const source of sources) {
    if (source.startYear === null) continue;
    const weight = source.liked ? LIKED_WEIGHT : DEFAULT_WEIGHT;
    weightedSum += weight * source.startYear;
    totalWeight += weight;
  }
  return totalWeight === 0 ? null : weightedSum / totalWeight;
}

/**
 * How close one candidate's year is to the user's era centre: 1 at the centre, falling linearly to
 * 0 at ERA_SPAN_YEARS away and staying there.
 *
 * Returns 0, not a negative number, for anything beyond the span. The other axes can go negative
 * only where the user has demonstrably bailed on something (see buildTagAffinity); being old is
 * not evidence of anything, so the worst an era mismatch can do is contribute nothing.
 */
export function scoreEraCloseness(startYear: number | null, centre: number | null): number {
  if (startYear === null || centre === null) return 0;
  return Math.max(0, 1 - Math.abs(startYear - centre) / ERA_SPAN_YEARS);
}

/**
 * How well one candidate's tags line up with the user's affinity profile on that axis — the *mean*
 * affinity across its tags, not the sum. Summing rewarded candidates simply for carrying more
 * tags: an 8-genre show would out-score a 2-genre show mechanically, regardless of how well either
 * matched. Named for tags rather than genres because all three tag-shaped axes score through it —
 * genres, studios, and `source` as a one-element list.
 */
export function scoreTagOverlap(candidateTags: string[], affinity: Map<string, number>): number {
  if (candidateTags.length === 0) return 0;
  const total = candidateTags.reduce((sum, tag) => sum + (affinity.get(tag) ?? 0), 0);
  return total / candidateTags.length;
}

export interface RecommendationCandidate {
  id: number;
  genres: string[];
  /** Other MAL ids this candidate is directly related to (prequel/sequel/side-story/etc.). */
  relatedIds: number[];
  /** The three axes added alongside genre. All optional, because MAL genuinely omits each of them
   * on some anime — and because a candidate built before the v5 detail cache simply hasn't got
   * them. An absent value makes its axis contribute nothing to this candidate, never a penalty. */
  studios?: string[];
  source?: string | null;
  startYear?: number | null;
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
// watched, whereas an affinity profile is a much blunter instrument.
//
// This split is deliberately *unchanged* by the step that added the studio/source/era axes: that
// step is about how the taste half is computed, not about how much of the answer taste gets to
// decide. Re-tuning both at once would leave no way to tell which change moved the list.
const MAL_TALLY_WEIGHT = 0.6;
const TASTE_WEIGHT = 0.4;

/**
 * What it is worth that the model named a candidate — plan 1 step 7.
 *
 * A generated candidate carries no MAL tally, and that is not a shortcoming but the entire reason
 * it was asked for: the tally can only ever score shows MAL's own recommendation graph links to
 * something the user already has, so a show outside that graph scores zero on 60% of the ranking
 * no matter how well it fits. Without a bonus a model pick could score on taste alone, land below
 * every tallied candidate, and be cut by the MAX_RECOMMENDATIONS slice — the feature would run,
 * cost a model call, and show nothing. Worse, a pick with no genre overlap either would score
 * exactly 0 and be dropped outright by the filter below.
 *
 * 0.5 puts a model pick roughly level with a candidate that half the user's watched library
 * recommends: clearly visible in the list, clearly below the handful of candidates that the tally
 * and the taste profile both agree on. It is added rather than folded into the 0.6/0.4 split so
 * that split keeps meaning what it meant before this step, and so a run with no model picks
 * produces byte-identical scores to the one before it — which is what makes the degrade path
 * testable rather than merely claimed.
 *
 * A starting value, tuned against nothing yet; PRD open question 4, same as the MMR lambda.
 */
const MODEL_PICK_BONUS = 0.5;

// How the taste half divides between its axes. Relative weights, renormalized over whichever axes
// there is actually data for (see rankCandidates), so these are ratios rather than shares.
//
//   genre  0.55 — the majority, and it stays the majority. It is the only axis with a deep
//                 vocabulary (~70-80 tags once Themes and Demographics are counted, settled
//                 2026-10-11) and the only one with a negative half that has been reasoned about
//                 and tested. This step adds colour; it does not hand over the wheel.
//   studio 0.20 — a real signal, because a studio is a house style, but a thin one: most studios
//                 appear once or twice in a library, so a match is as likely to be coincidence as
//                 taste.
//   source 0.15 — about ten possible values, so coarse by construction. Worth having as "this
//                 user finishes manga adaptations and bails on light-novel ones", not as a fine
//                 discriminator.
//   era    0.10 — the weakest, and the most incidental: it largely records *when the user started
//                 watching anime* rather than what they like. It breaks ties and nothing more.
//
// Starting values, tuned against nothing yet — PRD open question 4. They are stated here rather
// than silently inlined precisely so the next person can move them with the reasoning in view.
const AXIS_WEIGHTS = { genre: 0.55, studio: 0.2, source: 0.15, era: 0.1 } as const;

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

/** The taste axes beyond genre. Genre stays a separate positional argument to rankCandidates
 * rather than joining this: it is the one axis that is always present, the one with a negative
 * half, and the only one the ranking had before these three were added. */
export interface TasteAxes {
  studios?: Map<string, number>;
  sources?: Map<string, number>;
  /** From buildEraCentre — a year, not a map, because era is ordinal rather than categorical. */
  eraCentre?: number | null;
}

/**
 * Combines the MAL tally with the taste profile, drops anything with no signal at all, and sorts
 * best-first. Candidates should already be exclusion-filtered (see isExcludedCandidate).
 *
 * Every half is normalized to 0..1 *before* being combined, which matters more than it looks: they
 * are naturally on wildly different scales (a MAL tally lands in the single digits while raw genre
 * affinity summed into the hundreds), so adding them raw let genre silently swamp the MAL signal
 * almost entirely — the feature was effectively genre-only ranking despite the spec describing two
 * contributions. Normalizing first is what makes the weights mean anything.
 *
 * **An axis with no data to judge on is dropped and its weight redistributed** across the axes
 * that do have data, rather than contributing a flat zero. The difference is not cosmetic: a
 * library whose candidates carry no studio credits would otherwise hand a fifth of the taste half
 * to an axis that says nothing about anybody, quietly shrinking the genre signal for no reason.
 * The redistribution is also what makes this change inert where it has no input — before the v5
 * detail cache lands, `studios`/`source` read as undefined and the ranking is *exactly* the
 * previous genre-only one, which is the failure mode the step's own check is written to detect.
 *
 * "Has data to judge on" means both halves of the judgement: the user's profile for that axis is
 * non-empty, *and* at least one candidate carries a value on it. Either alone ranks nothing.
 *
 * `modelPicks` are the ids step 7's generator produced; each gets MODEL_PICK_BONUS added on top of
 * the two normalized halves. An empty set (the default, and what a provider outage leaves behind)
 * makes this function exactly the one that existed before that step.
 */
export function rankCandidates(
  candidates: RecommendationCandidate[],
  malTally: Map<number, number>,
  genreAffinity: Map<string, number>,
  taste: TasteAxes = {},
  modelPicks: ReadonlySet<number> = new Set<number>(),
): { id: number; score: number }[] {
  const rawMal = new Map(candidates.map((c) => [c.id, malTally.get(c.id) ?? 0]));

  // Each axis contributes a weight and a normalized per-candidate score, or nothing at all.
  const axes: { weight: number; scores: Map<number, number> }[] = [];
  function addAxis(
    weight: number,
    profileHasData: boolean,
    candidateHasValue: (c: RecommendationCandidate) => boolean,
    score: (c: RecommendationCandidate) => number,
  ) {
    if (!profileHasData || !candidates.some(candidateHasValue)) return;
    axes.push({ weight, scores: normalize(new Map(candidates.map((c) => [c.id, score(c)]))) });
  }

  addAxis(
    AXIS_WEIGHTS.genre,
    genreAffinity.size > 0,
    (c) => c.genres.length > 0,
    (c) => scoreTagOverlap(c.genres, genreAffinity),
  );
  addAxis(
    AXIS_WEIGHTS.studio,
    (taste.studios?.size ?? 0) > 0,
    (c) => (c.studios?.length ?? 0) > 0,
    (c) => scoreTagOverlap(c.studios ?? [], taste.studios!),
  );
  addAxis(
    AXIS_WEIGHTS.source,
    (taste.sources?.size ?? 0) > 0,
    (c) => c.source != null && c.source !== '',
    (c) => scoreTagOverlap(c.source ? [c.source] : [], taste.sources!),
  );
  addAxis(
    AXIS_WEIGHTS.era,
    taste.eraCentre != null,
    (c) => c.startYear != null,
    (c) => scoreEraCloseness(c.startYear ?? null, taste.eraCentre ?? null),
  );

  const axisWeightTotal = axes.reduce((sum, a) => sum + a.weight, 0);
  const normalizedMal = normalize(rawMal);

  return candidates
    .map((c) => {
      // No axes at all is a real case — a library with no profile yet — and the MAL tally then
      // decides the whole ranking rather than everything collapsing to zero.
      const tasteScore =
        axisWeightTotal === 0
          ? 0
          : axes.reduce((sum, a) => sum + (a.weight / axisWeightTotal) * (a.scores.get(c.id) ?? 0), 0);
      return {
        id: c.id,
        score:
          MAL_TALLY_WEIGHT * (normalizedMal.get(c.id) ?? 0) +
          TASTE_WEIGHT * tasteScore +
          (modelPicks.has(c.id) ? MODEL_PICK_BONUS : 0),
      };
    })
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
