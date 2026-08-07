# CLAUDE.md — AnimeTracker

Standing project guide for Claude Code. Read this before writing code each session.

## What this is

A **personal, non-commercial** app for tracking anime watch progress, built with React Native/Expo (Android + iOS). It reads data from the **MyAnimeList (MAL) official API v2** and keeps all watch data **locally on the device**. The local database is always the source of truth for what the app displays and derives — MAL never writes to local data. The one exception is an explicit, user-triggered **push** (§8) that copies local Plan to watch / Watched / Currently watching statuses onto the signed-in user's own MAL list; MAL is otherwise read-only, and everything else in the app (grouping, status derivation, recommendations) still reads from local data, never from a round-trip to MAL.

**Originally built as a native Kotlin/Jetpack Compose Android app** (Phases 1–5 complete, Phase 6 in progress) before being rewritten in React Native — not because the Kotlin app had problems, but so the person building it can read and explain the code themselves. The full product spec below (data model, MAL endpoints, status derivation, guardrails) is unchanged from the Kotlin version; only the tech stack changed. Every non-trivial function should have a short comment explaining what it does and why — that convention exists specifically to support that goal, so keep following it.

- **Package / bundle id:** `com.amith.animetracker`
- **Repo:** https://github.com/amith372/AnimeTracker
- **Build:** Expo, fully local (`npx expo run:android` / `run:ios`) — no cloud build service required. This dev environment is Windows-only (no Mac/Xcode), so iOS is coded to be cross-platform-correct but can't be locally verified here; every phase's live verification runs on Android.

---

## Working with me — ask, don't assume

This is a collaborative build. When in doubt, stop and ask; do not guess.

- **If anything is unclear or you're unsure, ask me before deciding.** Don't silently pick an approach, invent a requirement, or resolve an ambiguity on your own — surface the question and wait for my answer.
- **Flag major changes before making them.** If a task would mean a significant change — altering the data model, swapping or adding a library, changing the architecture, touching the auth flow, or anything wide-reaching or hard to reverse — describe it and get my explicit OK first.
- Prefer small, reviewable steps. When unsure how far to go, do less and check in.

Use the `AskUserQuestion` tool when a decision comes down to a few clear options.

---

## ⚠️ Non-negotiable guardrails (MAL API compliance)

The MAL API License & Developer Agreement binds us. These are hard rules — never violate them, even if a task seems to ask for it:

1. **Never commit the MAL Client ID.** It lives in `local.properties` (gitignored) and is exposed via `BuildConfig`. Never hardcode it in source, never print it in logs, never put it in the repo.
2. **Tokens are secret and encrypted.** Store OAuth access/refresh tokens only in `EncryptedSharedPreferences` (or Android Keystore). Never store the user's MAL password (OAuth means we never see it).
3. **API only — never scrape.** All MAL data comes through `https://api.myanimelist.net/v2`. Never fetch or parse `myanimelist.net` HTML pages. To stay light on their servers: always use the `fields` query param, cache results in Room, keep the monthly sync cadence, and never hammer endpoints in tight loops.
4. **Attribute, don't imitate.** Show a small "Data from MyAnimeList" line in-app. Do not use MAL's logo, name, or branding as the app's identity, and don't make the UI look like the official MAL app.
5. **Fail gracefully.** The API is unsupported and can change or be revoked at any time. Handle errors, empty responses, and expired tokens without crashing; surface a retry.

**Also:** the app stays strictly non-commercial. No ads, fees, subscriptions, or donations. Adding any of these reclassifies it as commercial and would require MAL's written permission.

---

## Tech stack

- **Framework:** Expo (managed SDK), TypeScript
- **UI:** React Native Paper (Material 3) — Paper's icons render via `@expo/vector-icons` (`PaperProvider settings={{ icon }}` in `app/_layout.tsx`); do **not** add `react-native-vector-icons`, it needs native font linking Expo doesn't give you for free and caused a real bug (icons silently fell back to raw emoji glyphs) during Phase 1.
- **Navigation:** Expo Router (file-based — the file tree under `app/` *is* the navigation map)
- **Local DB:** expo-sqlite + Drizzle ORM (single source of truth for the UI). `SQLite.openDatabaseSync` **must** pass `{ enableChangeListener: true }` — without it, `useLiveQuery` never fires on writes; the DB updates but the screen silently doesn't (a real bug hit and fixed in Phase 1). Schema lives in `src/db/schema.ts`; migrations generated via `npm run db:generate` (`drizzle-kit`).
- **Networking:** `fetch` + hand-written TypeScript interfaces mirroring the MAL DTOs (no extra HTTP/schema-validation library)
- **Auth:** OAuth2 PKCE via `expo-auth-session` (`CodeChallengeMethod.Plain` — see the MAL PKCE quirk below) + `expo-linking` for the redirect
- **Token storage:** `expo-secure-store`
- **Background work:** `expo-background-task` (monthly sync)
- **Images:** `expo-image`
- **State/reactivity model:** repositories (`src/repositories/`) export plain `async function`s for one-shot reads/writes, and `use*` hooks (built on Drizzle's `useLiveQuery`) for reactive reads a screen re-renders on automatically — this two-part split exists because React's reactivity is tied to the component lifecycle, unlike Room's framework-agnostic `Flow`. See `src/repositories/AnimeRepository.ts` for the pattern.
- **DI:** none needed — repositories/`db` are plain module-level singletons, imported directly (the RN equivalent of the old `AppContainer`/service-locator)

Tests: Jest (`jest-expo` preset — pin `jest`/`@types/jest` to the 29.x line; `jest-expo`'s bundled `@react-native/jest-preset` currently ships Jest-29-era internals and mismatches with Jest 30, which breaks the test runner). Pure domain logic (`src/domain/`) is the highest-value thing to test — see `__tests__/`.

---

## Package layout

```
app/                        // Expo Router routes — file path = screen
├── _layout.tsx               // root layout: migrations, seeding, PaperProvider, Stack
├── index.tsx                  // Library screen
├── series/[id].tsx            // Series Detail — tap-to-mark
├── onboarding/                // login + import + reconcile (Phase 2/3) + account (Phase 7)
├── discover.tsx                // search/browse to add unwatched anime (Phase 4)
└── recommend.tsx               // recommendations + "catch up" (Phase 6)
src/
├── db/                       // Drizzle schema + migrations (≈ old data/local)
│   ├── schema.ts
│   ├── client.ts               // opens SQLite, wraps with Drizzle — import `db` from here
│   └── migrations/
├── api/                      // MAL DTOs + fetch client (≈ old data/remote)
├── repositories/              // ≈ old data/repository — the only thing screens touch
├── domain/                   // plain models + derivation logic (status, grouping) — pure, unit-tested
├── auth/                     // ≈ old data/auth — MAL OAuth (per-device today, moving server-side in Phase 8)
├── account/                  // Phase 7+ — Supabase email/password account + session (separate from MAL login)
├── components/                // small UI pieces shared by 2+ screens (poster tile, add-status dialog)
└── context/
__tests__/                   // Jest — mirrors src/domain/ 1:1
supabase/
└── migrations/                // Postgres schema + RLS for the account/sync backend (Phase 7+)
```

Rule: **the UI observes reactive DB reads (`use*` hooks).** Network calls write into SQLite; the UI never reads the network directly. This gives offline-first behavior for free — viewing and marking work with no internet.

---

## Data model

Each MAL "anime" is a single season/movie entry. We group related entries into a **Series**.

**Series** — one grouped show (or one standalone movie)
- `id` (local PK), `title`, `coverUrl`, `genres: List<String>`
- `rootMalId` — the MAL id we follow relations from (usually season 1)
- `type`: `SERIES` | `STANDALONE_MOVIE`
- `manualStatus`: `PLAN` | `CURRENTLY_WATCHING` | `DROPPED` | `WATCHED_FORGOT` | `NONE`
  (When `NONE`, the effective status is derived from entries — see below.)
- `liked: Boolean` — user-set on watched series (Watched / Watched X/Y / Watched-forgot) via a
  toggle on the Detail screen; feeds into recommendation scoring (see Recommendations below).

**SeriesEntry** — each MAL entry belonging to a series
- `id` (local PK), `seriesId` (FK), `malId`
- `kind`: `TV_SEASON` | `MOVIE`
- `orderIndex` (season order within the series)
- `title`, `episodeCount`
- `watchState`: `UNWATCHED` | `WATCHED` | `WONT_WATCH` — the V / empty mark, plus a deliberate
  "skip this one" (a recap season, a filler film). `WONT_WATCH` counts as *resolved* for status
  derivation, exactly like `WATCHED`; it's what lets a show you're actually finished with reach
  Watched instead of sitting at 3/5 forever. Was a `watched: Boolean` until migrations 0004/0005
  (add → backfill → drop, so no existing tick was lost).
- `airingStatus`: `FINISHED` | `AIRING` | `NOT_YET_AIRED`

**SyncMeta** — `lastSyncEpoch`, per-series `newSeasonAvailable: Boolean`

**Account/sync pivot (Phase 7+, in progress):** the app is gaining an optional Supabase-backed
account system so the same library can be used on phone and web and stay in sync — see the "Build
phases" section below for the phased rollout and the standing plan doc for full design detail.
Phase 7 only adds the account layer itself (`src/account/`, `supabase/migrations/`) — local SQLite
stays the sole source of truth for everything the UI reads/writes; nothing syncs yet, and creating
an account has no effect on the local library. `sync_meta` and `api_cache` are and remain
local-only, unrelated to this — they're not part of what eventually syncs.

### Status derivation (the tricky part)

Statuses live **per series**. There are 6:

| Status | How it's set |
|---|---|
| `PLAN`, `CURRENTLY_WATCHING`, `DROPPED`, `WATCHED_FORGOT` | Manual (`manualStatus`) — user sets it, it sticks until changed. |
| **Watched** | Derived: `manualStatus == NONE` **and** every entry — seasons *and* movies — is resolved (`WATCHED` or `WONT_WATCH`). |
| **Watched X/Y** | Derived: `manualStatus == NONE` and anything is still `UNWATCHED`. Displayed as `Watched 3/5 seasons, 2/3 movies`. |

- **Seasons and movies are two independent counts.** A show like Demon Slayer is genuinely two backlogs — 3 of 5 seasons and 2 of 3 films — and one number hides whichever half is unfinished. Either count can be 0/0; `statusLabel` omits an empty half, so most series read `Watched 3/5 seasons` and a standalone movie reads `Watched 0/1 movies`.
- **Seasons are a consecutive run, movies are a plain tally.** X = highest consecutive resolved season from season 1, so a gap breaks the streak (seasons 1 and 3 but not 2 is "1/3") — the number means "where am I up to". Movies have no running order, so nothing to break.
- **A `WONT_WATCH` entry counts as done and does not break a season streak.** 3 watched + 1 skipped of 5 reads as 4/5.
- **A standalone movie derives from its own entry.** It has no seasons, so it's Watched only once its movie is resolved — it previously read "Watched" unconditionally, which meant an unseen film imported from a plan-to-watch list displayed as already watched.
- The **monthly sync** is what creates the flip: when a new season airs, a new `TV_SEASON` entry is added, Y grows, and a previously "Watched" show automatically becomes "Watched X/Y" and gets `newSeasonAvailable = true`.
- Manual status always wins over derived. A dropped show stays dropped even if a new season appears.

---

## Feature specs + the exact endpoints each uses

**API base:** `https://api.myanimelist.net/v2`. Authenticated calls send `Authorization: Bearer <token>`.

### 1. Auth — OAuth2 PKCE
- Authorize: `https://myanimelist.net/v1/oauth2/authorize` with `response_type=code`, `client_id`, `code_challenge`, `code_challenge_method=plain`, `state`, `redirect_uri=animetracker://auth`.
- Token / refresh: `https://myanimelist.net/v1/oauth2/token` (`grant_type=authorization_code` with `code_verifier`, then `grant_type=refresh_token`).
- **MAL PKCE quirk:** MAL supports only the **`plain`** method — `code_challenge` must **equal** `code_verifier` (43–128 chars). Do not SHA256 it.
- Redirect is caught by an intent-filter on `animetracker://auth` (see manifest snippet in Setup).
- Access token lasts ~31 days; refresh token longer. **Every authenticated call goes through `getValidAccessToken()`**, which refreshes when the stored expiry is within 5 minutes, with a single 401-triggered retry in `authFetch` as a backstop. All refreshes share one in-flight promise: the fetch layer runs 6–8 requests concurrently and MAL *rotates* the refresh token on each use, so parallel refreshes would race on a value the first one already invalidated. A refresh MAL rejects with 400/401 clears the tokens (the session is genuinely dead); a 5xx or network error deliberately does not, since being offline must not log you out.

### 2. Initial import (onboarding)
- `GET /users/@me/animelist?fields=list_status,num_episodes,media_type&limit=1000` (paginate via `paging.next`).
- Map MAL `list_status.status` → app status:
  `completed → watched entry`, `watching → CURRENTLY_WATCHING`, `dropped → DROPPED`, `plan_to_watch → PLAN`, `on_hold → CURRENTLY_WATCHING`. `WATCHED_FORGOT` has no MAL equivalent (user sets it later).
- Per-entry detail fetches run **concurrently and best-effort** (same `mapWithConcurrency` as Discover). A sequential loop that aborted on the first failure made onboarding both the slowest and most fragile part of the app. Saving the reconciled result is a **single transaction** — it deletes the whole library before reinserting, and the only copy of the import lives in the reconcile screen's state, so a partial write would be unrecoverable.
- Then group into series (below) and show the **reconcile screen**: entries the user marked `completed` on MAL come pre-checked; the user ticks any seasons they actually watched but never marked. (Important: the user historically only marked season 1 of shows they finished.)

### 3. Series grouping (from relations)
- For each imported anime: `GET /anime/{id}?fields=related_anime,media_type,num_episodes,genres,main_picture,title`.
- Build the TV chain by following `related_anime` with `relation_type` **`sequel` / `prequel`**.
- Attach related entries where `media_type == "movie"` as `MOVIE` entries **under the parent series** (e.g. a Demon Slayer film nests under the Demon Slayer series).
- A `movie` with no TV series in its relation chain becomes its own `STANDALONE_MOVIE` series, shown with a **Movie** badge.
- Dedupe carefully — chains overlap; group by connected component, don't create duplicate series.
- **Titles are English where MAL has one.** MAL's `title` is romaji ("Kimetsu no Yaiba"); request `alternative_titles` too and prefer `alternative_titles.en` ("Demon Slayer"), falling back to romaji when it's missing *or blank* — MAL often returns an empty string rather than omitting the field. This lives in `src/domain/title.ts` (`displayTitle`) and is applied at every DTO→domain mapping boundary (import, discover, sync) so every screen names the same show identically.
- **Note:** `groupIntoSeries` only handles `media_type` of `tv` and `movie` — `ova`/`ona`/`special`/`music` entries are dropped entirely rather than grouped. Fine for the user's library today, but it does mean an ONA recommendation silently produces no row.

### 4. Discover / add (manual)
- **Layout (AniList-inspired, replaces the original tab-based design):** one scrollable Discover screen made of sectioned poster-grid rows, not a `TabRow`. Each section is its own MAL call:
  - **Popular This Season** / **Upcoming Next Season** — `GET /anime/season/{year}/{season}` (current season, then next season).
  - **All Time Popular** — `GET /anime/ranking?ranking_type=all` (bypopularity/favorite variants optional additional sections).
  - Each section header has a **"View All"** link that pushes into a dedicated full-grid screen for just that category, paginated via `usePaginatedDiscover` (MAL `offset`, pages accumulate and are deduped by `rootMalId` — grouping can produce the same series from two different pages).
  - **Preview rows fetch only what they show.** The list endpoints return 25, the home screen renders ~10, and every result costs its own `/anime/{id}` call — so rows pass a `nodeLimit` that trims *before* the detail phase. Without it, opening Discover spent ~75 per-anime requests to display ~30 tiles, against guardrail #3.
  - Poster tiles are cover art + title only (no score badge — AniList's own homepage grid doesn't show one either, just the detail page).
- **Search** is a separate full-screen mode (not a tab) — a persistent search bar that takes over the screen when focused: `GET /anime?q={query}&fields=media_type,genres,main_picture,num_episodes,start_season`.
- **Filter out anything already in the local list** (surface only not-yet-tracked / unwatched), in every section and in search results. Each result has an **Add** button that creates the series/entries locally and sets a status.

### 5. Edit status
- Purely local Room writes. Tapping the status never itself talks to MAL — see §8 for the separate, explicit action that does.
- Tapping the status on the Series Detail screen opens the editor (`setSeriesManualStatus`). It offers the four deliberate statuses **plus `NONE` ("Auto — from watched seasons")** — without `NONE` there'd be no way back from a manual override to derived Watched / Watched X/Y, making any manual pick a one-way door. The Add dialogs deliberately omit `NONE`.
- This is the only way to reach `WATCHED_FORGOT`, which has no MAL equivalent (and §8 never pushes it — see below).

### 6. Monthly sync (WorkManager)
- Periodic worker (~30 days), constraints: network connected.
- Refresh token first. For each series with derived status **Watched** or **Watched X/Y**: re-fetch `related_anime` on `rootMalId`, add any new `TV_SEASON` entries, recompute X/Y, set `newSeasonAvailable` where Y grew.
- Show the new-season list in-app; the flip from Watched → Watched X/Y is the same mechanism as the alert.

### 7. Recommendations
- **MAL-based:** aggregate `GET /anime/{id}?fields=recommendations` across all **non-dropped watched** series. Weight each candidate by MAL's own `num_recommendations` (log-scaled, so one blockbuster can't dominate) — not just a count of appearances. Series marked **`liked`** count for extra weight.
- **Genre-based:** build a genre-affinity profile from watched series; score candidates by genre overlap. `liked` series contribute more weight. Two corrections matter: divide each genre's weight by how many series carry it (otherwise the profile just measures "is this mainstream" — nearly everything is Action/Comedy), and **average** a candidate's genre scores rather than summing (otherwise more tags = higher score regardless of fit).
- **Normalize both halves to 0..1 before combining** (currently 0.6 MAL / 0.4 genre). Raw genre affinity runs orders of magnitude larger than a MAL tally, so adding them unnormalized makes ranking effectively genre-only.
- Combine, dedupe, and **exclude** anything already in the list or related to dropped shows. The exclusion must run **again after grouping**, not only on the raw candidate ids — grouping expands each candidate out to its whole sequel/prequel chain, so a recommendation for season 3 becomes the entire series, whose season 1 the user may already have.
- **Layout:** two lists behind a `SegmentedButtons` toggle, never one blended feed —
  - **"Catch up"** — what to watch **next** on each series that's Watched / Watched X/Y: at most two rows per series, its earliest `UNWATCHED` season and its earliest `UNWATCHED` movie. Purely local, no API calls. "Finish what you started." *Earliest*, not newest — with seasons 1–3 watched the useful answer is season 4, not the season 6 you can't start. Movies collapse the same way because film series are often ordered too. Listing every outstanding entry instead let one half-finished show fill the screen and turned the list into a second copy of the library. Entries marked `WONT_WATCH` never appear — that mark exists precisely to stop something nagging.
  - **"For you"** — the MAL + genre ranking above, always shown as whole **series / standalone movies**, never individual seasons. "Try something new."

  They're split rather than stacked because with a large library the catch-up list runs long enough to bury the recommendations below it.
- **Each tab is itself split into two sections**, same reasoning one level down: Catch up into **Seasons / Movies**, For you into **Series / Movies**. A long list of one kind otherwise buries a couple of the other at the bottom where they're never seen. Empty sections render no header at all. Movies were originally excluded from Catch up entirely, which made an unwatched film invisible twice over — absent from the list, and (before the dual count above) unable to move the series' status either.
- Both lists are **cards with cover art, title and genres** (not the narrow Discover poster tiles — genres don't fit in a 110px column), and both are filterable by a **genre chip row** built from the genres actually present in the current list.

### 8. Push to MyAnimeList (opt-in, explicit — the one write path in the app)
- Confirmed against the [MAL API License & Developer Agreement](https://myanimelist.net/static/apiagreement.html): no fee, no read/write distinction in the license, OAuth + Client ID already satisfy its requirements. This is the sole exception to "never write back to MAL" — everywhere else in the app, MAL is read-only and local data is the source of truth (see "What this is").
- Endpoint: `PUT /anime/{anime_id}/my_list_status`, form-encoded body, one `status` field sent per call (`plan_to_watch` / `watching` / `completed`). Fields that aren't sent are left untouched on MAL — this app never touches score, dates, episode counts, tags, or comments, so it can't clobber anything the user set directly on MAL's own site.
- A Library-screen button, visible only when logged in (never in guest mode — there's no account to push to), behind a confirmation dialog: this edits the user's real MAL list, which is exactly the kind of hard-to-reverse, external-shared-state action that deserves its own in-app confirmation, not just a one-time approval during development.
- Scope is deliberately narrow — only three series-level statuses push, chosen because they're the ones with an unambiguous 1:1 MAL status and no risk of guessing wrong:
  - `PLAN` → every entry (season + movie) in the series gets `plan_to_watch`.
  - `CURRENTLY_WATCHING` → every entry gets `watching`.
  - `WATCHED` / `WATCHED_PARTIAL` ("Watched X/Y") → **per entry**, not per series: only entries locally marked `WATCHED` get `completed`; entries still `UNWATCHED` or marked `WONT_WATCH` are left alone. This is what makes a partially-watched series safe to push — it can't falsely mark an unseen season "completed" on MAL just because the series as a whole reads "Watched 3/5".
  - `DROPPED` and `WATCHED_FORGOT` are **never** pushed. Dropped has a direct MAL equivalent but was deliberately left out to keep the feature's blast radius to exactly what was asked for; `WATCHED_FORGOT` has no MAL equivalent at all (see §5).
- Runs with bounded concurrency (`mapWithConcurrency`, matching the rest of the app) and is best-effort per entry — one failed PUT doesn't abort the batch, same pattern as Import/Discover/Recommendations. Reports progress and a final "N updated, M failed" summary.

---

## Conventions

- **Comment every non-trivial function** (repositories, domain logic, DB queries, auth flow — anything not self-evident from its name) with what it does and why it exists. Not line-noise — enough that reading a file top-to-bottom explains its purpose without asking. This exists specifically so the code stays explainable; don't let it lapse.
- One SQLite DB (via Drizzle), reactive reads via `use*` hooks; one-shot reads/writes are plain `async function`s (see Tech stack above for why the split exists).
- Every MAL API response type is a separate TS interface from the Drizzle table type and the domain model — map between them explicitly, same separation Room/Retrofit/domain had in the Kotlin version.
- No secrets, tokens, or PII in logs.
- **Per-anime MAL reads go through `src/repositories/apiCache.ts`** (SQLite-backed, 30-day TTL, pruned on launch) — that's guardrail #3's "cache results" in practice, and it's what turns a repeat Recommendations visit from minutes into seconds. Two rules: **`SyncRepository` must keep calling the raw `getAnimeDetail`** (new-season detection *is* a request for fresh `related_anime`; a cache hit there is a bug, not an optimization), and **bump the version segment of a cache key whenever you change the `fields` you request** — an old row is still valid JSON, so nothing refetches it and the new fields silently read as `undefined` for a full TTL.
- Prefer small, testable pure functions for grouping and status derivation (`src/domain/`) — they're the logic most likely to have bugs, and the existing Jest tests in `__tests__/` are the regression net; extend them when you touch this logic, don't just eyeball it.

---

## Setup / secrets

`.env` (gitignored — **verify `.env` itself, not just `.env*.local`, is in `.gitignore`**; Expo's default template only ignores the latter, which does *not* cover a plain `.env` file — this was a near-miss caught during the Phase 1 rewrite):
```
EXPO_PUBLIC_MAL_CLIENT_ID=YOUR_CLIENT_ID_FROM_MAL
```
`EXPO_PUBLIC_`-prefixed vars are inlined into the JS bundle at build time and read via `process.env.EXPO_PUBLIC_MAL_CLIENT_ID` — same "never commit, never log" handling as the old `local.properties`/`BuildConfig` wiring; a PKCE public client doesn't need a true secret on any platform.

**Phase 7+ adds** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `.env` — safe to expose in the client bundle unlike the MAL Client ID above, since Postgres Row-Level Security (not key secrecy) is what protects a user's rows; see `supabase/migrations/`. `src/account/supabaseClient.ts` treats a blank/missing pair as "accounts not configured yet" rather than crashing, so the app keeps working with no Supabase project set up. The MAL Client ID itself moves off the client entirely in Phase 8, becoming a Supabase Edge Function secret instead of an `EXPO_PUBLIC_` var.

`app.json` — the `scheme` field is the OAuth redirect scheme (`animetracker://`, same value the Kotlin app's intent-filter used) and must match what's registered with MAL. `expo-auth-session` + `expo-linking` read this automatically; there's no manifest/intent-filter to hand-write like the old `AuthRedirectActivity`.

`.gitignore` must cover (already set up by the Phase 1 rewrite): `node_modules/`, `.expo/`, `.env`, `/ios`, `/android` (Expo's prebuild-generated native projects), `*.keystore`/`*.jks`/`*.p8`/`*.p12`/`*.mobileprovision`.

---

## Build & run

- `npx expo run:android` / `npx expo run:ios` — builds and installs on a connected device/emulator/simulator, starts the Metro dev server.
- `npx jest` — pure domain-layer tests.
- `npx tsc --noEmit` — typecheck.
- No cloud build required for either platform (EAS Build is available if ever needed for iOS without a Mac, but isn't part of the normal loop).

---

## Build phases (work in this order)

Same phases as the original Kotlin build — the React Native rewrite restarts from Phase 1, but the domain logic (grouping algorithm, status derivation, edge cases already found) ports over directly rather than being rediscovered.

1. **Skeleton + model** *(done — RN rewrite)* — Expo Router setup, Drizzle schema/migrations, ported `src/domain/` + Jest tests, Library + Series Detail screens driven by **fake data** run through the real grouping algorithm. Goal met: tap-to-mark works, persists across relaunch, no network yet.
2. **Auth** — OAuth2 PKCE login (`expo-auth-session`), `expo-secure-store` for tokens.
3. **Import + grouping + reconcile** — pull `@me` list, build series, reconcile screen.
4. **Discover / add** — search + browse + Add, filtered to not-yet-tracked.
5. **Monthly sync** — `expo-background-task`, new-season detection, Watched → Watched X/Y flip.
6. **Recommendations** — MAL + genre combined, plus Catch-up.

Each phase should leave the app installable and working on the Android emulator (iOS: code cross-platform-correct, not locally verified — see "What this is").

**Phases 7+ — account/sync pivot (in progress).** Adds an optional Supabase-backed account so the
same library can sync across phone and web; full design lives in the standing plan doc, not
duplicated here. Each phase leaves the app installable and working with zero behavior change for
anyone not opting in, same bar as Phases 1–6:

7. **Accounts, no sync** *(in progress)* — Supabase project + `series`/`series_entries` schema + RLS (`supabase/migrations/`); email/password sign-up/login (`src/account/`) alongside MAL login and guest mode. An account has no MAL data and nothing syncs yet — it's scaffolding for Phase 8+.
8. **MAL custody moves server-side** — Edge Functions take over the MAL OAuth exchange/refresh and all MAL API calls; adds "Continue with MyAnimeList" as a second way to get an account (auto-created from the MAL identity); the MAL Client ID leaves the client entirely. Import/Discover-add/Push become gated on whether MAL is linked to the current account.
9. **Push-only sync** — local writes queue in an outbox and push to Supabase; no pull yet.
10. **Full bidirectional sync** — remote changes pull/merge back into local SQLite (poll + Realtime), making the app genuinely multi-device.
11. **Monthly sync moves server-side** — a scheduled Edge Function replaces the per-device `expo-background-task` job.
12. **Web build** — the existing Expo Router app also builds for web (react-native-web), hosted on Vercel.

## Non-goals

No multi-user data sharing between accounts (each account's library is private to it). No manga (anime only). No monetization of any kind. Writing back to MAL is scoped to exactly the opt-in push described in §8 — no other write path (score, dates, comments, arbitrary status edits, deleting entries from MAL) is in scope. (Accounts/server-backend were a non-goal through Phase 6; that changed with the Phase 7+ pivot above — see the standing plan doc for why.)
