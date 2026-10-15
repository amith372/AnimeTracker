# PRD 2 — A public, account-free share link for your list

Written for: Amith, to sign off before any code, and for future sessions picking this up mid-way.
Delete this file when the last step lands (its decisions move to CLAUDE.md/SPECS.md and PLAN.md at
that point).

**Status: awaiting sign-off.** Nothing here is built. The four shape decisions below were settled
2026-10-12 and are not to be re-opened without the user asking.

## Problem

There is no way to show anyone your list. Every screen in the app is behind `auth.uid()`, which is
correct for everything built so far and wrong for the one thing a tracker is obviously for:
telling someone else what you have watched. Today the only answer is "make an account, link MAL,
import" — three steps and a password, to look at a list.

The person who wants to look is specifically **not a user**: a friend in a chat, someone in a
forum thread. They have no account, will not make one, and may never have heard of MyAnimeList.
Anything that asks them for a login has already failed.

**This changes a standing non-goal.** CLAUDE.md's Non-goals says "No multi-user data sharing
between accounts (each account's library is private to it)." That line was written about accounts
reading each other's libraries, and it still holds — nothing here lets one account see another's.
What it has to stop saying is that a library is private full stop, because this makes it
publishable *by its owner, deliberately, to anyone*. The amendment is step 4's work, and it is
called out here so the contradiction is resolved on purpose rather than noticed later.

## Success criteria

1. A stranger with no account, no app and no MAL login opens the URL in a browser and sees the
   whole list with its current statuses.
2. The response carries no email, no MAL username, no MAL user id and no account id. Assertable on
   the serialized body, not just reviewed by eye.
3. "Stop sharing" kills the URL immediately, and the old slug never works again.
4. RLS on `series` and `series_entries` is **unchanged and still owner-only**. No `anon` read path
   into either table exists when this is done.
5. Statuses on the page are derived by the same `src/domain/` code the app uses, so the public page
   and the Library can never disagree about what "Watched 3/5 seasons" means.
6. The page attributes MyAnimeList, and does not use its name, logo or branding as its own identity.
7. A viewer is never asked to log in, to consent to anything, or to install anything.
8. Nothing about the viewer is collected — no analytics, no identifiers, no log of who looked.

## Scope

**In:** a `shared_libraries` table; a public read Edge Function; a `/s/<slug>` route in the web
build; create / copy / revoke controls plus an optional nickname on the account screen; the privacy
notice and non-goal amendments that come with publishing anything.

**Out**, and deliberately:

- **Any write path for a viewer.** The page is read-only, has no buttons that change anything, and
  the function it reads is a `GET` in everything but name.
- **Comments, likes, follows, or anything social.** A URL that renders a list is the whole feature.
- **Account-to-account sharing.** Still a non-goal. There is no "share with user X", no inbox, no
  permissions model — a link either exists or it doesn't.
- **Importing someone else's shared list into your own.** Tempting and genuinely useful; it is a
  different feature with its own grouping and dedupe questions.
- **Sharing the taste profile.** Never. It is model-authored text describing the reader and the
  most personal thing the app stores (`taste_profiles`' own migration says so). It must not appear
  in the function's response at all, which step 2's test asserts.
- **Sharing Catch up or recommendations.** Both are about what the user should do next, which is
  nobody else's business and would make the page a different thing.
- **A snapshot.** The page is live and always current — see the decision table.
- **Per-status filters on a link**, and **several named links**. Both were offered and declined.
- **Discovery of any kind:** no directory, no browse, no search, no SEO. The opposite, in fact —
  see the indexing constraint.

## Decisions settled

| Decision | Settled as | Why |
|---|---|---|
| How the page reads the data | A public Edge Function returning JSON, reading as `service_role` | Keeps RLS owner-only on every table. The alternative — an `anon`-readable view over `series` — puts a read path into user rows one policy mistake away from exposing every library, to save one hop |
| What is shared | The whole library, every status, nothing to configure | What was asked for. A per-link status filter is a stored policy the page must honour correctly forever, for a choice nobody has yet wanted |
| Link management | One slug per account, revocable; re-sharing mints a fresh one | Makes "stop sharing" unambiguous and satisfies §3(e)'s 24-hour removal outright. Several named links is more table and more ways to forget one is live |
| Whose list it is | An optional nickname the sharer types, else "A shared anime list" | Nothing MAL-derived, nothing the app already holds about them, and no email anywhere near a public page |
| Live or snapshot | Live. The page reflects the library at the moment it is opened | The user's words were "whatever the current state is at auto". A snapshot would also be a second copy of the library to keep, invalidate and delete |
| Slug generation | A Postgres column default, not the client | Unguessable without adding a crypto dependency to the client, and impossible for a client bug to make predictable. `replace(gen_random_uuid()::text,'-','')` is 122 bits and needs no extension |
| Who may share | Guests included, with the revoke warning spelled out in the dialog (settled 2026-10-14) | Every other feature treats a guest as a real account (CLAUDE.md §1), and special-casing them here would be the only place in the app that does. The hazard is real and is answered with copy rather than a restriction — see the edge case below |

## Compliance position (MAL API agreement)

**Read from the agreement on 2026-10-12, not from memory.** The question was whether displaying
MyAnimeList Content to people who are not MAL users, on a page with no login, is permitted. It is,
and the clauses say so more directly than expected:

- **§3(a)(ii)** prohibits making **the API** available to others — "rent, lease, lend, sell,
  license, sublicense, assign, distribute, publish, transfer, or otherwise make available the API".
  It names the API, not MyAnimeList Content. A page that renders a list distributes neither the API
  nor any credential for it.
- **§2(b)** expressly contemplates public pages: it grants the Company a licence "to access, index,
  and cache by any means, including web spiders and/or crawlers" any webpage on which you display
  MyAnimeList Content. A clause granting MAL crawler rights over our pages presumes those pages can
  be publicly reachable. Displaying content publicly is anticipated by the agreement, not barred.
- **No clause requires an end user of the application to hold a MAL account or accept MAL's terms.**
  That was checked specifically, because it is the assumption the whole feature would die on.
- **§4(f)** is the real constraint, and it is about people rather than content: the application must
  not "sell, transfer or otherwise make available to any third parties any user personal
  information". This is what shapes the design — the response carries no email, no MAL username, no
  MAL user id, no account id. What it does carry is the list its owner chose to publish, which is a
  disclosure the user directs, not one the app makes on their behalf. §4(f) also requires a privacy
  policy no less protective than MAL's own, which is why the notice has to say plainly that a
  share link is public (step 4).
- **§3(a)(xiii)** permits MAL's marks only "to attribute MyAnimeList and the Company Offering as
  the source of MyAnimeList Content", and **§3(a)(xi)** bars making a service "appear as though it
  is a Company Offering". So the public page carries the same "Data from MyAnimeList" line the app
  does, and is visibly AnimeTracker. Guardrail #4 applies to a page a stranger sees at least as
  much as to one only the owner sees.
- **§3(e)** requires removal within 24 hours of a request. Revocation is immediate and the old slug
  is permanently dead, which exceeds it.
- **§3(c)** bars storing MyAnimeList Content that consists of personal information. Unchanged — we
  store titles, ids, genres and covers, exactly as today.
- **§3(a)(xiv)** non-commercial: unchanged. No ads on the public page, now or ever, which also
  keeps §4(h)'s advertising restrictions moot.

**No new MAL data flows anywhere.** The page renders from our own Postgres, which is where every
screen already reads from since the Phase 12 cutover. The feature adds a reader, not a source.

Residual risks, both named rather than solved: a public page is crawlable by anyone, not only by
MAL (addressed by `noindex` plus an unguessable slug, below), and a user may publish more about
themselves than they meant to (addressed by the notice copy, and by revocation being one press).
**Not reviewed by a lawyer.**

## Constraints

- **RLS stays owner-only on `series` and `series_entries`.** The Edge Function is the only thing
  that ever reads another account's rows, it runs as `service_role`, and it must refuse unless a
  `shared_libraries` row for that slug exists. This is the single security-relevant line in the
  feature.
- **`shared_libraries` is not `anon`-readable either.** A viewer never queries it; the function
  resolves the slug. Otherwise a stranger could enumerate who is sharing.
- **The response is a whitelist, never a `select *`.** A column added to `series` later must not
  start appearing on a public page because nobody remembered this function reads it.
- **`taste_profiles`, `mal_accounts` and `user_library_meta` are untouchable here.** The first is a
  description of the reader, the second holds live MAL tokens (guardrail #2), the third holds
  consent timestamps. None has any business in this code path, and step 2's test asserts the
  function's source never names them.
- **Status derivation stays in `src/domain/`.** The function returns entries and `manual_status`;
  the page runs the real `deriveSeriesStatus` / `statusLabel` on them. Computing a label
  server-side would be a second implementation of the trickiest logic in the app (CLAUDE.md's Edge
  Function convention, and the reason `mal-import` hands DTOs back rather than grouping them).
- **The route lives outside `app/(tabs)/`.** The login-and-consent gate is in
  `app/(tabs)/index.tsx`, not the root layout, so a top-level `app/s/[slug].tsx` is reached by a
  viewer with no session without redirecting them anywhere. Putting it inside the tabs group would
  bounce every stranger to the login screen, and would hand them a tab bar for an app they do not
  have.
- **`verify_jwt` stays `true`**, as it does for every function but `mal-oauth-callback`. A viewer
  with no account still sends the anon key, because `supabase.functions.invoke` always attaches
  one — exactly how `mal-discover` already serves guests. No config change, and the anon key
  remains the rate-limiting surface in front of a public endpoint.
- **The nickname is untrusted text the user typed.** Length-capped in Postgres, rendered as text
  (React Native's `<Text>` cannot interpret markup, so there is no injection surface on the page
  itself), and never used to build the slug.
- **`noindex` and a `robots.txt` disallow on `/s/`.** An unguessable slug keeps a list from being
  found; those two keep a shared one from being archived and surfaced in search long after it was
  revoked. §2(b) gives MAL crawler rights over pages displaying their content and this does not
  withhold anything from them — it is about the rest of the web.
- **`EXPO_PUBLIC_SITE_URL` is a new client env var**, so the app can build a copyable URL. Not a
  secret — it is the app's own public address, the same value `SITE_URL` already holds server-side;
  it needs a client copy only because the client is the thing constructing the link to copy.
- **No offline support, as everywhere else.** The page needs a network connection; there is nothing
  to cache and no local database to cache it in.

## Edge cases

- **An unknown, revoked or malformed slug** — a plain "this list isn't being shared" page. Not an
  error screen, and deliberately not distinguishable from "never existed": telling a stranger which
  slugs were once real is a small enumeration gift for no benefit.
- **An empty library** — "nothing on this list yet", not a blank page that reads as broken.
- **A library with only dropped series** — renders normally. Dropped is a status the user chose to
  publish, per the settled scope.
- **The owner changes the library while someone is looking** — the viewer sees it on reload. Live is
  the decision; there is no staleness to signal.
- **The owner deletes their account** — `on delete cascade` takes the share row, and the URL dies
  with it. Nothing to do, but worth having checked.
- **A guest shares and then loses their session** — the row survives, the link keeps working, and
  nobody can revoke it. Accepted knowingly (settled 2026-10-14): a guest may share, and the dialog
  says plainly that losing the guest session means losing the ability to stop sharing. The two
  alternatives were requiring a real account first (the only guest special-case in the app) and
  expiring guest links (a second mechanism to build and test for a case the copy can cover). The
  residual risk is an abandoned public URL with no reachable owner, which is the user's informed
  choice to take rather than an oversight.
- **Two devices share at once** — one row per account, so it is an upsert and the second is a no-op
  rather than a second link.
- **A series with no cover art** — the same placeholder the Library uses.
- **One Piece's per-arc state** — the page shows the series-level status like every other series.
  Arc detail is not part of what is published.
- **Someone guessing slugs** — 122 bits. Not a threat model, listed so nobody adds a rate limiter
  for it instead of for something real.

## Open questions

1. ~~**Should a guest be able to share?**~~ **Settled 2026-10-14 — yes, with the warning in the
   dialog.** See the decision table and the matching edge case. Nothing in this plan special-cases
   an anonymous session, and step 1's confirmation copy carries the cost of that.
2. **Does the nickname want a profanity or length sanity pass beyond the length cap?** Probably
   not — it is the sharer's own name on their own page, and the only reader is someone they sent the
   link to. Listed so the decision is recorded as a decision.
3. **Should the page offer "open in the app"?** A deep link would be nice for someone who happens
   to be a user. Out of scope as drawn; noted because the route works on native already.

## Implementation plan

Same ordering principle as PRD 1: **reach a correct, verifiable result as early as possible, then
make it touchable.** Nothing is public until step 3, so steps 1 and 2 can be checked without
exposing anything.

Every step's expected test figures are derived on paper from the inputs, never read off what the
implementation returned.

### Step 1 — The table and the sharer's own controls · **done, checked 2026-10-15**

**The controls are a dialog off the Library's three-dot menu** (`src/components/ShareListDialog.tsx`)
— not a block on the account screen as the bullet below says, and not the standalone screen that
was built in between. Settled 2026-10-15 at the user's request, and right beyond that: sharing is
something you do with your library rather than a setting on your account, and it is a handful of
controls you dip into and leave, which is a popup's shape. Step 3's public page is still a route
(`app/s/[slug].tsx`) that a stranger opens; this is the owner's side of it.

**That dialog holds its own confirmations as states rather than opening a second dialog.** Three:
not sharing (which *is* the create confirmation, carrying the exposure copy and the guest
sentence), sharing, and confirming a stop. A confirmation floating over the thing it confirms is
hard to read and harder to dismiss correctly, and the first state has nothing else to show anyway.

**Three further things step 1 settled that the text below did not say.** Recorded here rather than in
`build_plan.md` because this file is what later steps read, and the first of them contradicts the
bullet two paragraphs down:

1. **The confirmation is on *create*, and revoking gets a second, lighter one.** The bullet below
   puts the exposure copy on "Stop sharing", which is the wrong half: creating the link is the
   outward-facing, hard-to-reverse press (a link that has been sent cannot be un-sent), and the
   guest warning — that losing this session means losing the ability to revoke — is only actionable
   *before* the link exists. The revoke dialog says the link dies immediately and that re-sharing
   mints a different one.
2. **`EXPO_PUBLIC_SITE_URL` falls back to `window.location.origin` on web** when unset
   (`src/repositories/ShareRepository.ts`'s `siteOrigin`), so `expo start --web` produces a link
   that actually works against the dev server. There is no fallback on native — an app bundle has
   no origin — and the screen shows the slug alone with a note rather than a half-built URL.
3. **`expo-clipboard` is a new dependency** (the copy button). A native build therefore needs
   `npx expo run:android`, not a Metro reload.

The grants came out narrower than written below, and deliberately: `insert (user_id)` and
`update (display_name)` are **column-level**, so "impossible for a client bug to make the slug
predictable" is enforced by Postgres rather than by convention — `authenticated` cannot write
`slug` at all, and a slug can never be *changed*, only created fresh.


- Migration: `shared_libraries` (`user_id` PK → `auth.users` `on delete cascade`, `slug text unique
  not null default replace(gen_random_uuid()::text,'-','')`, `display_name text` with a length
  check, `created_at`). RLS owner-only. `select, insert, update, delete` to `authenticated` — the
  delete grant is a deliberate departure from `user_library_meta` and `taste_profiles`, which have
  none: there, a client supersedes a row and never removes it, whereas here removal *is* the
  feature and "stop sharing" must leave nothing behind.
- `src/repositories/ShareRepository.ts`: a `use*` hook for the current link and plain functions to
  create, rename and revoke. Optimistic, like every other write.
- Account screen: a "Share your list" block — create, the URL with a copy button, the nickname
  field, and "Stop sharing" behind a confirmation dialog, same bar as the MAL push and
  delete-everything. The dialog says what the link exposes and that anyone holding it can see it.
  **On a guest session it says one thing more** (settled 2026-10-14): that losing this guest
  session means losing the ability to stop sharing, since an anonymous account cleared from the
  device leaves a live URL nobody can reach. That sentence is the whole of what lets guests share
  at all, so it is part of this step rather than a polish pass.
- `delete-account`'s `OWNED_TABLES` gains `shared_libraries`, and `__tests__/deleteAccount.test.ts`
  with it.
- Tests: the slug is never built from the nickname; the hook's shape. Mostly this step is covered by
  its check, as step 5½'s delete was, for the same reason — it is Postgres behaviour.
- **Check:** create a link on the account screen, confirm a slug appears and copies. Press "Stop
  sharing" and confirm it is gone. Create again and confirm the slug is *different*. Failure looks
  like the same slug coming back (a revoke that only hid the row), or a slug containing anything
  recognisable from your account.

### Step 2 — The public read function · **built 2026-10-15, check outstanding**

Two things it settled. **It takes the slug from a query string as well as a JSON body** — the page
will POST through `supabase.functions.invoke`, but a human checking a link reaches for curl, where
`?slug=` is the obvious thing to type; the slug is a lookup key rather than a credential, so
neither form is more trusted. And **the response is camelCase**, matching `src/domain/`'s model
rather than the column names listed below, since the page runs the real status derivation on it
and a renaming layer would exist for nothing.

The library read is **one embedded select** (`series_entries(...)` nested under `series`) rather
than the client's two selects. It is a cold page load for a stranger on a ~350ms backend with no
cache to hide behind — and it also means no row ids are ever *selected*, where the two-select
version needs `id`/`series_id` to group by.

As in `delete-account`, the names of the tables this function must never read appear nowhere in
its source, so the test can assert their absence rather than trusting a comment. That is why its
header describes them ("the taste profile", "the MAL token table") instead of naming them.

- `supabase/functions/shared-library`: slug in, the whitelisted library out, as `service_role`. No
  `getRequestUserId` — there is deliberately no caller identity. 404-shaped response for an unknown
  slug.
- Response shape: per series `title`, `cover_url`, `genres`, `type`, `manual_status`, and per entry
  `kind`, `order_index`, `episode_count`, `watch_state`, `airing_status`. Plus `display_name`. No
  ids of any kind beyond what the page needs to key a list, no `user_id`, no `mal_id` for anything
  the page doesn't render.
- `__tests__/sharedLibraryFunction.test.ts`, reading the source the way the three existing
  function tests do: it names no MAL helper, never reads `taste_profiles` / `mal_accounts` /
  `user_library_meta`, never selects `*`, and resolves the slug before reading any library table.
- **Check:** `curl` the function with your slug and read the JSON — confirm your list is there and
  your email, MAL username and account id are not. Then revoke the link and `curl` the same slug
  again, confirming it returns nothing. Failure looks like a response for a revoked slug, or any
  field in it you wouldn't post publicly.

### Step 3 — The viewer's page

- `app/s/[slug].tsx`, outside the tabs group: covers, titles, derived status labels via the real
  `src/domain/` functions, the genre chips the Recommendations screen already uses, and
  `MalAttribution` at the bottom. Loading, empty and not-shared states. No navigation into the app,
  no login prompt, no tab bar.
- `robots.txt` on the static site disallowing `/s/`, plus a `noindex` meta for the route.
- **Check:** open the URL in a private window with no session at all, on a phone browser as well as
  desktop. The whole list should render with correct statuses and no prompt to sign in. Then revoke
  it and reload. Failure looks like a redirect to the login screen, a blank page, an error screen
  for a revoked link, or a status that disagrees with what the app shows you.

### Step 4 — Say so, in the notice and in CLAUDE.md

- Privacy notice: a "Sharing your list" paragraph — what a link exposes, that anyone holding it can
  open it without an account, that it stays live until revoked, and that revoking is immediate.
  §4(f) requires the policy cover this, and a user who reads the notice should not be surprised by
  anything the feature does.
- CLAUDE.md: amend the Non-goals line discussed at the top of this PRD, and add the share link to
  the feature specs. The non-goal that survives is "no account can read another account's library";
  what goes is the implication that a library cannot be published at all.
- **Check:** read the notice as a new account and confirm the sharing paragraph is there and
  accurate. Failure looks like copy that overstates what is private, which is worse than no copy.
