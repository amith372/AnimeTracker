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

Plan 1's steps 0–3 are done and checked. **Steps 4, 5 and 5½ are built and committed but NOT yet
checked** (`09246c2`, `3f15df8`, `35de161`) — do not rebuild them. They are kept
below, with their checks, so a session that reads this file doesn't mistake committed work for
unbuilt work; the moment the user confirms each check it compresses to one line and gets pushed.
**Step 6 is the next thing to build**, and it must not start before step 5½'s check passes — step 6
is the first step that sends data out of the app, which is the whole reason 5½ lands first.

`prd/1-recommendation-variety.md` is signed off in shape and has no open questions left that block
a step. Plan 3 was added 2026-10-11 and is unscheduled.

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
- **One Supabase-side item from Phase 12 is still unverified**: the Render static site connected.
  Anonymous sign-ins are confirmed **enabled** (2026-10-11, by signing one in against the live
  project — it returned `is_anonymous: true`; the throwaway user `178e75f9…` is still in
  `auth.users`, and is **not** a subject for step 5½'s delete action after all: its session is
  gone, so nothing can sign into it from the app — clear it from the dashboard instead). The migration is settled — `20260812000000_direct_postgres.sql` is
  applied on the remote, and the CLI migration history (empty, because the schema was applied
  outside the CLI) was repaired to match, 2026-10-11, so step 5½'s migration pushes normally.
  Never `db push` these expecting a no-op: `create policy` and `cron.schedule` are not idempotent.

---

# Plan 1 — Recommendations with deeper taste and real variety

Detail, decisions and reasoning: **`prd/1-recommendation-variety.md`**. Not duplicated here — this
is the work list, that is the brief. Delete the PRD when step 7 lands.

Step 0 — the pre-commit gate, and the `genres` question · **done 2026-10-11**
Step 1 — diversify the final list · **done 2026-10-11**
Step 2 — broaden the candidate pool · **done 2026-10-11**
Step 3 — learn from dropped series · **done 2026-10-11**

### Step 4 — Minimum-episodes filter · **built 2026-10-11, awaiting the user's check**
Preset chips (Any / 12+ / 24+ / 50+) beside the genre filter on "For you" only; counting rule
(TV seasons only, unknown counts kept) as a pure predicate in `src/domain/`.
**Check:** set 50+ — only long series remain, Movies section untouched. Failure: movies vanishing, or
an airing show with no published count hidden.

### Step 5 — More taste axes and the obscurity signal · **built 2026-10-11, awaiting the user's check**
`studios`, `source`, `num_list_users` added to `DETAIL_FIELDS` in **both** `mal-anime-detail` and
`mal-import`, byte-identical, with `DETAIL_CACHE_VERSION` bumped to v5 in the same commit. Studio /
source / era affinity alongside genre — and no theme or demographic axis, which the PRD's step-0
answer shows are already inside `genres`.
**Check:** recommendations shift toward studios and sources you favour. Failure: genre-only
behaviour unchanged — the new fields are reading `undefined`, i.e. the cache version wasn't bumped.

### Step 5½ — Privacy notice, consent, and delete everything · **built 2026-10-11, awaiting the user's check**
Lands before step 6, because that is the first step that sends data out of the app. A
`service_role` Edge Function deleting the account's rows and its `auth.users` record; a ~150-word
notice screen; `privacy_consented_at` on `user_library_meta`. **Leaves `api_cache` alone and never
touches the user's MAL list** — the dialog says both.
Guests see the gate too, confirmed 2026-10-11 — nothing special-cases an anonymous session.
Both live-project pushes are **done, 2026-10-11, by the user**: `20261011000000_privacy_consent.sql`
via `supabase db push`, and `supabase functions deploy delete-account`. Nothing is outstanding on
the Supabase side; the check below is the only thing left.
**Check:** on a throwaway guest session (login → Continue as a guest) — read the notice, accept, app
opens; delete, account gone, re-signin starts at onboarding; your own library untouched. The MAL
half of this check is **not runnable and has been dropped** — `mal_accounts.mal_user_id` is unique,
so one MAL identity links to one app account at a time and a throwaway can't hold a link to delete;
the only account that can is the user's own. That the delete never reaches MAL rests on
`__tests__/deleteAccount.test.ts` asserting no MAL helper is imported, not on an observation.

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

---

# Plan 3 — Move the Supabase project to a closer region · **not scheduled, needs a PRD**

Asked for 2026-10-11: loading is slow, and the suspicion is that the Postgres region is far away.

**The measurement that says it is.** Five REST round trips to the current project, from this dev
machine:

```
connect 0.008-0.028s   tls 0.019-0.040s   total 0.372-0.412s
```

TCP connect and the TLS handshake both finish inside ~40ms, because those terminate at a CDN edge
that is already nearby. The remaining **~350ms is the edge → region → edge leg**, and it is paid on
every single request. That is the whole of the problem in one number, and it is worth stating what
makes it expensive here specifically: since the Phase 12 cutover there is no local database and no
offline support, so every screen read, every optimistic write's commit, and every MAL call (they
all go through Edge Functions, which run in that same region) is one of these round trips. A screen
doing three sequential ones spends a second before it can draw.

**Why this needs a PRD rather than just doing it.** A region is fixed at project creation, so this
is a migration to a new project, not a setting — *verify that against Supabase's current docs
first, as it may have changed, and the answer decides whether there is any work here at all.*
Assuming it holds, the new project means a new URL and anon key, and the following all have to move
or be redone, each of which can silently half-work:

- `supabase/migrations/` re-pushed, including `20260812000000_direct_postgres.sql` — which the
  "still owed" list above says may never have been pushed to the current project either, so settle
  that first or the two projects differ in ways nothing will tell you about.
- Edge Function secrets re-set: `MAL_CLIENT_ID`, `SITE_URL`, `CRON_SECRET`.
- **The MAL OAuth redirect URI changes**, because it is the `mal-oauth-callback` function's own URL
  (Feature specs §1). It must be re-registered on MAL's side, and until it is, every sign-in path
  breaks — this is the step with the largest blast radius and the one to sequence last.
- "Allow anonymous sign-ins" re-enabled (dashboard-only, no migration can do it).
- The `pg_cron` schedules re-created: the monthly sync and the daily `api_cache` prune.
- Data: `series` / `series_entries` / `user_library_meta` dumped and restored. `mal_accounts` is
  better left behind and re-linked by hand — copying live MAL refresh tokens between projects is
  the one piece of this that handles a real secret, and a re-link costs one OAuth round trip.
  `api_cache` needs nothing: it is shared, disposable, and measured empty on 2026-10-11 anyway.
- `.env` and the Render static site's environment both updated.

**Open question for the PRD:** whether a closer region is actually available for the plan the
project is on, and which one genuinely wins — pick it by measuring, not by looking at a map.
A throwaway project in each candidate region, timed with the same five-sample curl above, settles
it before anything is migrated.

**Check:** re-run that curl against the new project. `total` should fall toward the connect+TLS
floor — call it under ~120ms rather than ~390ms. Then open the app cold and confirm the Library
draws noticeably faster. Failure looks like an unchanged `total` (the new region is no closer), or
any sign-in path broken (the MAL redirect URI was not re-registered).
