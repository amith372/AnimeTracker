# PRD 1 — Recommendations with deeper taste and real variety

Written for: Amith, to sign off before any code, and for future sessions picking this up mid-way.
Delete this file when the last step lands (its decisions move to CLAUDE.md/SPECS.md and PLAN.md at
that point).

**Status: awaiting sign-off.** Nothing here is built. The decisions below were settled in the
2026-10-11 grilling session and are not to be re-opened without the user asking.

## Problem

The "For you" list is narrow by construction, not by tuning. Four structural causes:

1. **The candidate pool is popularity-ordered before taste is ever consulted.**
   `RecommendationRepository.ts` sorts every candidate by raw MAL tally and keeps the top 80
   *before* spending a detail fetch, so a niche show the user's genre profile would love is never
   scored at all.
2. **One blockbuster watched series dominates the pool.** Candidates are flattened across all
   source series with no per-series quota, so a popular show contributing 200 recommendations
   crowds out the ten an obscure favourite contributed.
3. **Ranking is greedy score order with no diversification.** Watch three shonen and the top 60 is
   60 shonen — each individually the best next pick, the list as a whole one note.
4. **Genres are the only taste axis, and the only negative signal is exclusion.** No studio, source,
   era or length. Dropped series are filtered out but never *inform* the profile, so it cannot learn
   what the user bails on.

Beyond those, the deepest thing asked for — "more likely to fit the taste based on watched /
dropped / liked" — is something genre math cannot express at all. A profile built from MAL's tag
vocabulary can say "likes Action"; it cannot say "watches a lot of shonen but only *loves*
slow-burn character drama, and drops anything built on gag comedy."

## Success criteria

1. A full "For you" list is visibly varied: no single genre cluster occupies the whole top of the
   list when the user's library is dominated by one.
2. A show contributed by a single obscure watched series can reach the list on taste, not only on
   how many MAL users recommended it.
3. The user can read their own taste profile in plain language, and regenerate it when it is wrong.
4. Recommendations include shows MAL's recommendation graph never links to the user's library.
5. Every fact displayed on a card still comes from MAL. No model-authored text reaches the UI.
6. The feature degrades to today's deterministic list — never to an error screen — when the model
   is unavailable, and says so in one line.
7. The user can filter "For you" to series of at least N total TV episodes.
8. Measurable: the median MAL audience size (`num_list_users`) of shows the user actually adds from
   "For you" goes down after this work. That is the metric for whether any of it worked.
9. Every account can read what the app stores and where it is sent, and has agreed to it once
   before any of their data leaves the app.
10. Every account can delete everything the app holds about them, from inside the app, in one
    action — without a hand-written SQL query and without touching their MAL list.

## Scope

**In:** the four deterministic fixes; a minimum-episodes filter; a privacy notice, one-time consent
and a "delete everything" action; an LLM taste profile; an LLM candidate generator behind a hard
MAL-resolution gate; the Postgres table and Edge Functions these need.

**Out:** per-card "why you'd like this" explanation text (considered and rejected — the user wants
better picks, not annotated ones); an LLM reranker over the existing MAL candidate pool (same
narrow pool, so it cannot add discovery); grouping support for `ova`/`ona`/`special` (a real gap —
see Open questions — but a change to `groupIntoSeries` and its own piece of work); any change to
Catch up's logic; any change to Discover.

## Decisions settled

| Decision | Settled as | Why |
|---|---|---|
| What the model does | Taste profile first, then candidate generation | The profile is inspectable and correctable; doing both at once means debugging taste and hallucination together |
| Fabricated titles | Hard gate — resolve every suggested title through MAL search, discard anything that doesn't match closely | Turns hallucination from a correctness bug into a yield problem |
| Keeping the model off the famous shows | Prompt instruction **and** a deterministic `num_list_users` filter | A prompt alone is unverifiable; the filter is unit-testable and doubles as success criterion 8 |
| Profile recompute trigger | Only on taste-bearing changes (liked / dropped / newly completed), plus a manual regenerate button | An episode tick must not fire a model call |
| Profile shape | Free-form descriptors, read **only** by the candidate generator | Keeps every number on screen deterministic and testable; the ranker still works unchanged with no model at all |
| Failure behaviour | Fall back to the deterministic list, with a small line saying the model didn't run | Guardrail #5 one layer out. Without the line, "provider down" and "model had dull ideas" are indistinguishable |
| Provider | Groq free tier | Reportedly does not train on inputs/outputs, and is the fastest option. Verify its own terms and whether zero-data-retention is available on free before shipping — abuse logs are reported at up to 30 days, against §3(e)'s 24 hours |
| Payload | De-identified: `liked` / `watched-neutral` / `dropped` title lists, three buckets, uncapped. No user id, email, MAL username, MAL ids, synopses, scores or dates | Nothing identifying leaves the app, so §4(f) and §3(e) are satisfied. The neutral bucket is what distinguishes "tolerates" from "seeks out" |
| Episode filter counts | Sum of `episodeCount` across **TV_SEASON entries only** | The user's call. Consequence: a standalone movie totals 0 and is therefore never filtered out, so the Movies section is unaffected — coherent with counting TV length only |
| Unknown episode counts | Keep the series, don't hide it | Matches the reasoning already written into `isUnreleased` — fail in the direction that doesn't silently hide things |
| Filter control | Preset chips (Any / 12+ / 24+ / 50+), "For you" tab only | Matches the existing genre-filter pattern and needs no keyboard. Catch up is shows already started; a length filter there would hide a committed backlog |

## Compliance position (MAL API agreement)

Settled on the narrow reading of **§3(a)(vii)** (no combining or integrating the API with
unauthorized software, services or materials), on this basis: **no MAL API response ever reaches the
model.** Groq receives title strings read from our own Postgres plus the user's own
like/neutral/drop flags. It returns strings, which the app then searches MAL for — functionally
identical to a user typing a title into Discover's search box. The API and the model are never
connected; the database sits between them.

Clauses checked and satisfied: **§4(f)** (no user personal information to third parties — nothing
identifying is sent, and Groq reportedly acts as a processor, so §4(h)'s service-provider carve-out
holds); **§3(e)** (deletion within 24h — nothing identifiable to delete); **§3(a)(xii)** (no
altering MAL Content — the model's words never reach the UI); **§4(i)** (API only, no scraping —
unchanged); **§3(a)(xiv)** (non-commercial — unchanged).

Residual risk is a revoked API key, which guardrail #5 already assumes is possible at any time.
**Not reviewed by a lawyer.**

## Constraints

- `DETAIL_FIELDS` must stay byte-identical between `mal-anime-detail` and `mal-import`, and the
  `detail:` cache version must go v4 → v5 in the same commit as any field change — an old row is
  valid JSON, so nothing refetches it and new fields read as `undefined` for a full 30-day TTL.
- The monthly-sync function must keep re-fetching `related_anime` uncached. A cache hit there is a
  bug, not an optimization.
- `api_cache` is shared across every account. The taste profile is per-user and must **not** live
  there — it needs its own table with `auth.uid() = user_id` RLS.
- Title→id resolution is permanently cacheable (a show's title doesn't change), so it gets its own
  long-TTL key segment rather than riding the 30-day detail TTL.
- Domain logic stays in `src/domain/`. The new Edge Function is a provider proxy that holds the key
  and nothing else — it must not decide what to recommend.
- `GROQ_API_KEY` is a Supabase Edge Function secret, never an `EXPO_PUBLIC_` var, same pattern as
  `MAL_CLIENT_ID`.
- Guest mode is on, so anonymous users can reach this. The generator is one request per refresh,
  which caps the blast radius, but a per-user daily ceiling is still wanted (step 7).
- **"Delete everything" must not touch `api_cache`.** That table is shared across every account and
  holds anime metadata keyed by MAL id — no personal information, nothing tied to a user — so
  there is nothing of theirs in it, and clearing rows would wipe every other account's warm cache.
  This is the same rule that got `clearApiCache` deleted.
- **"Delete everything" must not touch the user's MAL list.** §8's opt-in push is the only write
  path to MAL, and deleting entries from MAL is an explicit non-goal. The UI copy has to say so
  plainly, or someone will press it believing it wipes their MyAnimeList account.

## Edge cases

- A library with nothing liked and nothing dropped — the profile has only the neutral bucket.
- A library with fewer than ~5 watched series: too little signal, so skip the model entirely and use
  the deterministic path.
- The model returns a title that resolves to a show already in the library (expected, often) — the
  existing post-grouping exclusion catches it.
- The model returns a real show MAL has no entry for — dropped by the gate, fine.
- The model returns a title that fuzzy-matches the *wrong* real show — rejected by the similarity
  threshold, which is the reason that threshold exists.
- Every suggestion gets rejected: the list is still the full deterministic one.
- A series whose every entry has `episodeCount` 0 under an active filter — kept.
- Two concurrent refreshes from phone and browser — the profile read is idempotent, the write an
  upsert.

## Implementation plan

Ordering principle borrowed from EaseSalary's build plan: **reach a correct, verifiable result as
early as possible, then make it touchable.** All deterministic work ships and is verified before any
model call exists, so the feature is complete and useful even if steps 6 and 7 are never built.

Every step's expected test figures are **derived on paper from the inputs, never read off what the
implementation returned** — a test written from the code under it records whatever that code
produced, and passes the day someone corrects a bug.

### Step 0 — The pre-commit gate, and one fact to settle

- `hooks/pre-commit` + `core.hooksPath hooks` via package.json's `prepare`: added-line secret scan
  (`.env` by name, private-key blocks, JWTs, literal-assigned keys), then `npx tsc --noEmit`, then
  `npx jest`. Lands first so every later step is gated.
- **Fact to settle before steps 3 and 5:** does MAL's v2 `genres` array already include Themes and
  Demographics (~70–80 tags), or only the ~15 coarse genres? The test fixtures are hand-written, so
  they don't say. Settled by one query in the Supabase SQL editor:
  `select json->'genres' from api_cache where key like 'detail:v4:%' limit 5;`
  If genres are that deep, steps 3 and 5 get sharply better on their own and the case for the model
  weakens — worth knowing before building either.
- **Check:** stage a file containing a fake JWT, attempt a commit, confirm it is refused. Then
  commit something harmless and confirm typecheck and tests run.

### Step 1 — Diversify the final list (cause 3)

- `src/domain/recommendations.ts`: new `diversifyRanked()` — greedy MMR, each slot picked by
  `score − lambda × maxSimilarity(to already-picked)`, similarity = genre Jaccard. Applied in
  `RecommendationRepository.ts` after `rankCandidates`, before the `MAX_RECOMMENDATIONS` slice.
- Tests (`__tests__/recommendations.test.ts`): hand-built candidates where greedy and diversified
  order provably differ, with expected orders worked out by hand from the lambda.
- **Check:** open "For you". The top ~10 should no longer be one genre cluster. Failure looks like an
  unchanged list, or a list whose top entries are now obviously worse fits.

### Step 2 — Broaden the candidate pool (causes 1 and 2)

- Replace the top-80-by-tally cut with a round-robin quota over source series: each watched series
  contributes its best candidates in turn until the detail budget is spent. Same number of MAL
  calls, different 80.
- A new pure function, so the selection is testable apart from the fetching.
- Tests: one source series with 50 candidates and three with 3 each; assert all four are
  represented, which today's code provably fails.
- **Check:** a show you'd expect from a less popular watched series appears. Failure looks like the
  list still being drawn from your two or three biggest shows.

### Step 3 — Learn from dropped series (cause 4, negative half)

- `buildGenreAffinity` gains a negative profile from `DROPPED` series, subtracted from candidate
  scores. Weight decided by hand against the real library and stated in a comment.
- Tests: a profile where a dropped genre demonstrably sinks a candidate that genre overlap alone
  would have ranked top.
- **Check:** something you dropped the like of stops appearing. Failure looks like no change, or
  over-correction wiping out a genre you do still like.

### Step 4 — Minimum-episodes filter

- `app/(tabs)/recommend.tsx`: preset chips (Any / 12+ / 24+ / 50+) beside the genre filter, "For
  you" only. The counting rule is a pure predicate in `src/domain/`, so it's tested rather than
  eyeballed.
- Tests: a 2-season 25-episode series passes 24+ and fails 50+; a series with unknown counts passes
  every threshold; a standalone movie is unaffected.
- **Check:** set 50+, confirm only long series remain and the Movies section is untouched. Failure
  looks like movies vanishing, or a currently-airing show with no published count being hidden.

### Step 5 — More taste axes and the obscurity signal (cause 4, positive half)

- Add `studios`, `source` and `num_list_users` to `DETAIL_FIELDS` in **both** `mal-anime-detail` and
  `mal-import` (byte-identical), bump `DETAIL_CACHE_VERSION` to v5, extend `AnimeDetailDto`.
- Studio / source / era affinity alongside genre, each normalized before combining, weights stated
  in a comment with the reasoning.
- `num_list_users` becomes available for step 7's obscurity filter and for success criterion 8.
- Tests: affinity and combination maths with figures derived on paper, plus a regression test
  asserting the two `DETAIL_FIELDS` strings are identical.
- **Check:** recommendations shift toward studios and sources you actually favour. Failure looks like
  genre-only behaviour unchanged — a sign the new fields are reading as `undefined`, i.e. the cache
  version wasn't bumped.

### Step 5½ — A privacy notice, consent, and a way to delete everything

Lands **before** step 6 deliberately: step 6 is the first time an account's data leaves the app, and
consent that arrives after the data has gone is not consent. Satisfies §4(d), §4(f) and §3(e), and
closes a gap that exists today — `src/account/` currently has only `signOut`, so deleting an
account's data means hand-written SQL in the Supabase dashboard.

- **Delete everything.** An Edge Function running as `service_role` removes the account's `series`,
  `series_entries`, `user_library_meta`, `mal_accounts` and `taste_profiles` rows, then deletes the
  `auth.users` record itself (otherwise an orphan account is left behind), then the client signs
  out. Behind a confirmation dialog, same bar as the MAL push — this is irreversible and external
  to nothing, but it is the user's whole library. **It leaves `api_cache` alone** and **does not
  touch their MAL list**, and the dialog says both.
- **Privacy notice.** One screen, roughly 150 words: what the app stores (library, MAL link,
  tokens server-side), what leaves it and to whom (MAL for everything; from step 6, de-identified
  title lists to Groq), and how to delete it. Reachable from the account screen at any time. §4(f)
  also requires it be no less protective than MAL's own policy, so it must not claim rights over
  the data that MAL's policy doesn't allow.
- **Consent, once per account.** A `privacy_consented_at timestamptz` column on
  `user_library_meta` — the existing singleton row per account, so no new table. Shown at
  onboarding for new accounts and once on next launch for existing ones; the app is gated behind it
  because §4(f) ties consent to the policy generally, not to one feature. Step 6 additionally
  refuses to send anything if it is null, so a bug in the gate can't leak a library.
- Tests: the delete function removes every table's rows for the acting user and **no other user's**
  (two seeded accounts, assert the second survives); `api_cache` row count is unchanged by a
  delete; the payload builder in step 6 throws if consent is null.
- **Check:** on a throwaway second account, read the notice, accept, confirm the app opens. Then
  press delete, confirm the account is gone, confirm signing in again starts from onboarding — and
  confirm your *own* account's library is untouched. Then check MAL's website and confirm that
  account's list is still there. Failure looks like the other account's data disappearing, an
  orphaned login that gets an empty library, or anything missing from the MAL list.

### Step 6 — The taste profile (model, part 1)

- Migration: `taste_profiles` (`user_id` PK → `auth.users`, `profile jsonb`, `generated_at`,
  `source_fingerprint`), RLS `auth.uid() = user_id`.
- `supabase/functions/taste-profile`: holds `GROQ_API_KEY`, sends the three de-identified buckets,
  returns free-form descriptors. Proxy only — no scoring, no MAL calls.
- `src/repositories/TasteProfileRepository.ts`: read/write, staleness via `source_fingerprint` over
  taste-bearing fields only, so an episode tick doesn't invalidate it.
- UI: the profile shown on the Recommendations screen, with a regenerate button.
- Tests: the fingerprint changes on a like/drop/complete and **does not** change on an episode tick;
  the payload builder emits no identifier and no MAL id (asserted on the serialized body).
- **Check:** read your own profile. Does it describe you? Regenerate and confirm it changes. Failure
  looks like generic filler, or a profile that doesn't move when you drop something.

### Step 7 — The candidate generator (model, part 2)

- Generator call: profile plus exclusion titles in, candidate titles out, one request per refresh.
- Resolution gate: MAL search per title, similarity threshold, `resolve:v1:<normalized>` cache key
  with a long TTL. Pure similarity function, unit-tested.
- Obscurity enforcement: the prompt instruction plus a `num_list_users` ceiling from step 5.
- The degrade path and its one-line notice; a per-user daily call ceiling in Postgres.
- Tests: the gate rejects a fabricated title, rejects a wrong-show fuzzy match, and accepts an exact
  match; the obscurity filter drops a blockbuster the prompt failed to exclude; a thrown provider
  error yields the full deterministic list.
- **Check:** refresh "For you" and look for shows that have no MAL recommendation path from your
  library at all. Then revoke the key and confirm the list still renders with the notice. Failure
  looks like an error screen, a title you can't find on MAL, or a list of the same famous shows.

## Open questions

1. ~~A privacy policy is owed regardless of this work.~~ **Settled 2026-10-11 — in scope, see step
   5½.** The user asked for the notice, the consent and the delete action to be built. One thing
   still undecided inside it: whether a **guest** (anonymous) account sees the consent gate too.
   Arguments both ways — a guest is a real `auth.uid()` writing real rows, so the same logic
   applies; but a consent wall in front of "just let me try it" is the friction guest mode exists
   to avoid. Default taken in step 5½ is **yes, guests see it too**, on the grounds that a guest
   can link MAL and can reach step 6. Say if you'd rather exempt them.
2. **`groupIntoSeries` drops `ova`/`ona`/`special` entirely.** A model asked for discovery will
   suggest ONAs, which silently produce no row. Not in scope, but step 7's yield will be quietly
   lower because of it.
3. **Groq's retention window.** Reported abuse logs of up to 30 days sit awkwardly beside §3(e)'s 24
   hours. Check whether zero-data-retention is available on the free tier before step 6 ships; if
   not, decide between Cloudflare Workers AI and accepting the window.
4. The MMR lambda, the dropped-genre weight and the `num_list_users` ceiling are all numbers that
   need tuning against the real library. Each lands with a stated starting value and a comment, not
   a silent constant.

## Related, not in this PRD

Three other practices were approved in the same session and are separate work: splitting the feature
specs out of `CLAUDE.md` into a `SPECS.md` read on demand (with history moved to git), and adding
`docs/agents/domain.md` + `docs/agents/issue-tracker.md` so installed skills stop looking for
`CONTEXT.md` and `docs/adr/`. Step 0's pre-commit gate is the fourth, and is in this plan only
because it must exist before the rest is committed.
