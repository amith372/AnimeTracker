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

## Current state, 2026-10-15

**What a session told "continue" should build: plan 4's step 1** — the public share link, whose
PRD is signed off and whose precondition is met. Plan 9 is finished as of 2026-10-15 (all three
steps built), and everything else scheduled either needs you or needs a conversation first.

**Checks waiting on you, and nothing else is blocking them.** Eight pieces of built work are
waiting on a check only you can run: plan 5's two remaining items (the Edge Function error
messages, the onboarding column width), plan 7's steps 1 and 4, and all three of plan 9's steps.
Each one's **Check:** block says what to open and what failure looks like. Nothing is pushed until
they are confirmed.

**The live project is in step with the code, and nothing is owed on it.**
`20261015010000_shared_libraries.sql` was pushed 2026-10-15 and `npx supabase migration list` shows
every migration applied with no drift. `delete-account` was deployed the same day (`--use-api`,
version 3), which cleared the one deploy that had been outstanding and picked up both
`recommendation_lists` and `shared_libraries` in its sweep.

**Everything scheduled, in order:**

1. **Plan 5** — eight small fixes. All eight built, six checked; the two above are the only thing
   holding it open, and nothing in it is left to write. Ask about them before pushing — plan 5 is
   what the push condition below most likely means.
2. **Plan 7** — execute what the design critique found. **Nothing in it can simply be started**:
   steps 1 and 4 landed 2026-10-15 with checks outstanding, **step 2 needs a PRD**, **step 3 needs
   sign-off**, and **step 5 is PRD-sized**. All three are a conversation first, so don't open this
   plan expecting to build. Read its section before any UI work anyway — it carries a map of every
   dialog and transient state the critique could not see.
3. **Plan 9** — make "For you" fast. **All three steps built**, nothing left to write; the three
   checks above are what remain, and its migration is applied. Changed nothing about what the list
   contains. Plan 3 would multiply its gains rather than replace them.
4. **Plan 4** — the public share link. PRD signed off 2026-10-14, no open questions. **Step 1
   landed and was checked 2026-10-15** (the table, the sharer's controls — create, copy, rename,
   and a revoke that genuinely mints a fresh slug on re-share). **Step 2 landed 2026-10-15 and is
   deployed**, with its curl check outstanding. **Step 3 landed 2026-10-15**, check outstanding.
   **Step 4 — the privacy notice and the CLAUDE.md amendment — is what is left**, and the steps
   live in `prd/2-public-share.md`, not here.

**Unscheduled:** plans 2 and 3. Plan 3 needs a PRD before any of it is touched.

**Do not take "the first step not marked done" by file order** — this list is the order, not the
file. Three sets of `###` headings sit *above* plan 4 and none of them is what to build: plan 2's
two headings are unscheduled, plan 7's steps 2, 3 and 5 each need a PRD or sign-off first, and
plan 5's two remaining items are built and waiting on a check. Plan 4's own steps are not `###`
headings in this file at all — they live in `prd/2-public-share.md`, and the next one to build is
its step 2.

**Done and checked:** plan 1 (recommendation variety), plan 6 (the sidebar greeting) and plan 8
(MAL sign-in on a localhost dev server, which unblocked every check touching sign-in, linking,
import or push) — all 2026-10-14 — plus six of plan 5's eight items, and plan 4's step 1
(2026-10-15).

**The live project is set up for the model steps** as of 2026-10-14: the `taste_profiles` and
`model_call_quota` migrations are applied, `taste-profile` and `taste-candidates` are deployed,
`GROQ_API_KEY` is set, and Global ZDR is on.
**Deploying an Edge Function from this machine needs `--use-api`** — Docker isn't installed, and
without that flag the deploy fails in a way that is easy to scroll past, leaving the client to get
a 404 that surfaces as a generic error.

**Nothing is pushed yet, and there is a condition on it.** `origin/master` is at `244f20f`, **55
commits** behind the branch as of 2026-10-15 (`git rev-list --count 244f20f..HEAD` — count it
again rather than trusting this number). The standing "do not push" was lifted on 2026-10-14 to:
**push once we are done with the current build plan.**

**Do not act on that alone — confirm the scope first.** "The current build plan" was not pinned
down, and the readings differ by a lot of work: plan 5 (the most likely, since it was the plan in
flight when they said it), everything scheduled in the ordering list above, or this file in its
entirety. Ask which, then push. A push is outward-facing and the one action here that cannot be
quietly undone.

**Two different plans were numbered 7 on 2026-10-14** — the design critique's and the OAuth fix's
— because they were written into this file from two directions on the same day. The OAuth one was
renumbered to 8, since the design-critique plan is cross-referenced from three other sections and
it from one. Check the highest existing number before adding a plan.

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
- **`src/theme/colors.ts`'s `shadows` use the deprecated `shadow*` style props.** react-native-web
  warns on every web dev run ("shadow* style props are deprecated. Use boxShadow"). Nothing is
  broken — the shadows render — but it is not a find-and-replace either: `shadow*` is still the
  correct API for native iOS, while `boxShadow` is the web/new-architecture one, so a fix needs
  platform handling rather than a swap. Its own small piece of work.
  Two other warnings on the same run are **not ours** and should not be chased: `props.pointerEvents
  is deprecated` (no match anywhere in `app/` or `src/` — it comes from Paper or Expo internals) and
  the `useNativeDriver` notice (Paper's animations on web, where there is no native animation
  module). Checked 2026-10-14.
  For the avoidance of a future false alarm: **"Development-level warnings: ON. Performance
  optimizations: OFF."** on a web dev run is react-native-web's normal dev banner, not a
  misconfiguration. A production export flips it.
- **An account that linked MAL before 2026-10-14 and never signs in through MAL again has no
  `mal_username`**, so its sidebar reads "Welcome back" rather than a name. This is the single case
  plan 6's dropped step 2 (`mal-me`) would have covered. It cannot arise for an account created by
  "Continue with MyAnimeList", since that path signs in through MAL by definition; it needs an
  email/password account that linked MAL once, long ago. Worth a backfill function only if such an
  account turns out to exist.
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
  gone, so nothing can sign into it from the app. That orphan has a cause rather than being a
  one-off, and plan 5's guest-exit item is what stops the app minting more of them. Never `db push` a migration here expecting a
  no-op: `create policy` and `cron.schedule` are not idempotent.

---

# Plan 1 — Recommendations with deeper taste and real variety · **done 2026-10-14**

Nine steps (0–8, including 5½), all built and checked. `prd/1-recommendation-variety.md` was
deleted when step 8 landed, as planned, so `git log` is where its reasoning lives; what it left
owed is in "What is still owed" above.

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

# Plan 4 — A public, account-free share link for your list · **scheduled, unblocked**

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

**Step 1 landed and was checked 2026-10-15.** Four things it settled that the PRD did not say,
now written into `prd/2-public-share.md` so the next step reads them there: the controls are a
dialog off the Library's three-dot menu (`src/components/ShareListDialog.tsx`), not a block on the
account screen, and it carries its own confirmations as states rather than stacking a second
dialog (the PRD put the exposure copy on the revoke, where the guest warning could no longer be
acted on); `EXPO_PUBLIC_SITE_URL` is set in the local `.env` and falls back to
`window.location.origin` on web, so a dev server produces a working link; and `expo-clipboard` is
a new dependency, so **a native build needs `npx expo run:android` rather than a Metro reload**.

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

# Plan 5 — Eight things found 2026-10-14 · **all eight built, two checks outstanding**

Found while checking plan 1 step 8, then while looking at the Account screen and the Library on a
wide monitor. Fixes and copy, not features, so none of them needed a PRD. **Nothing here is left
to write.** Six are built and checked, one line each below; the two that still carry a **Check:**
block are the only thing holding the plan open.

Nested `<button>` on Series Detail · **done + checked 2026-10-14**
The hero's heart and trash were unclickable · **done + checked 2026-10-14**
The ⓘ button duplicated the summary · **done + checked 2026-10-14**
Discover's Add dialog truncated the synopsis · **done + checked 2026-10-14**
A guest had two ways out and only one deleted anything · **done + checked 2026-10-15**
The wide-web Library grid laid out 6 cards, then 1 · **done + checked 2026-10-15**

### Edge Function error messages were unwrapped and then discarded · **built 2026-10-14, check outstanding**
`invoke()` throws `UserFacingError` when the response status is anything but a catch-all 500, so
the sentence a function deliberately wrote for the user survives `userFacingMessage()` instead of
being replaced by a generic fallback. **The status is the tag**: every branch that worded its own
error returns a deliberate status, every handler's catch-all returns 500 with `describeError(e)` or
a raw PostgrestError message. `isUserFacingEdgeStatus` in `src/repositories/errorMessage.ts` is the
rule and `__tests__/errorMessage.test.ts` holds the functions to their half of it — a developer
string returned at 403 would otherwise land in a Snackbar with nothing to notice it. Both model
functions log Groq's body and return only the provider-refused sentence with its status, since the
status is what distinguishes a revoked key from a rate limit and the body is developer JSON.

**Check:** `supabase secrets set GROQ_API_KEY=invalid`, redeploy `taste-profile` and
`taste-candidates` (**with `--use-api`** — no Docker on this machine, and without the flag the
deploy fails quietly), then open "For you". The notice must be the function's own sentence, naming
the provider and carrying the HTTP status it got back. Put the real key back afterwards. Failure: a
generic "something went wrong" instead, or developer JSON reaching the screen.

### The Account screen stretched across a wide monitor · **built 2026-10-14, check outstanding**
The four onboarding screens cap their content at `layout.onboardingColumn` (480) and centre it,
with the page background moved to a full-bleed parent so the cap doesn't paint a 480px stripe of
Warm Paper on the navigator's own background. **One number, not two**, settled by an `$impeccable`
run: the privacy notice is set at `bodyMedium`'s 14px, so 448 of content is ~64 characters, and 480
is the Discover searchbar's existing cap rather than a fifth unrelated width. Recorded in
`DESIGN.md`'s wide-web register, including why it is the one entry there *not* gated on the 900px
breakpoint — the same style is already correct on a phone. `login.tsx` needed no column (its
controls shrink-wrap) but its subtitle and error text did, which matters more now that an Edge
Function's own sentence reaches them verbatim. `reconcile.tsx` got the cheap version, one wrapper
around count, list and button, since plan 7 step 5 rewrites that screen.

Measured over CDP at 1920 / 900 / 390 / 320: the column is 480 and centred above the cap, full
width below it, `scrollWidth == clientWidth` at every one. **A headless screenshot at 390 looked
like it overflowed and the measurement says it doesn't** — the window-size screenshot crops a wider
layout viewport. Privacy and reconcile both need a session, so neither could be reached headlessly;
they share account's verified container exactly, which is why your check is what covers them.

**Check:** maximised browser, then the four onboarding screens — login, account, the privacy
notice and reconcile. Content sits in one centred column rather than stretching the full width, and
no screen scrolls sideways. Then the same screens on the Android emulator: there the column should
simply be full width, with nothing clipped. Failure: a screen whose text runs the whole width of the
monitor, a 480px stripe of a different background colour behind the column, or a phone layout that
now has margins it didn't have before.

# Plan 6 — "Welcome X" in the web sidebar · **done 2026-10-14**

Both halves checked. `prd/3-welcome-greeting.md` deleted. Step 2 (`mal-me`) was dropped on
evidence — "What is still owed" has the one case it would have covered.

# Plan 7 — What the design critique found · **scheduled 2026-10-14, after plan 5**

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

## What the critique never saw — point the next run at these

Asked for 2026-10-14. The run read the UI as it renders at rest, so **every transient surface was
invisible to it**: a dialog that is only mounted while a state flag is true, an error state that
needs a failure to produce, a hover style that needs a pointer. These are a large share of what the
app actually is, and several are the moments that matter most — a confirmation before a
hard-to-reverse action is exactly where clarity is worth the most. Hand the next run this list with
how to reach each, rather than asking it to find them.

**Dialogs, and what opens each:**

| Where | Dialog | How to open it |
|---|---|---|
| Library | More menu | the ⋯ button in the header |
| Library | Remove series | the remove action on a series card |
| Library | Push to MyAnimeList | the push button — only visible when MAL is linked |
| For you | Genre / Sort / Type / Length | the four filter chips above the list |
| Series Detail | Remove series | the trash icon in the hero |
| Series Detail | Entry image + summary | tap an entry's title (`EntryImageDialog`) |
| Preview | Full summary | tap the summary blurb (both registers) |
| Discover | Add series | tap any poster tile (`AddSeriesDialog`) |
| Reconcile | Replace existing library | import when a library already exists |
| Account | Delete everything | the delete action — the most destructive dialog in the app |

**Non-dialog states it also could not have seen:** every screen's loading and progress text
(Recommendations has three distinct stages with counts); empty states (an empty Library, a filtered
list with no matches, Catch up with nothing outstanding); error states and their Retry; Snackbars;
web hover styles on cards, nav rows and poster tiles; Discover's full-screen search mode; the taste
profile card in each of its four states (not enough signal, generating, generated-collapsed,
generated-expanded); and the reconcile screen at real scale, which step 5 below already covers.

**Ordering note — satisfied 2026-10-15.** Step 1 edits the same entry-row block that plan 5's
nested-`<button>` restructure rewrote (`app/series/[id].tsx` around :408–:412), and plan 5 has
landed, so step 1 is now the two-line change inside a structure that is already correct. Nothing
blocks it.

### Step 1 — Make the movie half of the rollup tell the truth · **done 2026-10-15, check outstanding**
All three defects fixed. The one decision worth carrying: `seasonProgress` became `entryProgress`
(both halves), and the counter is now worded by a **shared** `progressPhrase` in `statusLabel.ts`
that the status pill is also built from — so the counter and the pill cannot word the same counts
differently, which was the whole defect. They still differ in the seasons *number* on a show with a
gap in it (pill = consecutive run from season 1, counter = plain total); that is deliberate, is
commented in both places, and `__tests__/entryProgress.test.ts` pins it. The movie row's subtitle is
now just `Movie 1` — there is no runtime or release year on a `SeriesEntry` to put there instead.

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

### Step 4 — The empty Library's dead end, and the guest wipe · **done 2026-10-15, check outstanding**
Both P1s fixed. Three things worth carrying:
- `LibraryEmptyState` in `app/(tabs)/index.tsx` is one component serving both registers and both
  cases, because they are different kinds of thing: an empty library is a dead end and gets the
  onboarding card, a filtered-empty one is not (the shows are there, a chip is hiding them) and
  gets only `Clear filters`. That button resets all three hiders — status chip, search box *and*
  the Watched X/Y count lens — since the empty state cannot tell which is to blame.
- **"Import from MyAnimeList" showing only when `malLinked === false` is not backwards**, and the
  comment in the file says so: once MAL *is* linked the import gate above this screen has already
  run, so there is no list left to offer. The button goes to Account, because linking comes first,
  and the `useFocusEffect` re-read plus the gate carry it to reconcile from there.
- The delete dialog now names the count, and is deliberately silent about it while the library read
  is in flight or failed rather than falling back to zero. The login screen's guest note stays one
  line rather than a dialog — continuing as a guest is the safe, reversible choice at the moment it
  is made, and it should stay one tap.

**Check:** sign in fresh as a guest and confirm the login screen now says, under the guest button,
that a guest list can't be signed back into. The empty Library should offer somewhere to go —
"Find shows to track" reaches Discover, and "Import from MyAnimeList" is offered and reaches
Account. Then on an account *with* shows, set a status filter that matches nothing and confirm
"Clear filters" brings every row back. Finally open Account and press the exit: the dialog names
how many shows would be lost, and the number matches the Library. Do the Library half in both
registers — the wide-web grid and the phone list are the same component but not the same layout.
Failure: an empty Library still offering nothing, "Clear filters" leaving the list empty (it must
reset the search box and the Watched X/Y lens too, not just the chip), or a dialog claiming zero
shows for a library that has some.

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

---

# Plan 8 — MAL sign-in that works in dev and production at once · **done 2026-10-14**

Both halves checked: a dev server on localhost completes MAL sign-in and the deployed site still
does. `prd/4-dev-oauth-origin.md` deleted. The one constraint it left behind — that
`oauthOrigin.ts`'s allowlist must never name a routable host, since what such a redirect carries is
a code exchangeable for a session — lives in that file's header and in `__tests__/oauthOrigin.test.ts`.

---

# Plan 9 — Make "For you" fast · **all three steps built, three checks outstanding**

Asked for 2026-10-14: the Recommendations list takes too long. Measured against the code rather
than guessed at, **the wall time is network round trips, not computation** — and most of them are
to our own Postgres, not to MAL. Plan 3's measurement is the unit: ~390ms per round trip to the
current region, of which ~350ms is the edge→region leg. `src/repositories/apiCache.ts`'s `cached()`
makes one of those *per anime*, and a warm run makes roughly `2 × watched series + 172 candidates +
grouping + closure` of them — several hundred. That is the whole problem, and none of it is MAL's
fault: the shared cache is doing its job, it is just being asked one key at a time.

**Nothing here changes what the list contains**, which is why it needs no PRD and why every step's
check is the same list, faster. `MAX_CANDIDATE_DETAILS` stays at 160 — plan 1 step 8 raised it
precisely so a 60-row list can fill, and lowering it would buy speed with yield. Plan 3 multiplies
all three steps below (~350ms → ~50ms a trip would cut whatever remains by roughly 7×) and is
independent of them; neither waits on the other.

### Step 1 — Stop fetching what the pipeline already holds · **done 2026-10-15, check outstanding**
`fetchDetailsAndGroup` now takes an optional `preloadedDetails` map and skips the detail fetch for
any id already in it; Recommendations passes the map it ranked from. Discover's callers pass
nothing and are unchanged. The closure-expansion passes still fetch, as planned — those ids are
genuinely new.

**Check:** open "For you" on a warm cache and watch the progress line. `Grouping results (n/N)`
should reach N almost immediately rather than crawling, and the finished list must be *the same
shows in the same order* as before the change — compare the first ten rows against a screenshot
taken first. Failure: a row that was there is missing, the order changed, or the stage still crawls
(the map isn't reaching it).

### Step 2 — One cache read per stage, not one per anime · **done 2026-10-15, check outstanding**
`cachedMany()` sits beside `cached()` in `apiCache.ts`: one chunked `select … in (keys)`, the
partition, MAL calls for the misses only at the caller's own concurrency, and one array upsert back.
All three stages are on it — the source stage's `recs:`/`detail:` pair (two bulk reads where there
were `2 × watched series`), the candidate detail stage, and each closure pass in
`fetchDetailsAndGroup`. Key space, TTL and version segments are untouched, so no warm cache was
thrown away, and the MAL request count is unchanged in both directions.

Three things worth carrying:
- **The partition is its own module**, `src/repositories/cachePartition.ts`, not a function inside
  `apiCache.ts`: importing `apiCache.ts` pulls in `supabaseClient.ts` and through it AsyncStorage's
  native module, which no Jest test can load. `__tests__/cachePartition.test.ts` pins it with an
  injected `now` and timestamps dated on paper, including a row *exactly* one TTL old — the case a
  `<=` would get wrong. Verified by flipping that comparison: three of its tests fail.
- **`concurrency` is a required option, not a default.** It is the pacing of real MAL requests
  (guardrail #3), so each call site states its own rather than inheriting a number from the cache.
- **The source stage counts a series done only once both its key spaces have settled.** Both bulk
  reads drive one counter, so without that pair count "Checking your watched series (n/N)" would
  reach N twice. A cold run still has 2 × 12 MAL requests in flight, exactly as the old
  twelve-series-wide loop making two calls apiece did.

**Check:** time "For you" end to end on a warm cache before and after. Open the browser Network tab
during a run: requests to `api_cache` should number in the handful, not the hundreds, and the stage
counters should jump in large increments rather than ticking up one at a time. The list is the same
list. Failure: a different list, hundreds of `api_cache` requests still, or a MAL call for
something that was cached a moment ago.

### Step 3 — Keep the finished list; recompute only when taste changes · **done 2026-10-15, check outstanding**
The finished list is stored in a new `recommendation_lists` table, one row per account, and the
screen hydrates from it on mount. A stored list whose fingerprint still matches the library renders
and costs nothing; one that no longer matches renders *anyway* and the recompute runs underneath
it; nothing stored computes from scratch as before. `useEffect(() => load(), [])` is gone.

The three shape decisions the step asked for, as settled:
- **Its own table, not a column on `taste_profiles`.** `taste_profiles.profile` is `not null`, so
  an account under `MIN_TASTE_VERDICTS` has no row there at all — and those are exactly the small
  libraries whose recommendations still work, since the MAL-tally and genre halves need no model.
  Sharing the row would have meant either denying them the cache or making `profile` nullable. The
  migration's header carries all three reasons.
- **A stale list stays on screen while the recompute runs**, which is the entire point. The
  progress line moves to a `bodySmall` line directly above the rows and the header's refresh
  button becomes a spinner; `ScreenState.LOADING` (which blanks the screen) is reached only when
  there is genuinely nothing to show. A recompute that *fails* underneath a list leaves that list
  alone rather than replacing it with an error — only a first load reports one. The manual refresh
  keeps the list up too: it was pressed on a list the user can see.
- **RLS owner-only**, same policy and grants as `taste_profiles`, and the table is in
  `delete-account`'s sweep — `__tests__/deleteAccount.test.ts` is what fails if a per-user table is
  ever added and the sweep isn't.

Two things worth carrying:
- **The fingerprint is `tasteFingerprint` plus a row-shape version segment** (`r1:`), the same
  convention as `apiCache`'s `DETAIL_CACHE_VERSION`: bump it when what a stored row *contains*
  changes and every stored list rebuilds itself, where otherwise an old row is still valid JSON
  and a new field would read as `undefined` for as long as the library sat still.
- **The taste fingerprint is enough even though the ranking also depends on which shows are
  tracked.** Adding a show to Plan to watch doesn't move it — but the screen already filters
  whatever list it holds against the live tracked-id set on every render, so a newly tracked show
  disappears from a restored list with no recompute at all. A *fresh ranking* after a removal still
  needs the refresh button, exactly as before this step.
  `__tests__/recommendationCache.test.ts` pins that division of labour rather than leaving it to
  the comment, along with the ticks that must and must not invalidate a list.

**The migration is applied** — pushed 2026-10-15 and confirmed against `npx supabase migration
list`, so the check below can run as written. `delete-account` still wants a redeploy (`--use-api`)
to pick up the new table in its sweep; that is belt-and-braces, since the table's `on delete
cascade` is what actually removes the row, and it blocks nothing.

**Check:** open "For you" and wait for the list, then reload the page — the same list appears with
no progress line at all. Now mark the last unwatched season of a show as watched (or like one) and
open "For you" again: it recomputes, and **the old list is on screen while it does**, with the
progress line above it and a spinner where the refresh button was. Press refresh on a loaded list
and confirm the same thing — the list stays put rather than blanking. Finally tick a season that
*doesn't* finish a show (3/5 → 4/5) and reopen "For you": it must render instantly with no
recompute. Failure: a reload still rebuilding from scratch, a like or a finishing tick not
producing a fresh list, a spinner replacing a list that was already there, or a mid-progress tick
costing a rebuild.

