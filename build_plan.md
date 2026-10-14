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

1. **Plan 5** — five small fixes found 2026-10-14. Unblocked, no PRD, and the natural next thing:
   each is self-contained and two of them (the nested `<button>`, the swallowed Edge Function error
   messages) are defects a user can hit today. One carries a UX question to settle before code.
2. **Plan 9** — make "For you" fast. Unblocked, no PRD, changes nothing about what the list
   contains. Independent of plan 3, which would multiply it rather than replace it.
3. **Plan 4** — the public share link. PRD signed off 2026-10-14, no open questions, start at its
   step 1. Worth landing plan 7's step 4 first, so a share link is not put in front of an empty
   Library.

**Done and checked 2026-10-14:** plan 1 (recommendation variety), plan 6 (the sidebar greeting),
and plan 8 (MAL sign-in on a localhost dev server, which unblocked every check touching sign-in,
linking, import or push).

**Unscheduled:** plans 2, 3 and 7 — though plan 7's step 1 is three defect fixes needing no PRD.

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

# Plan 5 — Five things found 2026-10-14 · **unblocked, small**

The first two were found while checking plan 1 step 8; the next two while looking at the Account
screen on a wide monitor; the fifth while looking at the Library on the same monitor. Fixes and copy, not features, so none of them needs a PRD — though the
width item holds one number that a design skill should settle before any style is written. The last
two both edit `app/onboarding/account.tsx`, so build them in one sitting.

### Illegal nested `<button>` on Series Detail (web) · **built 2026-10-14, awaiting its check**
Settled first: the press target is the text block, not the whole row (asked 2026-10-14). Both
`EntryRow` and `ArcListRow` are now a plain `View` holding sibling controls, and they are kept
structurally identical so neither grows a nested button again.

**Check:** open a Series Detail page on web with the console open — no `validateDOMNesting` error
and no red toast. Tapping the title or subtitle still opens the image popup; the checkbox and the
skip button still work and neither opens the popup. The One Piece entry's arc header behaves the
same. Failure: the error still logging, the popup no longer opening, or a control that now triggers
two things at once.

### The hero's heart and trash were unclickable · **fixed 2026-10-14, awaiting its check**
`DetailHeroCard`'s `headerTopRow` is `position: absolute`, and react-native-web gives every View
`position: relative` — so its sibling `headerContent`, which comes later in DOM order and is
`flex: 1` across the whole header, was a positioned element painting on top of it. The buttons
stayed visible (no background) but stopped receiving clicks. The heart was dead outright; the trash
only worked in the ~16px strip past `headerContent`'s right padding, which is why it never looked
like a systemic problem. Fixed with `zIndex: 1`.

**This had a second cost worth recording:** `liked` carries `LIKED_WEIGHT = 3` against a default of
1 across *four* signals — the MAL tally, genre affinity, studio/source affinity and era centre — so
for as long as the heart was unclickable the ranking ran with no liked signal at all. Any judgement
about recommendation quality formed before this fix was formed on a crippled profile.

Two changes came with the fix, asked for 2026-10-14 once the buttons worked: both are wrapped in
Paper's `Tooltip` (hover on web, long-press on a phone), and the heart fills `colors.red` rather
than white — the outline stays white so an unliked heart reads as an available action rather than a
state that is already on. The heart also gains the `accessibilityLabel` it never had, which is one
of the six unlabeled icon buttons plan 7 lists as still live.

**Check:** open a watched series' Detail page on web and click the heart — it should fill **red**,
and stay filled after a reload. Hover it and the trash: each should show a label saying what it
does. Click the trash — the remove confirmation should open from anywhere on the button. Failure:
either still inert, only clickable at its right edge, no tooltip on hover, or a heart that fills
white.

### The ⓘ button duplicated what the summary already did · **changed 2026-10-14, awaiting its check**
`app/series/preview.tsx` had an `information-outline` button in both registers' headers opening the
same dialog the summary blurb already opened on tap — two controls for one action, and the
discoverable one was the redundant one. Both icons removed; the blurb now carries
`(click to see full summary)` under it.

**Wording is deliberately the user's own and is not yet consistent with the rest of the app**: the
Detail screen's equivalent says "Read more", and "click" is wrong on a phone, where this same
component renders. Settle both when plan 7 runs, rather than inventing a third wording now.

**Check:** open Discover, tap any poster, and confirm there is no ⓘ in the header and the summary
reads `(click to see full summary)` under it. Tapping the summary still opens the full text.

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

### The Account screen stretches across the full width of a wide monitor
`app/onboarding/account.tsx:317`'s `container` sets `padding` and `gap` and nothing else, so on a
1920px browser every control — the email field, the password field, four pill buttons — is drawn
~1870px wide. A pill that wide reads as a banner rather than a button: its label floats alone in the
middle of a bar of empty colour, and the eye has to cross the whole screen to tie a field to its
caret. `app/onboarding/privacy.tsx:133` shares the container and has the worse version of it —
unbroken prose at that measure runs to roughly 200 characters a line.

The fix is a centered column, not a media query: `alignSelf: 'center'` + `width: '100%'` +
`maxWidth`. The same style is correct on a phone, where the `maxWidth` simply never binds.

**The number is the whole decision, so ask for it rather than pick one.** Run `$impeccable` over
this screen before writing the style and let it settle the column width — and whether the form
column and the prose column want the same one, since a form and a paragraph have different natural
measures. Whatever lands gets stated in `DESIGN.md`'s wide-web register in the same terms it already
uses (232px sidebar, 184px cards, 900px breakpoint), and should be weighed against the ad-hoc widths
already in the tree (`DetailHeroCard`'s 1040, recommend's tab row at 520, the two searchbars at
480/440) rather than becoming a fifth unrelated number.

Scope is the four onboarding screens only. `login.tsx:105` already centers its column and may need
nothing — verify it at width, don't assume. `reconcile.tsx` is a full-width `FlatList` whose rows
put the checkbox a monitor's width from the title it belongs to; the same column fixes that, and
since plan 7 step 5 rewrites that screen anyway, do only the cheap version here. Library, Discover
and For you are out of scope — their grids genuinely use the width.

**Check:** open `/onboarding/account` in a maximised desktop browser. The form sits in a centered
column of the agreed width with background either side, not edge to edge; `/onboarding/privacy`
reads as a column of prose rather than full-width lines. Then narrow the window to phone width and
confirm nothing is clipped or stuck off-centre, and open the same screen on the Android emulator to
confirm it is unchanged there. Failure: controls still spanning the viewport, a column pinned left
instead of centered, or horizontal scrolling appearing at narrow width.

### A guest has two ways out and only one of them deletes anything
`app/onboarding/account.tsx` offers a guest both **Leave guest mode (discards this list)** (`:215`,
→ `logOutAccount`) and **Delete everything** (`:113`, → `deleteAccountAndData`). For a *real*
account those are properly different actions — one ends a session you can come back to, the other
erases the library, the MAL link and the `auth.users` row. **For a guest the difference collapses**,
because an anonymous session can never be signed into again: both lose the library, and the only
thing that actually differs is invisible to the person choosing. "Leave guest mode" *abandons* the
rows on the server forever; "Delete everything" erases them. The orphan that leaves behind is not
hypothetical — the stale `178e75f9…` user in "What is still owed", clearable only from the
dashboard, is one.

**So the guest branch gets one exit, and it is the one that deletes.** Replace both buttons with a
single `Leave guest mode and delete this list` calling `deleteAccountAndData()`, which already
handles an anonymous session unchanged and says so in its own comment
(`supabase/functions/delete-account/index.ts:66`). A real account keeps both, worded as they are.

**And the guest branch gains a `Log in` button**, beside its existing `Create account`. Signing out
is currently a guest's only route to the login screen, so collapsing the exits would otherwise mean
someone who already owns an account must delete their guest list to reach it. The email and
password fields are already on screen and `logInWithEmail` already exists
(`src/account/accountRepository.ts:52`) — this is a button and a handler, and it closes a gap that
was there before this item anyway.

Wording, since that dialog is now the only thing between a guest and a permanent delete: the title
and the button say **guest** and **list**, never "account" — a guest has no account in any sense
they would recognise. Keep the existing dialog's line that their MyAnimeList list is untouched; it
is the most reassuring sentence on the screen and it currently sits *below* the alarming one.
`dataSection()` takes a wording pair rather than being copied per branch — the whole reason that
fragment is shared is that a delete button must not go missing from one of them.

**Supersedes half of the design-critique plan's step 4** (`# Plan 7 — What the design critique
found`), which planned to put the old sign-out tap behind a confirmation; that tap no longer exists
once this lands. What survives from it is naming the count in this dialog, and the disclosure line
under the login screen's guest button.

**Check:** continue as a guest and open Account. There is exactly one way out, it names the guest
list rather than an account, and confirming it leaves nothing behind — verify in the Supabase
dashboard that the `auth.users` row is gone, not merely signed out. Then confirm `Log in` reaches
an existing account from the guest branch without deleting anything, and that a real account still
sees both log-out and Delete everything, unchanged. Failure: a guest told the app is deleting an
"account", a second silent exit still present, or an `auth.users` row surviving the delete.

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

**Two copy decisions are waiting on this run**, both from plan 5's ⓘ change: the Preview summary
hint currently reads `(click to see full summary)` where Detail says `Read more`, and "click" is
wrong on the phone this same component renders on. Settle one wording for both.

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
