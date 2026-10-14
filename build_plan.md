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

## Current state, 2026-10-14

**Plan 1 is complete** — every step built and checked, and `prd/1-recommendation-variety.md`
deleted. Step 8's check passed on 48 rows rather than the 60 the constant allows, which is the
correct behaviour rather than a shortfall: the pool is supply-limited, not budget-limited, so the
list grows with the library and `MAX_RECOMMENDATIONS` is a ceiling it reaches only once enough
series are watched. Confirmed live — adding watched series raised the count.

Nothing in plan 1 has been pushed — the branch holds every commit from step 0 onward, by the
user's instruction, so `origin/master` is still at `244f20f`.

The live project is fully set up for the model steps as of 2026-10-14: the `taste_profiles` and
`model_call_quota` migrations are applied, `taste-profile` and `taste-candidates` are deployed,
`GROQ_API_KEY` is set, and Global ZDR is on.
**Deploying an Edge Function from this machine needs `--use-api`** — Docker isn't installed, and
without that flag the deploy fails in a way that is easy to scroll past, leaving the client to get
a 404 that surfaces as a generic error.

`prd/1-recommendation-variety.md` is signed off in shape and has no open questions left that block
a step. Plan 3 was added 2026-10-11 and is unscheduled.

**What comes next, in order.** Plan 6 (the welcome greeting) was asked for mid-session on
2026-10-14 and jumps the queue by the user's ask; its PRD is drafted and has **one open question
that blocks its step 3**. Plan 5 (two bugs found the same day) is small and unblocked. Plan 4 (the
public share link) was the scheduled next thing and still is, once those clear — PRD signed off
2026-10-14, no open questions, start at its step 1. Plans 2, 3 and 7 stay unscheduled — though
plan 7's step 1 is three defect fixes needing no PRD, and its step 4 is worth landing before plan 4
puts a share link in front of an empty Library.

Last shipped before this plan existed: Phase 12's direct-Postgres cutover and web build
(2026-08-12), plus the UI fixes in commits up to `244f20f`. `PLAN.md` holds that history.

## What is still owed

Carried forward from finished work. None of these is a defect, and none is scheduled.

- **`groupIntoSeries` drops `ova`/`ona`/`special`/`music` entirely** rather than grouping them.
  Fine for the library today, but it means an ONA recommendation silently produces no row — which
  will quietly lower step 7's yield. Its own piece of work if it ever matters.
- **Step 7's degrade path has never been exercised.** Half 1 of its check passed; the user
  declined half 2 (revoke `GROQ_API_KEY`, confirm the list still renders with its one-line notice)
  as not worth running. So the branch where the model provider is unreachable is coded and
  commented but unobserved — if it is broken, it shows up as a blank or error "For you" during a
  Groq outage. One `supabase secrets set GROQ_API_KEY=invalid`, one refresh, and setting the real
  key back is the whole of it, whenever it is worth five minutes.
- **Phase 13's list-performance cleanup** is still open in `PLAN.md` and untouched by this plan.
- **`MAX_RECOMMENDATIONS` is a ceiling the list only reaches with a large enough library.** Step 8
  made the slice count real rows, but the pool is supply-limited: candidates come from one
  `anime/{rootMalId}?fields=recommendations` call per watched series, so a small library cannot
  fill 60 no matter what the budget is. Growing supply (second-degree recommendations, or every
  entry rather than each series' root) is a real option and its own piece of work.
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
  Settled 2026-10-11: anonymous sign-ins are enabled, and `20260812000000_direct_postgres.sql` is
  applied on the remote with the CLI's migration history repaired to match. A stale throwaway user
  `178e75f9…` is still in `auth.users` and can only be cleared from the dashboard — its session is
  gone, so nothing can sign into it from the app. Never `db push` a migration here expecting a
  no-op: `create policy` and `cron.schedule` are not idempotent.

---

# Plan 1 — Recommendations with deeper taste and real variety

**Complete 2026-10-14.** `prd/1-recommendation-variety.md` held the detail and was deleted when
step 8 landed, as planned; `git log` is where that reasoning lives now.

Step 0 — the pre-commit gate, and the `genres` question · **done 2026-10-11**
Step 1 — diversify the final list · **done 2026-10-11**
Step 2 — broaden the candidate pool · **done 2026-10-11**
Step 3 — learn from dropped series · **done 2026-10-11**
Step 4 — minimum-episodes filter · **done 2026-10-11**
Step 5 — more taste axes and the obscurity signal · **done 2026-10-11**
Step 5½ — privacy notice, consent, and delete everything · **done 2026-10-11**
Step 6 — the taste profile (model, part 1) · **done 2026-10-11**

Step 7 — the candidate generator (model, part 2) · **done 2026-10-14**

Step 8 — make the list as long as it says it is · **done 2026-10-14**

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

# Plan 4 — A public, account-free share link for your list · **scheduled, behind plans 5 and 6**

Asked for 2026-10-12; **PRD signed off and scheduled 2026-10-14**, to be picked up the moment
plans 5 and 6 clear. Detail, decisions, the compliance reading and the step plan live in
**`prd/2-public-share.md`** — not duplicated here. Delete the PRD when its step 4 lands. Four shape decisions were settled the same day:
a public Edge Function returning JSON (so RLS stays owner-only on every table), the whole library
with every status, one revocable link per account, and an optional nickname rather than any name
the app already holds.

**It amends a standing non-goal**, which is why it needs sign-off rather than just scheduling.
CLAUDE.md says a library is private to its account; this makes it publishable by its owner to
anyone holding a URL. No account can still read another account's library — that half of the
non-goal stands.

**Settled against the agreement, read 2026-10-12 rather than recalled:** §3(a)(ii) restricts
distributing *the API*, not MyAnimeList Content; §2(b) grants MAL crawler rights over "any webpage
on which you display MyAnimeList Content", so public pages are anticipated; and no clause requires
a viewer to hold a MAL account. §4(f) is the binding one and is about people, not shows — so no
email, MAL username, MAL user id or account id goes anywhere near the page.

**No open questions block it.** The guest one was settled 2026-10-14: a guest may share, and the
confirmation dialog says plainly that losing the guest session means losing the ability to stop
sharing. Nothing in the plan special-cases an anonymous session.

Four steps: the table plus the sharer's controls; the public read function; the viewer's page; then
the privacy notice and the CLAUDE.md amendment. Each has its own user-run check in the PRD.

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

---

# Plan 5 — Two bugs found 2026-10-14 · **unblocked, small**

Both found while checking plan 1 step 8. Fixes, not features, so neither needs a PRD.

### Illegal nested `<button>` on Series Detail (web)
`app/series/[id].tsx:412` sets `accessibilityRole="button"` on the entry row, which
react-native-web renders as a real `<button>` (`propsToAccessibilityComponent`'s `roleComponents`
map), and Paper's close-circle `IconButton` inside it renders another. HTML forbids interactive
content inside a button, so React logs a validateDOMNesting error on every Detail screen. The arc
rows at `:471` have the same shape. `SquareCheckbox` is fine — `accessibilityRole="checkbox"` is
not in the role map, so it stays a `div`.

The fix is a restructure, not a prop deletion: the row's three controls (open-info, watched
checkbox, won't-watch) should be siblings rather than nested. `styles.entryText` is already
`flex: 1`, so moving the press target onto the text block preserves very nearly the whole tap area.
**Needs one UX call first:** whether the row's padding should stay tappable.
**Check:** open a Series Detail page on web with the console open — no nesting error. Tapping the
title still opens the image popup; the checkbox and the skip button still work and don't trigger it.

### Edge Function error messages are unwrapped and then discarded
`src/api/edgeFunctions.ts:26`'s `invoke()` goes to deliberate trouble to pull the real
`{error: "..."}` body off a non-2xx Edge Function response — and every screen then feeds it to
`userFacingMessage()`, which only displays a `UserFacingError` and replaces anything else with a
generic fallback. So four genuinely different failures of the taste profile (no privacy consent,
Groq refused, function unreachable, not signed in) all render as the identical sentence
"Couldn't describe your taste just now", which tells the user nothing and cost a live debugging
session on 2026-10-14 to get behind.

Fix: have `invoke()` throw `UserFacingError`, since our own functions' error strings are written
for users. Judgement call to confirm — the Groq branch interpolates the provider's own wording,
which can be technical.
**Check:** trigger a taste-profile failure (easiest: `supabase secrets set GROQ_API_KEY=invalid`)
and confirm the card names the real reason. This also finally exercises step 7's degrade path,
which the "still owed" list above has never had observed.

---

# Plan 6 — "Welcome X" in the web sidebar · **next, PRD drafted**

Asked for mid-session 2026-10-14. Detail, decisions, constraints and the three steps live in
**`prd/3-welcome-greeting.md`** — not duplicated here. Delete the PRD when its step 3 lands.

Two shape decisions were answered the same day: store the MAL username (the alternatives were a
synthetic `mal-123456` address or no name at all), and put the line in the web sidebar only.

**One open question blocks step 3**, and only step 3 — steps 1 and 2 can be built first. A guest
who has linked MAL: show the MAL username, or keep saying "Guest"? The PRD proposes the username;
the counter-argument is that "Guest" is a warning about impermanence that linking MAL does not
make false.

---

# Plan 7 — What the design critique found · **not scheduled**

From the `$impeccable critique` run of 2026-10-14 over the whole user-facing UI, both registers.
Scored 23/40 against 24/40 in August — flat, but P0s went 2 → 1 and Error Recovery climbed on the
back of `errorMessage.ts` and the shared `LoadFailure`. Full report, with the per-heuristic table,
the persona walkthroughs and the arithmetic behind every contrast figure:
`.impeccable/critique/2026-10-14T10-58-29Z__app-tabs.md`. Read that rather than re-deriving it.

**Two decisions were taken the same day and are already written down, not pending:**
- **WCAG conformance is out of scope** for a private non-commercial app. `DESIGN.md`'s Faint Ink
  bullet now records the measured figures (3.80:1 on Warm Paper) instead of the false AA claim it
  carried, and `.impeccable/critique/ignore.md` lists what future critiques must stop raising.
  A future session must not "fix" these contrast values: leaving them is the decision.
  Three things were deliberately **not** ignored and are still live — the ~32dp status chips, the
  six unlabeled icon-only `IconButton`s, and `onPrimary` (step 3 below). Each fails for every
  user, not only an assistive-technology one; `ignore.md` says so in full.
- **`userInterfaceStyle: "light"` was not deliberate.** Step 3 turns it off.

**Ordering note:** step 1 edits the same entry-row block that plan 5's nested-`<button>`
restructure rewrites (`app/series/[id].tsx` around :408–:412). Build plan 5 first and step 1
becomes a two-line change inside a structure that is already correct; build it second and one of
the two will be rewriting the other's work.

### Step 1 — Make the movie half of the rollup tell the truth · no PRD
Three defects, not design changes: the code contradicts `deriveSeriesStatus`.
- `app/series/[id].tsx:408` and `app/series/preview.tsx:257` print `"doesn't count toward X/Y"` on
  every movie row. It has counted since the dual-count work landed —
  `src/domain/seriesStatus.ts:87-88` carries `watchedMovies`/`totalMovies` as its own half and
  `:74-80` requires both halves resolved to reach `WATCHED`. Replace with a real subtitle
  (`Movie 1`, or the runtime/year).
- `app/series/[id].tsx:342-349` heads the section `SEASONS & MOVIES` and then renders a
  seasons-only count, because `seasonProgress` filters to `TV_SEASON`. Show both halves.
- The same header row is gated on `progress.total > 0`, so a standalone movie's Detail screen gets
  no section header and no count at all. Drop the gate so it reads `0/1 movies`.

**Check:** open a series with both seasons and films (Demon Slayer) and confirm the Detail counter
and the status pill agree, and that no row claims a movie doesn't count. Then open a standalone
movie and confirm it shows `0/1 movies` rather than nothing. Failure: the two numbers still
disagree, or the standalone movie's list still has no header.

### Step 2 — Draw the rollup · **needs a PRD before any code**
The critique's central finding: the dual seasons/movies rollup is the one thing no other tracker
has, it is computed correctly, and its entire visual budget is one comma in one string. It renders
as plain body text beside a 7px dot in all four places status appears, while `GradientProgressBar`
— the only progress form in the app — is spent on import progress, the one moment nobody watches.

A two-track meter (seasons over movies, `WONT_WATCH` as a visually distinct segment rather than
silently counted as done) changes what a Library row *is* and touches every surface that renders
status, so it wants a PRD. The open questions it has to settle: does it replace the status dot or
sit beside it; does it appear on Discover tiles and recommendation cards or only Library and
Detail; and what a 0/0 half looks like, since `statusLabel` currently omits an empty half.

### Step 3 — Turn native dark mode on · **needs sign-off, not a PRD**
`app.json:8` sets `"userInterfaceStyle": "light"`, which pins `useColorScheme()` to light on both
iOS and Android. The whole `darkColors` palette, `paperDarkTheme`, and the dark branch of all 44
`makeStyles` factories are therefore unreachable on a phone — maintained code no native user has
ever seen. Web does render them.

One string, but wide reach, and it cannot ship alone:
- `src/theme/theme.ts` hardcodes `onPrimary: '#FFFFFF'` for both appearances while `primary`
  lightens to `#7BA6D6` in dark, so every filled button and active chip computes **2.54:1**.
  Derive `onPrimary` per palette. This is illegibility in the mainline, not a conformance target —
  it is not covered by the accessibility decision above.
- 32 hardcoded `#fff` / `rgba(255,255,255,…)` / `#000000` literals across `app/` and
  `src/components/` do not react to appearance, plus two hardcoded `StatusBar style="light"`.
  `useIsDark` already exists for exactly this and has zero callers outside `theme.ts`.

**Check:** `adb shell cmd uimode night yes` on the emulator, then walk Library → Series Detail →
Discover → For you. Failure: white-on-pale-blue button labels, a light-mode card stranded on a
dark page, or a status hue that shifts between appearances (status colours are meant to be
appearance-invariant by design).

### Step 4 — The empty Library's dead end, and the guest wipe · no PRD
Two P1s, both fixes, both self-contained. Worth landing before plan 4 — a share link sends people
to an app whose first screen may say nothing but "Nothing here yet".
- `app/(tabs)/index.tsx:439` and `:573` render the bare string `"Nothing here yet"` with no action.
  Every guest and every email signup meets the product there, and the three things they could do
  next are one tab away and two levels inside a `dots-vertical` overflow. Make it an onboarding
  card: one purpose line, a filled "Find shows to track" → Discover, plus "Import from
  MyAnimeList" when `malLinked === false`. Give the filtered-empty sibling a "Clear filters".
- `app/onboarding/account.tsx:215` destroys a guest's whole library on one unconfirmed tap
  (`handleLogOut` → `signOut()`, unrecoverable for an anonymous session), styled `mode="outlined"`
  in the same rhythm as every other button, while removing *one show* gets a titled dialog. Put it
  behind the same dialog shape, naming the count, and add one line under the login screen's guest
  button so the risk is disclosed where it is taken.

**Check:** sign in fresh as a guest, confirm the empty Library offers somewhere to go, then tap
"Leave guest mode" and confirm it asks first and names how many shows would be lost.

### Step 5 — Reconcile at real scale · **PRD-sized, the remaining P0**
`app/onboarding/reconcile.tsx:250` hands the user a flat, collapsed list of their entire MAL
history with one instruction and one Confirm. No search, no filter, no sort, no bulk tick, no
reviewed counter — and nothing is persisted, since the only copy of the import lives in component
state, so abandoning it loses everything and the gate re-fires. For the audience PRODUCT.md
actually names (years-old list, only season 1 ever marked) that is 250-plus expand-tick-collapse
cycles in one sitting. It is the highest-probability total task failure in the app.

Two compounding defects, both cheap: entry rows show the generic `'TV Season'`
(`reconcile.tsx:353`) while Detail and Preview both use `numberEntriesByKind` — which is documented
as generic over `ReconcileEntry` *precisely so this screen can share it* — and the entry row is a
plain `View`, so only the 24px checkbox and the title string are tappable, not the row.

The decision its PRD has to make first: does reconcile stay an onboarding step, or become a
persisted, resumable, searchable queue that lives in the app permanently ("48 shows still look
unfinished")? The second answer also removes the destructive full-replace re-import, which today
is the only way to correct marks later and costs every won't-watch mark, manual status and like.

**Trailing housekeeping, not a step:** `.impeccable/design.json` (generated 2026-08-12) still
describes the pre-warm palette and a "Borders-Not-Shadows Rule" that 10 call sites now contradict,
and documents no dark palette. It is what the detector loads as design context. `$impeccable
doctor` reconciles it. Also worth knowing: the detector contributes **no signal** on this codebase
— proven with a positive control, an RN `.tsx` file with 1.6:1 text at 9px scans clean while the
same patterns as HTML/CSS fire two rules. Do not read a clean detector run here as a pass.
