// The candidate generator's pure half — plan 1 step 7. Everything a model suggestion has to
// survive before it can become a recommendation lives here: what gets sent, which suggestions are
// worth a MAL search at all, whether a search result is really the show that was named, and
// whether that show is obscure enough to be worth suggesting.
//
// Why a gate rather than trust: a model asked for anime titles will occasionally invent one, and
// will more often name a real show slightly wrong. Both would otherwise reach the UI as a card
// claiming facts about something that doesn't exist. Resolving every suggested title through MAL
// search and discarding anything that doesn't match closely turns hallucination from a correctness
// bug into a yield problem — the PRD's settled decision, and the reason none of the model's own
// words ever reach a recommendation card (success criterion 5).
//
// The division of labour mirrors step 6's: this file decides, src/repositories/
// GeneratedCandidateRepository.ts sequences the network calls, and supabase/functions/
// taste-candidates holds the key and nothing else.
import type { Series } from './series';
import type { TasteProfile } from './tasteProfile';

/**
 * Exactly what leaves the app for the generator, and nothing else: the profile the model itself
 * wrote last time, plus the titles it must not suggest. Both are strings already sitting in our
 * own Postgres — the same basis as step 6's payload, and the same reason it satisfies the PRD's
 * reading of MAL agreement §3(a)(vii): no MAL API response is involved, our database sits between
 * the API and the model.
 */
export interface GeneratorPayload {
  profile: TasteProfile;
  /** Every title the user already tracks, so the model doesn't spend its suggestions on them. */
  exclude: string[];
}

/**
 * How many of the model's suggestions are acted on. This is a MAL request budget before it is
 * anything else: each accepted suggestion costs one search call (guardrail #3), so an unbounded
 * list would let one generation fan out into a hundred requests. Twelve is roughly a fifth of
 * MAX_RECOMMENDATIONS — enough that the discovery half is visible in the final list, few enough
 * that it cannot take the list over from the deterministic halves that earned their places.
 */
export const MAX_GENERATED_TITLES = 12;

/**
 * How close a MAL search result has to be to the suggested title to count as that show.
 *
 * 0.85 on the Dice coefficient below means, concretely: every word of a short title must match,
 * and a long title may carry one extra word but not a wrong one. It deliberately rejects
 * near-misses that are real shows — "Steins;Gate 0" against a suggestion of "Steins;Gate" scores
 * 0.8 and is refused — because accepting a sequel in place of the show that was named is exactly
 * the wrong-show match this threshold exists to catch, and the cost of refusing is one lost
 * suggestion rather than a card describing a different anime.
 *
 * A starting value, tuned against nothing yet (PRD open question 4). Raising it costs yield;
 * lowering it buys yield with accuracy.
 */
export const TITLE_MATCH_THRESHOLD = 0.85;

/**
 * The audience-size ceiling, in MAL list members. Above this a show is famous enough that the
 * user has almost certainly already heard of it, which makes it a wasted suggestion however well
 * it fits — "a list of the same famous shows" is the failure this step's own check looks for.
 *
 * The prompt asks for obscurity too, but a prompt instruction is unverifiable; this is the half
 * that can be tested, and it is what success criterion 8 (the median `num_list_users` of what the
 * user actually adds going down) is measured against.
 *
 * 800,000 excludes essentially all of MAL's top hundred by membership while leaving the
 * well-regarded non-blockbuster band — roughly 200k–700k members, where most of this feature's
 * value lives — untouched. Another starting value; PRD open question 4 again.
 */
export const MAX_LIST_USERS = 800_000;

/**
 * Whether a resolved show is obscure enough to suggest. An *unknown* member count is kept rather
 * than dropped, matching `isUnreleased` and `meetsMinimumEpisodes`: this app fails in the
 * direction that doesn't silently hide things. The case that actually arises is a detail row
 * cached before `num_list_users` was requested, where dropping would hide every suggestion for a
 * whole 30-day TTL and look exactly like a broken generator.
 */
export function isWithinObscurityCeiling(numListUsers: number | null | undefined): boolean {
  if (numListUsers == null) return true;
  return numListUsers <= MAX_LIST_USERS;
}

/**
 * Builds the generator payload, refusing without consent for the same reason buildTastePayload
 * does: this is the last gate in front of data leaving the app, and "send nothing" must not be the
 * same code path as "refuse to proceed" — one of those silently succeeds. The Edge Function
 * re-checks consent server-side, so neither gate failing alone can send a library anywhere.
 *
 * The exclusion list is every tracked series, not only the watched ones: a suggestion the user is
 * already part-way through is as useless as one they have finished. Sorted, so the same library
 * produces a byte-identical body from two devices.
 */
export function buildGeneratorPayload(
  profile: TasteProfile,
  library: Series[],
  privacyConsentedAt: string | null,
): GeneratorPayload {
  if (!privacyConsentedAt) {
    throw new Error('Cannot generate recommendations before the privacy notice has been accepted.');
  }
  return {
    profile,
    exclude: library.map((s) => s.title).sort(),
  };
}

/**
 * A title reduced to what two spellings of the same show have in common: lowercase, no accents, no
 * punctuation, single-spaced. This is both the comparison basis below and the
 * `resolve:v1:<normalized>` cache key segment, which is why it lives here rather than in the cache
 * — two suggestions differing only in punctuation ("Steins;Gate" and "Steins Gate") must share one
 * cached resolution, or the cache is defeated by the model's own formatting choices.
 */
export function normalizeTitle(title: string): string {
  return (
    title
      .normalize('NFD')
      // Strip combining accents, so "Jūni" folds to "juni" and compares equal to the plain romaji.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Anything that isn't a letter or digit becomes a separator: MAL and a model disagree
      // constantly about colons, semicolons, hyphens and exclamation marks inside one title.
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/** The distinct words of a normalized title. Empty for a title that normalizes to nothing. */
function tokensOf(title: string): Set<string> {
  const normalized = normalizeTitle(title);
  if (!normalized) return new Set();
  return new Set(normalized.split(' '));
}

/**
 * How alike two titles are, 0..1 — the Sorensen-Dice coefficient over their word sets:
 * `2 x shared / (|a| + |b|)`.
 *
 * Chosen over an edit distance for two reasons. It is indifferent to word order and punctuation,
 * which is where MAL and a model disagree most; and it is derivable on paper from its inputs,
 * which is what lets this gate's tests state their expected figures instead of recording whatever
 * the implementation happened to return (CLAUDE.md's standing rule). Its cost is that it cannot
 * see a typo inside a word — "Monstar" against "Monster" scores 0 — which is a yield loss rather
 * than a correctness one, and so the right way round.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = tokensOf(a);
  const right = tokensOf(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/** One MAL search result, as much of it as the gate needs: the id, and every name MAL knows it by. */
export interface ResolutionCandidate {
  id: number;
  /** The main title plus any alternative titles — a model may name a show by any of them. */
  titles: string[];
}

/**
 * The MAL id the suggested title really means, or null if nothing matched closely enough.
 *
 * Every name MAL holds for a result is compared, not just its main `title`: MAL's main title is
 * romaji ("Sousou no Frieren") while a model asked for anime will usually answer with the English
 * one, and the app itself displays English wherever MAL has it (src/domain/title.ts). Comparing
 * only the main title would reject most correct suggestions.
 *
 * The best match wins rather than the first one over the threshold, because MAL's search ranks by
 * its own relevance and routinely puts a spin-off or a recap film above the show itself.
 */
export function pickTitleMatch(
  suggested: string,
  candidates: ResolutionCandidate[],
): { id: number; similarity: number } | null {
  let best: { id: number; similarity: number } | null = null;
  for (const candidate of candidates) {
    for (const title of candidate.titles) {
      const similarity = titleSimilarity(suggested, title);
      if (similarity >= TITLE_MATCH_THRESHOLD && (best === null || similarity > best.similarity)) {
        best = { id: candidate.id, similarity };
      }
    }
  }
  return best;
}

/**
 * Which of the model's suggestions are worth a MAL search: deduplicated by normalized title,
 * stripped of anything already in the library, and capped at MAX_GENERATED_TITLES.
 *
 * The exclusion pass duplicates what the prompt already asks for, and it has to. The model is
 * handed the library and told not to suggest it; it will anyway, and each one it does would
 * otherwise cost a MAL search to resolve and then be thrown away by the pipeline's own tracked-id
 * exclusion. Catching them here is the difference between spending the budget on discovery and
 * spending it confirming what the user already has.
 *
 * Order is the model's own — it is asked for its strongest suggestions first, so the cap takes the
 * head of the list rather than a sample of it.
 */
export function acceptableSuggestions(suggested: string[], excludeTitles: string[]): string[] {
  const excluded = new Set(excludeTitles.map(normalizeTitle).filter((t) => t.length > 0));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const title of suggested) {
    const normalized = normalizeTitle(title);
    if (!normalized || excluded.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(title.trim());
    if (out.length === MAX_GENERATED_TITLES) break;
  }
  return out;
}
