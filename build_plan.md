# build_plan.md — AnimeTracker

The order in which work gets built, and what each step is made of. **Tell a session "continue" and
this is the file it reads**: take the first step not marked done, build only that step, end with the
check the user runs, and stop.

> **This file = *what to build next*.** It decides nothing about behaviour — `CLAUDE.md` says how to
> build, and a step's own PRD says what the thing is and why. On any conflict the PRD wins and this
> file is corrected.

**How this file is kept.** It holds only work that is **not yet done**, plus the debts a finished
step handed forward. **A step that lands is compressed to one line the same day** — its name, its
date, nothing else. What it found, what its tests would catch, and the check the user ran belong in
the code, the tests, the PRD or the commit message, each read by whoever needs it rather than by
everyone. Anything a finished step left **unfinished** is the one thing that survives it, and moves
to "What is still owed" or into the step that will pay it. This file is read whole by every session
that asks what to build next, so a paragraph about work already done is charged to every future
session.

**It is tracked, unlike EaseSalary's.** That project keeps its build plan untracked because it means
nothing outside one working copy; here there is one developer and one machine, and a file that
survives a fresh clone is worth more than the tidiness. Gitignore it if that stops being true.

**The ordering principle:** get a correct, verifiable result as early as possible, then make it
touchable. Everything that works without a model ships and is verified before any model exists, so
each feature is complete and useful even if the steps after it are never built.

**Two standing rules, from `CLAUDE.md` and the practices adopted 2026-10-11.** Every step ends with
a check the user runs — written as what to open or press and what failure looks like — and nothing
is pushed until they confirm it. Every expected test figure is derived on paper from the inputs,
never read off what the implementation returned.

---

## Current state, 2026-10-11

Steps 0 and 1 are done; steps 2 and 3 are built and awaiting their checks. `prd/1-recommendation-variety.md` is signed off in shape; the one
open question inside it (step 5½, guests and the consent gate) blocks only that step.

Last shipped before this plan existed: Phase 12's direct-Postgres cutover and web build
(2026-08-12), plus the UI fixes in commits up to `244f20f`. `PLAN.md` holds that history.

## What is still owed

Carried forward from finished work. None of these is a defect, and none is scheduled.

- **`groupIntoSeries` drops `ova`/`ona`/`special`/`music` entirely** rather than grouping them.
  Fine for the library today, but it means an ONA recommendation silently produces no row — which
  will quietly lower step 7's yield. Its own piece of work if it ever matters.
- **Phase 13's list-performance cleanup** is still open in `PLAN.md` and untouched by this plan.
- **`buildGenreAffinity`'s positive half cancels tag frequency rather than correcting for it**
  (found while building step 3). Dividing a tag's accumulated weight by how many of *the user's*
  series carry it yields the mean weight per carrying series, so in a library with no `liked`
  series every watched tag lands at exactly 1.0 and the profile only distinguishes which tags
  appear at all. Its comment claims a TF-IDF-style correction, which needs the tag's frequency in
  the *corpus*, not in the user's own list. Not a defect — "which tags appear in your library,
  weighted by what you liked" is a real if blunt signal, and step 3's negative half is built to be
  frequency-sensitive on its own terms. Fixing it is a behaviour change to the positive half and
  wants its own step, probably folded into step 5 when the other taste axes land.
- **Three Supabase-side items from Phase 12 may still be outstanding** — the
  `20260812000000_direct_postgres.sql` migration pushed, anonymous sign-ins enabled, and the Render
  static site connected. Confirm before step 5½, which adds a migration of its own.

---

# Plan 1 — Recommendations with deeper taste and real variety

Detail, decisions and reasoning: **`prd/1-recommendation-variety.md`**. Not duplicated here — this
is the work list, that is the brief. Delete the PRD when step 7 lands.

Step 0 — the pre-commit gate, and the `genres` question · **done 2026-10-11**
Step 1 — diversify the final list · **done 2026-10-11**

### Step 2 — Broaden the candidate pool · **built 2026-10-11, awaiting the check**
`selectCandidatePool()` in `src/domain/recommendations.ts` replaces the top-80-by-tally cut with a
round-robin over source series. Same MAL call count, different 80. Compress this to one line once
the check below passes.
**Check:** a show you'd expect from a less popular watched series appears. Failure: the list is
still drawn from your two or three biggest shows.

### Step 3 — Learn from dropped series · **built 2026-10-11, awaiting the check**
`buildGenreAffinity` now subtracts a drop *rate* per tag — `dropped / (watched + dropped)` ×
`DROPPED_GENRE_WEIGHT` — rather than a drop count, which would read 1 dropped Isekai out of 21 the
same as 20 out of 21. The weight is 1.0 because that is the largest value under which a tag with
any watched series can be neutralised but never inverted, which is what makes the `Shounen`
wipe-out structurally impossible rather than merely unlikely. `normalize` now floors at −1 so a
condemned candidate can't swamp the MAL half. Compress this to one line once the check passes.
**Check:** something you dropped the like of stops appearing. Failure: no change, or a genre you do
still like gets wiped out.

### Step 4 — Minimum-episodes filter
Preset chips (Any / 12+ / 24+ / 50+) beside the genre filter on "For you" only; counting rule
(TV seasons only, unknown counts kept) as a pure predicate in `src/domain/`.
**Check:** set 50+ — only long series remain, Movies section untouched. Failure: movies vanishing, or
an airing show with no published count hidden.

### Step 5 — More taste axes and the obscurity signal
`studios`, `source`, `num_list_users` added to `DETAIL_FIELDS` in **both** `mal-anime-detail` and
`mal-import`, byte-identical, with `DETAIL_CACHE_VERSION` bumped to v5 in the same commit. Studio /
source / era affinity alongside genre — and no theme or demographic axis, which the PRD's step-0
answer shows are already inside `genres`.
**Check:** recommendations shift toward studios and sources you favour. Failure: genre-only
behaviour unchanged — the new fields are reading `undefined`, i.e. the cache version wasn't bumped.

### Step 5½ — Privacy notice, consent, and delete everything · **blocked on one answer**
Lands before step 6, because that is the first step that sends data out of the app. A
`service_role` Edge Function deleting the account's rows and its `auth.users` record; a ~150-word
notice screen; `privacy_consented_at` on `user_library_meta`. **Leaves `api_cache` alone and never
touches the user's MAL list** — the dialog says both.
**Blocked on:** do guest (anonymous) accounts see the consent gate? PRD default is yes.
**Check:** on a throwaway second account — read the notice, accept, app opens; delete, account gone,
re-signin starts at onboarding; your own library untouched; that account's MAL list still intact on
MAL's own site.

### Step 6 — The taste profile (model, part 1)
`taste_profiles` table + RLS; `supabase/functions/taste-profile` holding `GROQ_API_KEY` and sending
the three de-identified buckets; `TasteProfileRepository.ts` with staleness over taste-bearing
fields only; the profile shown on screen with a regenerate button. Refuses to send if
`privacy_consented_at` is null.
**Check:** read your own profile — does it describe you? Regenerate and confirm it changes. Failure:
generic filler, or a profile that doesn't move when you drop something.

### Step 7 — The candidate generator (model, part 2)
One generator request per refresh; MAL-search resolution gate with a similarity threshold and a
long-TTL `resolve:v1:<normalized>` cache key; `num_list_users` obscurity ceiling; degrade path with
its one-line notice; per-user daily call ceiling.
**Check:** "For you" shows something with no MAL recommendation path from your library. Then revoke
the key and confirm the list still renders with the notice. Failure: an error screen, a title you
can't find on MAL, or the same famous shows.

---

# Plan 2 — The practices adopted 2026-10-11 · **not scheduled**

Approved alongside plan 1 and independent of it. Step 0 above is the fourth of these and is in
plan 1 only because it must exist before anything else is committed.

### Split the feature specs out of `CLAUDE.md`
Move §1–§8 into a `SPECS.md` read on demand, with a "Where to read" table and grep anchors in
`CLAUDE.md`; strip superseded-phase archaeology, which `PLAN.md` and git already hold. Roughly
halves what loads into every session. The rule that comes with it: a new decision replaces the old
wording outright, and how a rule came to be lives in the commit message.
**Check:** open a new session and confirm it can still find the push rules and the status-derivation
table without being told where they are.

### `docs/agents/domain.md` + `docs/agents/issue-tracker.md`
Two short files telling installed skills that `CLAUDE.md`/`SPECS.md` are the domain model and this
file is the work list, so `mattpocock-skills:domain-modeling` and friends stop looking for
`CONTEXT.md` and `docs/adr/`.
**Check:** invoke the domain-modeling skill and confirm it reads the right files instead of
proposing new ones.
