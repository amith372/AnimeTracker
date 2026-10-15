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

**What comes next, in order.**

1. **Plan 5** — eight small fixes found 2026-10-14. **Seven are built; one remains**, and the
   remaining one is listed under a `###` heading while the built ones are compressed to a
   paragraph each — so the next thing to build is the one `###` heading **inside plan 5's own
   section**. Plan 2's `###` headings sit earlier in the file and are not scheduled; don't start
   there. Three built items
   are still waiting on a check the user runs: the Edge Function error messages need
   `supabase secrets set GROQ_API_KEY=invalid` and a redeploy of `taste-profile` and
   `taste-candidates` (with `--use-api`); the onboarding column width needs a maximised browser,
   then the Android emulator; and the guest's single exit needs a guest session plus the Supabase
   dashboard. The remaining item, the Library grid laying out 6 cards then 1, needs nothing from
   the user and can be built straight away.
2. **Plan 7** — execute what the design critique found. **Scheduled 2026-10-14 at the user's
   request**, after plan 5. Read its own section first: it carries a map of every dialog and
   transient state the critique could not see, and an ordering note about plan 5.
3. **Plan 9** — make "For you" fast. Unblocked, no PRD, changes nothing about what the list
   contains. Independent of plan 3, which would multiply it rather than replace it.
4. **Plan 4** — the public share link. PRD signed off 2026-10-14, no open questions, start at its
   step 1. Worth landing plan 7's step 4 first, so a share link is not put in front of an empty
   Library.

**Done and checked 2026-10-14:** plan 1 (recommendation variety), plan 6 (the sidebar greeting),
and plan 8 (MAL sign-in on a localhost dev server, which unblocked every check touching sign-in,
linking, import or push).

**Unscheduled:** plans 2 and 3.

**Nothing is pushed yet, and there is now a condition on it.** `origin/master` is at `244f20f`,
roughly 40 commits behind the branch as of 2026-10-14. The user's standing "do not push" was
lifted that day to: **push once we are done with the current build plan.**

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

# Plan 5 — Eight things found 2026-10-14 · **unblocked, small**

Found while checking plan 1 step 8, then while looking at the Account screen and the Library on a
wide monitor. Fixes and copy, not features, so none of them needs a PRD — though the width item
held one number that a design skill settled before any style was written. **Seven have landed and
are compressed to a paragraph each below; the one left is the `###` heading at the end of this
section.**

Nested `<button>` on Series Detail · **done 2026-10-14** — the row is a plain `View` with sibling
controls; the press target is the text block. `ArcListRow` matches it deliberately so neither can
drift back.

The hero's heart and trash were unclickable · **done 2026-10-14** — `headerTopRow` needed
`zIndex: 1`, because react-native-web makes every View positioned and the later `headerContent`
painted over it. **Worth remembering why this mattered beyond a dead button:** `liked` carries
`LIKED_WEIGHT = 3` against a default of 1 across four ranking signals, so every recommendation
produced before this fix ran with no liked signal at all. The buttons also gained hover captions
(`HeroActionButton`, not Paper's `Tooltip` — see the commit for the three reasons that was removed)
and the heart fills `colors.red`.

The ⓘ button duplicated the summary · **done 2026-10-14** — removed from both registers; the blurb
now says **"Read more"**, matching what the Detail screen's synopsis already says for the same job.
The copy question this briefly opened is **closed, not deferred**: "click" was wrong on the phone
this component also renders on, and "tap" would have been wrong on the desktop, so the only
candidate that is not false on one platform is the one the app already used. The two screens still
reveal the text differently — Detail expands in place and can offer "Show less", Preview opens a
dialog and cannot — but the invitation to read it is now one phrase.

**Reaching `app/series/preview.tsx` is not obvious, and the check for this item got it wrong
once.** It is pushed from **exactly one place**: `app/(tabs)/recommend.tsx:173` — "For you" → the
**Recommended** tab → tap a card. Discover's poster tiles do *not* open it, they open the quick
`AddSeriesDialog`; Catch-up cards go to the real Detail screen. Nothing about the screen's name
suggests it is reachable only from recommendations, so check it there or not at all.

Edge Function error messages were unwrapped and then discarded · **done 2026-10-14** —
`invoke()` now throws `UserFacingError` when the response status is anything but a catch-all 500,
so the sentence a function deliberately wrote for the user survives `userFacingMessage()` instead
of being replaced by a generic fallback. **The status is the tag**, decided 2026-10-14: every
branch that worded its own error returns a deliberate status, every handler's catch-all returns 500
with `describeError(e)` or a raw PostgrestError message. `isUserFacingEdgeStatus` in
`src/repositories/errorMessage.ts` is the rule and `__tests__/errorMessage.test.ts` holds the
functions to their half of it — a developer string returned at 403 would otherwise land in a
Snackbar with nothing to notice it. The provider-wording judgement call is **closed**: both model
functions log Groq's body and return only `The model provider refused the request (429).`, since
the status is what distinguishes a revoked key from a rate limit and the body is developer JSON.
**Out of scope deliberately:** fresh picks still degrade to one notice
(`GeneratedCandidateRepository.ts:139`) — that is the PRD's decision, not this discard.

The Account screen stretched across a wide monitor · **done 2026-10-14** — the four onboarding
screens cap their content at `layout.onboardingColumn` (480) and centre it, with the page
background moved to a full-bleed parent so the cap doesn't paint a 480px stripe of Warm Paper on
the navigator's own background. **One number, not two**, settled by an `$impeccable` run: the
privacy notice is set at `bodyMedium`'s 14px, so 448 of content is ~64 characters — a wider reading
column would overrun the measure rather than improve it — and 480 is the Discover searchbar's
existing cap rather than a fifth unrelated width. Recorded in `DESIGN.md`'s wide-web register,
including why it is the one entry there *not* gated on the 900px breakpoint. Not gated because the
same style is already correct on a phone. `login.tsx` needed no column (its controls shrink-wrap)
but its subtitle and error text did, which matters more now that an Edge Function's own sentence
reaches them verbatim. `reconcile.tsx` got the cheap version the plan asked for — one wrapper
around count, list and button — since plan 7 step 5 rewrites that screen.

Measured over CDP at 1920 / 900 / 390 / 320: the column is 480 and centred above the cap, full
width below it, `scrollWidth == clientWidth` at every one. **A headless screenshot at 390 looked
like it overflowed and the measurement says it doesn't** — the window-size screenshot crops a wider
layout viewport. Privacy and reconcile both need a session, so neither could be reached headlessly;
they share account's verified container exactly, and the user's check is what covers them.

A guest had two ways out and only one deleted anything · **done 2026-10-15** — the guest branch
of `app/onboarding/account.tsx` now has exactly one exit, `Leave guest mode and delete this list`,
calling `deleteAccountAndData()`; `logOutAccount` is reachable from the real-account branch only.
`dataSection()` takes a `DeleteWording` pair (button, title, scope, warning, confirm) rather than
being branched on inside, so the two branches' words can differ while the delete button's existence
cannot. The guest wording never says "account" or "log out" — both are false for an anonymous
session. **Scope leads and the warning follows**, decided 2026-10-15: saying what is and isn't
deleted before the irreversible sentence is what makes the alarm land on the right thing, and it
stops the one reassuring line (MyAnimeList untouched) sitting under a paragraph. The guest branch
also gained `Log in to an existing account`, since signing out was a guest's only route to the
login screen and collapsing the exits would otherwise have made owning an account cost the guest
list. **One thing that was not in the item and should be read before the check:** logging in from
a guest session abandons the guest's rows exactly as signing out did — the same orphan this item
exists to stop — so the button carries a `bodySmall` line saying the list stays behind and offering
the delete first. Cut it if that is the wrong call; the alternative is a confirmation dialog on
`Log in`, which is more machinery than a disclosure.

**Check:** continue as a guest and open Account. There is exactly one way out, it names the guest
list rather than an account, and confirming it leaves nothing behind — verify in the Supabase
dashboard that the `auth.users` row is gone, not merely signed out. Then confirm `Log in to an
existing account` reaches an existing account from the guest branch without deleting anything, and
that a real account still sees both log-out and Delete everything, unchanged. Failure: a guest told
the app is deleting an "account", a second silent exit still present, or an `auth.users` row
surviving the delete.

Discover's Add dialog truncated the synopsis · **done 2026-10-14** — `AddSeriesDialog` now expands
the summary in place, with the same "Read more" / "Show less" wording as Detail and Preview. It
expands rather than linking away because this dialog is where the decision to add is made; sending
someone to another screen to finish a sentence meant cancelling the dialog they were completing.
`Dialog.ScrollArea` already scrolled, so the longer text cost nothing.

The affordance is **bold** (`fontFamilies.bodyBold`, overriding Paper's `labelSmall` Medium) in all
three places, asked for 2026-10-14. It is the one thing on the dialog a user has to notice
unprompted — nothing else says the clipped text continues — and at 500 it read as more paragraph.

### The wide-web Library grid lays out 6 cards, then 1, then 6, then 1
Seen 2026-10-14 on a maximised browser: every row holds six posters and then a seventh sits alone
on a line of its own, so the grid reads as alternating full and near-empty rows instead of a block.
Every row should hold the same number of cards.

`app/(tabs)/index.tsx:120` computes `gridColumns` from the width measured by the `onLayout` on the
wrapping `webGrid` `View` (`:440`), but the cards are laid out inside the FlatList's *content box*,
which is narrower than that View by the vertical scrollbar (~15px in desktop Chrome) — and `floor`
over a 206px pitch only has to be wrong by a pixel to return one column too many. `columnWrapperStyle`
is `flexWrap: 'wrap'` (`:449`, `:797`), so FlatList packs `gridColumns` fixed-184px cards into a row
that cannot hold them and the last one silently wraps. That is the whole pattern: the one lonely
card per row is the overflowing column, not a grouping or a sort. It also means the symptom only
appears in the band of window widths where the slack is smaller than the scrollbar, which is why it
comes and goes with a window resize rather than being there at every size.

Two halves to the fix, and the second is the one that matters:
- Measure what the cards are actually laid out in, not its parent — `onLayout` on something inside
  the scroll view, or subtract a scrollbar allowance from the measured width.
- **Make the miscount impossible to express.** With `flexWrap` on the row, a column count that is
  one too high renders as a plausible-looking ragged grid instead of failing visibly; without it,
  the same miscount would be an obvious overflow. Letting the cards share the row's slack
  (`flex: 1` with a `maxWidth`, rather than a fixed 184) also stops the grid leaving a card's worth
  of empty gutter on the right at most widths.

Discover's grid is not affected — it uses a fixed `numColumns` and no `columnWrapperStyle`
(`app/(tabs)/discover.tsx:289`) — so scope is the Library grid only.

**Check:** open the Library maximised on the wide monitor and drag the window slowly from narrow to
full width. At every width every row holds the same number of cards, and no row ever holds a single
card with empty space beside it. Failure: the 6-then-1 pattern reappearing at some width, a card
clipped at the right edge, or the column count no longer growing with the window at all.

---

# Plan 6 — "Welcome X" in the web sidebar · **done 2026-10-14**

Checked both halves: the sidebar greets by MAL username, and a guest reads "Welcome Guest".
`prd/3-welcome-greeting.md` deleted. Step 2 (`mal-me`) was dropped on evidence — see "What is
still owed" for the one case it would have covered.

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
  in the same rhythm as every other button, while removing *one show* gets a titled dialog.
  **Plan 5's guest-exit item deletes that tap outright**, so what is left here is the rest of the
  same thought: name the count in the dialog that replaces it, and add one line under the login
  screen's guest button so the risk is disclosed where it is taken. If plan 5 has not landed yet,
  build it first rather than putting a dialog on a button that is about to be removed.

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

---

# Plan 8 — MAL sign-in that works in dev and production at once · **done 2026-10-14**

Both halves of its check passed: a dev server on localhost now completes MAL sign-in, and the
deployed site still does. `prd/4-dev-oauth-origin.md` deleted.

**The one thing worth carrying forward**, because widening it would be a real security hole rather
than a tuning change: `supabase/functions/_shared/oauthOrigin.ts`'s allowlist is `SITE_URL` plus
loopback, and loopback is only safe because such a redirect resolves on whichever machine follows
it. Any entry naming a routable host would hand out session handoff codes. The reasoning is in that
file's header and in commit `d65eada`; `__tests__/oauthOrigin.test.ts` holds the twelve cases.

---

# Plan 9 — Make "For you" fast · **unblocked, no PRD**

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

### Step 1 — Stop fetching what the pipeline already holds
`fetchRecommendations` fills a `detailById` map for every candidate, then hands the ranked list to
`fetchDetailsAndGroup`, which calls `getAnimeDetailCached` for **those same ids all over again**
(`src/repositories/DiscoverRepository.ts:152`) at `DETAIL_FETCH_CONCURRENCY = 6`. On a library
producing ~150 ranked candidates that is ~150 round trips — call it ten seconds — for data already
in memory. The closure-expansion passes below it are genuinely new ids and stay as they are.

Fix: `fetchDetailsAndGroup` takes an optional preloaded `Map<number, AnimeDetailDto>` and skips the
fetch for any id already in it. Discover's callers pass nothing and are untouched.

**Check:** open "For you" on a warm cache and watch the progress line. `Grouping results (n/N)`
should reach N almost immediately rather than crawling, and the finished list must be *the same
shows in the same order* as before the change — compare the first ten rows against a screenshot
taken first. Failure: a row that was there is missing, the order changed, or the stage still crawls
(the map isn't reaching it).

### Step 2 — One cache read per stage, not one per anime
Add `cachedMany(keys, fetchMissing)` beside `cached()` in `apiCache.ts`: a single
`select('key, json, fetched_at').in('key', keys)`, partition the result into fresh hits / stale /
missing, run the fetcher only for the misses at the existing concurrency, and write back with one
array upsert instead of one per key. Chunk the `in` list (~200 keys) so a long one can't run into a
URL-length limit. `cached()` stays for genuine single-key callers.

Then move the three stages onto it: the source stage's `recs:`/`detail:` pair, the candidate
detail stage, and each closure pass's `missing` set. **Key space, TTL and version segments are
unchanged** — these are the same rows, read in bulk — so nothing needs a version bump and no warm
cache is thrown away. Guardrail #3 is unaffected in the right direction: fewer requests, and the
batched read goes to our own Postgres, never to MAL.

The partition (which keys count as fresh, stale, or absent) is pure logic and gets a Jest test with
fixed `fetched_at` values and an injected clock — **expected splits derived on paper from those
timestamps**, not read off what the implementation returned.

**Check:** time "For you" end to end on a warm cache before and after. Open the browser Network tab
during a run: requests to `api_cache` should number in the handful, not the hundreds, and the stage
counters should jump in large increments rather than ticking up one at a time. The list is the same
list. Failure: a different list, hundreds of `api_cache` requests still, or a MAL call for
something that was cached a moment ago.

### Step 3 — Keep the finished list; recompute only when taste changes
`app/(tabs)/recommend.tsx:160` is `useEffect(() => load(), [])`, so the entire pipeline re-runs on
every mount and every page reload, to rebuild a list that usually cannot have changed.
`src/domain/tasteProfile.ts` already computes the digest that answers "has the library changed in a
way that matters" — a like, a drop, or a *finishing* tick — and `taste_profiles.source_fingerprint`
already stores one. Store the finished rows under the same fingerprint, render them immediately on
mount, and recompute only when the fingerprint differs or the manual refresh is pressed (which
already bypasses the MAL cache and must keep doing so).

Three shape decisions to settle while building, none of them wide enough for a PRD: whether the
rows live in their own table or alongside `taste_profiles`; that a stale-but-present list renders
*while* the recompute runs rather than being replaced by a spinner (that is the entire point);
and RLS owner-only, same as `taste_profiles` — this is derived from one person's library, so it is
as personal as the profile and must never go anywhere near `api_cache`, which is `anon`-readable.

**Check:** open "For you", wait for the list, then reload the page — the same list appears with no
progress line at all. Now mark the last unwatched season of a show as watched (or like one) and open
"For you" again: it recomputes, and the old list is on screen while it does. Failure: a reload still
rebuilding from scratch, a like or a finishing tick not producing a fresh list, or a spinner
replacing a list that was already there.
