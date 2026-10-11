// The candidate generator's round trip — plan 1 step 7. Turns the stored taste profile into MAL
// ids that RecommendationRepository can rank beside its deterministic candidates.
//
// This is the only half of the recommendation pipeline that can produce a show MAL's own
// recommendation graph never links to the user's library (PRD success criterion 4). Everything
// else there starts from `anime/{id}?fields=recommendations` on a series the user already has,
// which is by construction a walk of a graph they are already inside.
//
// The sequence, and where each decision lives:
//
//   1. read the stored profile          — TasteProfileRepository (no profile: don't run)
//   2. build the payload                — src/domain/candidateGenerator (refuses without consent)
//   3. ask the model                    — supabase/functions/taste-candidates (holds the key)
//   4. drop the useless suggestions     — src/domain/candidateGenerator
//   5. resolve each title through MAL    — here, cached by apiCache under resolve:v1:<normalized>
//   6. keep only close matches          — src/domain/candidateGenerator
//
// **Nothing here throws.** Every failure — no profile, no consent, no key, the daily ceiling, a
// provider outage, a search that times out — comes back as a notice string beside an empty id
// list, and the deterministic recommendations render exactly as they did before this step existed.
// That is the PRD's degrade path, and the reason it is a return value rather than an exception is
// that fetchRecommendations starts this concurrently with its own fetching: a rejected promise
// nobody is awaiting yet is an unhandled rejection, not a degrade path.
import { mapWithConcurrency } from '@/api/concurrency';
import { searchAnime } from '@/api/malDataApi';
import { callTasteCandidates } from '@/api/edgeFunctions';
import {
  acceptableSuggestions,
  buildGeneratorPayload,
  normalizeTitle,
  pickTitleMatch,
  type ResolutionCandidate,
} from '@/domain/candidateGenerator';
import type { Series } from '@/domain/series';
import { getPrivacyConsentedAtOnce } from './AnimeRepository';
import { getTasteProfileOnce } from './TasteProfileRepository';
import { getTitleResolutionCached } from './apiCache';

/** What the generator contributes to one recommendation run. */
export interface GeneratedCandidates {
  /** MAL ids that survived the resolution gate. Empty whenever `notice` is set. */
  malIds: number[];
  /**
   * One line for the screen, or null when the generator ran and produced something. The PRD asks
   * for this specifically: without it, "the provider is down" and "the model had dull ideas" look
   * identical from the user's chair, and the list silently stops being what it claims to be.
   */
  notice: string | null;
}

// The three notices, written out rather than assembled, because each one tells the user a
// different thing to do (or not do) about it.
const NOTICE_NO_PROFILE = 'Describe your taste above to get fresh picks the deterministic ranking can’t find.';
const NOTICE_UNAVAILABLE = 'Showing standard recommendations — fresh picks couldn’t be generated just now.';
const NOTICE_NO_MATCHES = 'Showing standard recommendations — none of this round’s fresh picks could be found on MAL.';

// One MAL search per suggestion, so at most MAX_GENERATED_TITLES (12) of them. Matched to
// Recommendations' own fetch concurrency rather than Discover/Import's 8: this runs while the
// user watches a spinner, and guardrail #3 asks us not to hammer MAL in tight loops, not to
// throttle a single user-triggered burst. A warm resolve cache makes most of these free anyway.
const RESOLVE_CONCURRENCY = 6;

/**
 * One MAL search, turned into the id the suggested title really means — or `{ malId: null }` when
 * nothing matched closely enough, which is cached just as a hit is (see getTitleResolutionCached).
 *
 * Every alternative title MAL returns is offered to the gate, not just the main one: MAL's `title`
 * is romaji and the model answers in English, so the English alternative is usually the only one
 * that can match at all.
 */
async function resolveOne(title: string, bypassCache?: boolean): Promise<number | null> {
  const normalized = normalizeTitle(title);
  if (!normalized) return null;
  const { malId } = await getTitleResolutionCached(
    normalized,
    async () => {
      const response = await searchAnime(title);
      const candidates: ResolutionCandidate[] = response.data.map((entry) => ({
        id: entry.node.id,
        titles: [
          entry.node.title,
          entry.node.alternative_titles?.en,
          ...(entry.node.alternative_titles?.synonyms ?? []),
        ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0),
      }));
      const match = pickTitleMatch(title, candidates);
      return { malId: match?.id ?? null };
    },
    { bypass: bypassCache },
  );
  return malId;
}

/**
 * Asks the model for shows to try, and returns the ones MAL confirms exist.
 *
 * `library` is passed in rather than read here because fetchRecommendations has already read it —
 * one library read per recommendation run, not two, on a backend where each is a real round trip.
 *
 * The obscurity ceiling is deliberately *not* applied here. It needs `num_list_users`, which comes
 * from the per-anime detail call RecommendationRepository is about to make for every candidate
 * anyway; filtering here would mean fetching the same detail twice. See the `modelPicks`
 * construction there.
 */
export async function fetchGeneratedCandidates(
  library: Series[],
  opts?: { bypassCache?: boolean },
): Promise<GeneratedCandidates> {
  try {
    const profile = await getTasteProfileOnce();
    // Not a failure, and said as its own notice: there is nothing wrong, the user simply hasn't
    // asked for a profile yet. Generating one unprompted would fire a model call on a screen load,
    // which the PRD rules out — the profile is the user's to ask for and to disagree with.
    if (!profile) return { malIds: [], notice: NOTICE_NO_PROFILE };

    const consentedAt = await getPrivacyConsentedAtOnce();
    // Throws without consent (the client-side half of the gate); the Edge Function re-checks it.
    const payload = buildGeneratorPayload(profile, library, consentedAt);

    const { titles } = await callTasteCandidates(payload);
    const worthResolving = acceptableSuggestions(titles, payload.exclude);
    if (worthResolving.length === 0) return { malIds: [], notice: NOTICE_NO_MATCHES };

    // Best-effort per title, exactly like the candidate-detail loop in RecommendationRepository: a
    // single search that fails or times out costs that one suggestion, not the whole round.
    const resolved = await mapWithConcurrency(worthResolving, RESOLVE_CONCURRENCY, async (title) => {
      try {
        return await resolveOne(title, opts?.bypassCache);
      } catch {
        return null;
      }
    });

    // Deduped: two different suggestions can resolve to the same show, and MAL ids are what the
    // rest of the pipeline keys on.
    const malIds = Array.from(new Set(resolved.filter((id): id is number => id !== null)));
    if (malIds.length === 0) return { malIds: [], notice: NOTICE_NO_MATCHES };
    return { malIds, notice: null };
  } catch {
    // Everything from here is one outcome as far as the user is concerned: the picks didn't
    // happen, the rest of the list still works. The specific reason (no key, daily ceiling,
    // provider 502, no consent) is deliberately not surfaced — it is either not actionable or not
    // theirs to act on, and a one-line notice is what the PRD asks for.
    return { malIds: [], notice: NOTICE_UNAVAILABLE };
  }
}
