// The taste profile's pure half — plan 1 step 6. Everything here is deterministic and testable:
// which of the user's series count as a verdict, what gets sent to the model, and when a stored
// profile has gone stale. The model call itself is supabase/functions/taste-profile's job, and the
// round trip is TasteProfileRepository's.
//
// Why a model at all, when steps 3 and 5 already rank on genre, studio, source and era: those
// axes can say "likes Action, likes Ufotable, likes manga adaptations". They cannot say "watches a
// lot of shonen but only *loves* slow-burn character drama, and bails on anything built on gag
// comedy" — a distinction between tolerating and seeking out that no amount of tag arithmetic over
// the user's own library expresses. That sentence is what this profile is for, and step 7's
// generator is its only machine-side reader.
import type { Series } from './series';

/**
 * What the model sends back. Free-form descriptors rather than scores or MAL ids, deliberately:
 * every number on the Recommendations screen stays deterministic and unit-tested, and the
 * deterministic ranker keeps working unchanged when no profile exists at all.
 *
 * `summary` is the only field the user reads, and the only model-authored text anywhere in the
 * app. It is confined to this one card on purpose — success criterion 5 bars model text from
 * recommendation cards, where it would read as a fact about a show rather than a guess about the
 * reader.
 */
export interface TasteProfile {
  /** One or two plain sentences describing the reader's taste, shown on the profile card. */
  summary: string;
  /** What they actively seek out — the strongest signal step 7's generator is given. */
  seeksOut: string[];
  /** What they watch but don't love. Distinguishing this from seeksOut is the whole reason the
   * payload carries a neutral bucket rather than one undifferentiated "watched" list. */
  tolerates: string[];
  /** What they bail on, inferred from dropped series. */
  avoids: string[];
}

/**
 * Exactly what leaves the app, and nothing else: three lists of titles the app already holds in
 * its own Postgres. No user id, no email, no MAL username, no MAL ids, no synopses, scores or
 * dates — see the PRD's compliance position, which rests on the model never receiving a MAL API
 * response. These are strings read out of our own database, which is functionally the same as the
 * user typing a title into Discover's search box.
 */
export interface TastePayload {
  liked: string[];
  watchedNeutral: string[];
  dropped: string[];
}

/** Which of the three buckets a series falls in, or null when it is no verdict at all. */
export type TasteBucket = 'liked' | 'watchedNeutral' | 'dropped';

/**
 * How many verdicts the library needs before a profile is worth generating. Below this the model
 * is skipped entirely and the deterministic ranking stands alone — a profile written from two
 * shows is invention, not inference, and it would be read as if it were earned.
 *
 * The PRD says "fewer than ~5 watched series"; this counts dropped series toward the five as well,
 * because a drop is a verdict the model is explicitly asked to use, and a library of two watched
 * and eight dropped shows has plenty to go on.
 */
export const MIN_TASTE_VERDICTS = 5;

/**
 * Which bucket a series speaks for, if any. The precedence is the point:
 *
 *  - **Dropped wins outright.** It is the strongest thing the user ever says about a show, and a
 *    series both liked and later dropped is a bail, not a favourite.
 *  - **A like is explicit, so it counts whatever the progress.** `liked` is user-set on watched,
 *    partially-watched and watched-forgot series alike (CLAUDE.md's Data model), and someone who
 *    has pressed the like button has told us more than any derivation could.
 *  - **Neutral means genuinely finished**, not merely started. `WATCHED_PARTIAL` is deliberately
 *    excluded: it covers everything from 4/5 seasons down to 0/5, and a plan-to-watch import
 *    sitting at 0/5 is not a watch signal. Restricting the bucket to WATCHED (and the manual
 *    WATCHED_FORGOT, which means "saw this years ago") is also what makes the fingerprint below
 *    move on "newly completed" and on nothing else.
 *
 * Everything else — PLAN, CURRENTLY_WATCHING, and any unliked partial — returns null. An
 * in-progress show is not yet a verdict, and counting it would mean the profile changed every
 * time the user ticked an episode.
 */
export function tasteBucketOf(series: Series): TasteBucket | null {
  if (series.manualStatus === 'DROPPED') return 'dropped';
  if (series.liked) return 'liked';
  if (series.status.kind === 'WATCHED' || series.status.kind === 'WATCHED_FORGOT') return 'watchedNeutral';
  return null;
}

/** Every series that speaks for a bucket, paired with the bucket. The shared basis of the payload
 * and the fingerprint, so the two can never disagree about what counts. */
function bucketedSeries(library: Series[]): { series: Series; bucket: TasteBucket }[] {
  const out: { series: Series; bucket: TasteBucket }[] = [];
  for (const series of library) {
    const bucket = tasteBucketOf(series);
    if (bucket) out.push({ series, bucket });
  }
  return out;
}

/** Whether the library says enough for a profile to mean anything — see MIN_TASTE_VERDICTS. */
export function hasEnoughTasteSignal(library: Series[]): boolean {
  return bucketedSeries(library).length >= MIN_TASTE_VERDICTS;
}

/**
 * Builds the de-identified payload. Throws when consent is missing rather than returning an empty
 * payload: this is the last gate in front of the only data that ever leaves the app, and "send
 * nothing" and "refuse to proceed" must not be the same code path — one of them silently succeeds.
 * The Edge Function re-checks consent server-side against Postgres for the same reason, so a bug
 * in either gate alone cannot leak a library.
 *
 * Titles are sent uncapped (the PRD's decision). Sorted, so two devices building the payload from
 * the same library produce byte-identical bodies and the request is genuinely idempotent.
 */
export function buildTastePayload(library: Series[], privacyConsentedAt: string | null): TastePayload {
  if (!privacyConsentedAt) {
    throw new Error('Cannot build a taste profile before the privacy notice has been accepted.');
  }
  const payload: TastePayload = { liked: [], watchedNeutral: [], dropped: [] };
  for (const { series, bucket } of bucketedSeries(library)) {
    payload[bucket].push(series.title);
  }
  payload.liked.sort();
  payload.watchedNeutral.sort();
  payload.dropped.sort();
  return payload;
}

/**
 * A stable digest of everything about the library that could change the profile, and nothing that
 * couldn't. Comparing this against the stored `source_fingerprint` is what decides whether a
 * profile is stale — the alternative, a timestamp TTL, would fire model calls on a library nobody
 * has touched and sit on an out-of-date profile on one that changed this morning.
 *
 * What is in it: each contributing series' `rootMalId` and its bucket. So it moves when a series
 * is liked or unliked, dropped or undropped, or finally finished — the three triggers the PRD
 * names — and when a contributing series is added or removed.
 *
 * What is deliberately out of it: episode and season progress short of completion (a tick from
 * 3/5 to 4/5 changes no bucket, so it must not cost a model call), PLAN and CURRENTLY_WATCHING
 * series, and the titles themselves. Titles are what gets sent, so a MAL title correction does
 * technically change the payload — but it describes the same show, so the profile it would produce
 * is the same profile, and letting a cosmetic rename invalidate the whole thing is the worse trade.
 *
 * Sorted by rootMalId, so library order can never produce two fingerprints for one library. The
 * `v1:` prefix is there so a future change to what counts as taste-bearing can invalidate every
 * stored fingerprint on purpose, rather than silently comparing old digests against new rules.
 */
export function tasteFingerprint(library: Series[]): string {
  const parts = bucketedSeries(library)
    .map(({ series, bucket }) => `${series.rootMalId}:${bucket}`)
    .sort();
  return `v1:${parts.join('|')}`;
}

/**
 * Whether a stored profile still matches the library it was generated from. A missing profile is
 * stale by definition, which is what makes "generate" and "regenerate" the same call.
 */
export function isTasteProfileStale(storedFingerprint: string | null, library: Series[]): boolean {
  return storedFingerprint !== tasteFingerprint(library);
}

/**
 * Narrows whatever the model returned into a TasteProfile, or null if it is unusable.
 *
 * The model is an untrusted source of shape as much as of content: a missing field, a string where
 * a list belongs, or a null would otherwise reach the card and crash it. Returning null rather
 * than throwing lets the caller degrade to "no profile yet" — guardrail #5 one layer out, the same
 * posture the PRD sets for the provider being down.
 */
export function parseTasteProfile(raw: unknown): TasteProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) return null;
  return {
    summary,
    seeksOut: stringList(obj.seeksOut),
    tolerates: stringList(obj.tolerates),
    avoids: stringList(obj.avoids),
  };
}

/** Non-empty strings out of whatever the model put in a list field; anything else is dropped. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
}
