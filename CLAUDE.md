# CLAUDE.md — AnimeTracker

Standing project guide for Claude Code. Read this before writing code each session.

## What this is

A **personal, non-commercial** app for tracking anime watch progress, built with React Native/Expo (Android, iOS, and web) and a Supabase (Postgres) backend. It reads data from the **MyAnimeList (MAL) official API v2**. Supabase Postgres is always the source of truth for what the app displays and derives — every screen reads/writes it directly, with no local database and no offline support (a direct-Postgres cutover, 2026-08-12 — see "Build phases" Phase 9+/12 for why). MAL never writes to this data. The one exception is an explicit, user-triggered **push** (§8) that copies Plan to watch / Watched / Currently watching statuses onto the signed-in user's own MAL list; MAL is otherwise read-only, and everything else in the app (grouping, status derivation, recommendations) reads from Postgres, never from a round-trip to MAL.

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

1. **Never commit the MAL Client ID.** Phase 8+: it's a Supabase Edge Function secret (`MAL_CLIENT_ID`, set via the dashboard or `supabase secrets set`) — the client bundle never holds it at all, and no `EXPO_PUBLIC_` var carries it anymore. Never hardcode it in source, never print it in logs, never put it in the repo.
2. **Tokens are secret and encrypted.** Phase 8+: MAL access/refresh tokens live server-side only, in Postgres' `mal_accounts` table — RLS is deny-all (no policy) and only a narrow, column-restricted view (`mal_link_status`, excluding the token columns entirely) is ever readable by the owning user; only Edge Functions running as `service_role` can read or write the actual tokens. Never store the user's MAL password (OAuth means we never see it). Supabase's own session tokens (a materially lower-value secret, short-lived and rotating) live in `AsyncStorage` on-device — see `src/account/supabaseClient.ts`.
3. **API only — never scrape.** All MAL data comes through `https://api.myanimelist.net/v2`. Never fetch or parse `myanimelist.net` HTML pages. To stay light on their servers: always use the `fields` query param, cache results (`src/repositories/apiCache.ts`), keep the monthly sync cadence, and never hammer endpoints in tight loops.
4. **Attribute, don't imitate.** Show a small "Data from MyAnimeList" line in-app. Do not use MAL's logo, name, or branding as the app's identity, and don't make the UI look like the official MAL app.
5. **Fail gracefully.** The API is unsupported and can change or be revoked at any time. Handle errors, empty responses, and expired tokens without crashing; surface a retry.

**Also:** the app stays strictly non-commercial. No ads, fees, subscriptions, or donations. Adding any of these reclassifies it as commercial and would require MAL's written permission.

---

## Tech stack

- **Framework:** Expo (managed SDK), TypeScript
- **UI:** React Native Paper (Material 3) — Paper's icons render via `@expo/vector-icons` (`PaperProvider settings={{ icon }}` in `app/_layout.tsx`); do **not** add `react-native-vector-icons`, it needs native font linking Expo doesn't give you for free and caused a real bug (icons silently fell back to raw emoji glyphs) during Phase 1.
- **Navigation:** Expo Router (file-based — the file tree under `app/` *is* the navigation map)
- **Data layer:** direct Supabase Postgres reads/writes, no local database (see "What this is"). `src/repositories/AnimeRepository.ts` is the only thing screens touch for library data; `src/repositories/seriesMapping.ts` owns the row↔domain mapping. Reactivity is TanStack Query (`@tanstack/react-query`, `src/repositories/queryClient.ts`) — one query holds the whole library per user — plus a Supabase Realtime subscription (`src/repositories/realtime.ts`) that invalidates it on any remote change. Writes are optimistic (update the cache immediately, roll back on failure) since every write is now a network round trip.
- **Networking:** `fetch` + hand-written TypeScript interfaces mirroring the MAL DTOs (no extra HTTP/schema-validation library). The client never calls MAL directly at all — every MAL read/write goes through a Supabase Edge Function (`src/api/edgeFunctions.ts` → `supabase/functions/`), which is what actually holds the MAL bearer token and calls `api.myanimelist.net`.
- **Accounts + backend:** Supabase (`@supabase/supabase-js`) — Postgres + RLS for the whole data model, Supabase Auth (including anonymous sign-in for guests — see Auth below) for the app's own account system, Edge Functions (Deno) for MAL OAuth/token custody and MAL API proxying, Realtime (`postgres_changes`) for the reactivity described above. See `src/account/` (client) and `supabase/` (schema + functions).
- **Auth:** three ways to get a session — Supabase Auth email/password, "Continue with MyAnimeList" (auto-creates/finds a Supabase account from a MAL OAuth login), or "Continue as a guest" (Supabase anonymous auth, `src/account/guestMode.ts` — a real, temporary `auth.uid()` with full read/write access, not a read-only mode; see the Guest mode note below §1). MAL linking is a separate one-time OAuth step per account. All three share the same server-terminated PKCE flow (`CodeChallengeMethod.Plain` — see the MAL PKCE quirk below); the device only ever gets a Supabase session back, never a MAL token. The OAuth *trigger* is platform-split — `src/account/malLinkRepository.ts` (native: `expo-web-browser`'s `openAuthSessionAsync` + `expo-linking` catching the `animetracker://auth` redirect) vs. `malLinkRepository.web.ts` (web: a `window.open` popup + a `postMessage` listener, since there's no custom URL scheme in a browser) — both re-export the platform-agnostic status queries from `malLinkStatus.ts`.
- **Session storage:** Supabase session in `@react-native-async-storage/async-storage` (see `src/account/supabaseClient.ts` for why); MAL tokens never touch the device at all (server-side custody).
- **Background work:** monthly sync is a scheduled Supabase Edge Function (`supabase/functions/mal-monthly-sync`, `pg_cron` + `pg_net`) — no per-device background job. `src/repositories/SyncRepository.ts` is just the "Sync now" button's thin client of that function.
- **Images:** `expo-image`
- **State/reactivity model:** repositories (`src/repositories/`) export plain `async function`s for one-shot reads/writes, and `use*` hooks (built on TanStack Query) for reactive reads a screen re-renders on automatically — this two-part split exists because React's reactivity is tied to the component lifecycle. See `src/repositories/AnimeRepository.ts` for the pattern.
- **DI:** none needed — repositories/clients are plain module-level singletons, imported directly (the RN equivalent of the old `AppContainer`/service-locator)

Tests: Jest (`jest-expo` preset — pin `jest`/`@types/jest` to the 29.x line; `jest-expo`'s bundled `@react-native/jest-preset` currently ships Jest-29-era internals and mismatches with Jest 30, which breaks the test runner). Pure domain logic (`src/domain/`) is the highest-value thing to test — see `__tests__/`.

---

## Package layout

```
app/                        // Expo Router routes — file path = screen
├── _layout.tsx               // root layout: fonts, QueryClientProvider, Realtime wiring, PaperProvider, Stack
├── index.tsx                  // Library screen
├── series/[id].tsx            // Series Detail — tap-to-mark
├── onboarding/                // login (MAL sign-in/guest/email) + import + reconcile + account (create/log in, link MAL, convert a guest)
├── discover.tsx                // search/browse to add unwatched anime
└── recommend.tsx               // recommendations + "catch up"
src/
├── api/                      // MAL DTOs + Edge Function client (≈ old data/remote)
│   ├── malDataApi.ts           // typed MAL DTOs — implementation calls edgeFunctions.ts, not MAL directly
│   └── edgeFunctions.ts        // typed supabase.functions.invoke() wrappers, one per Edge Function
├── repositories/              // ≈ old data/repository — the only thing screens touch
│   ├── AnimeRepository.ts      // library reads (use*  hooks, TanStack Query) + writes (optimistic)
│   ├── seriesMapping.ts        // Postgres row <-> domain Series/SeriesEntry mapping
│   ├── realtime.ts             // Realtime subscription -> query invalidation (replaces the old sync engine)
│   ├── queryClient.ts          // TanStack Query singleton + query-key registry
│   └── apiCache.ts             // shared Postgres api_cache table — MAL response cache, guardrail #3
├── domain/                   // plain models + derivation logic (status, grouping) — pure, unit-tested
├── account/                  // Supabase account system
│   ├── supabaseClient.ts       // client singleton (AsyncStorage-backed session)
│   ├── accountRepository.ts    // email/password sign-up/login/logout + useAccountSession
│   ├── guestMode.ts             // anonymous-auth guest sign-in + useIsGuest
│   ├── malLinkStatus.ts        // platform-agnostic isMalLinked/useMalLinkStatus
│   ├── malLinkRepository.ts    // native OAuth trigger (signInWithMal/linkMalAccount)
│   └── malLinkRepository.web.ts // web OAuth trigger — Metro picks this over the .ts on web builds
├── components/                // small UI pieces shared by 2+ screens (poster tile, add-status dialog)
└── context/
__tests__/                   // Jest — mirrors src/domain/ 1:1
supabase/
├── migrations/                // Postgres schema + RLS for the whole data model
└── functions/                  // Edge Functions (Deno) — MAL OAuth + all MAL API proxying
    └── _shared/                  // cross-function helpers (Supabase admin/anon clients, MAL fetch/token-refresh, PKCE, CORS)
```

Rule: **the UI observes reactive TanStack Query reads (`use*` hooks) over Postgres.** A write updates the cache optimistically, commits to Postgres, and rolls back on failure; a Realtime subscription invalidates the cache on any remote change (another device, the monthly-sync cron). There is no offline support — the app needs a network connection to do anything beyond what's already cached in memory for the current session.

---

## Data model

Each MAL "anime" is a single season/movie entry. We group related entries into a **Series**.

All of the below lives in Supabase Postgres (`supabase/migrations/`), scoped per-account by RLS
(`auth.uid() = user_id`) — there is no local mirror. Ids are server-assigned `uuid`s, not
client-generated integers (a real, app-wide type change from the pre-cutover local-SQLite version:
`Series.id`/`SeriesEntry.id` are `string`, not `number`).

**`series`** — one grouped show (or one standalone movie)
- `id` (uuid PK), `user_id` (owner, FK → `auth.users`), `title`, `cover_url`, `genres: jsonb`
- `root_mal_id` — the MAL id we follow relations from (usually season 1); `unique(user_id, root_mal_id)`
- `type`: `SERIES` | `STANDALONE_MOVIE`
- `manual_status`: `PLAN` | `CURRENTLY_WATCHING` | `DROPPED` | `WATCHED_FORGOT` | `NONE`
  (When `NONE`, the effective status is derived from entries — see below.)
- `liked: boolean` — user-set on watched series (Watched / Watched X/Y / Watched-forgot) via a
  toggle on the Detail screen; feeds into recommendation scoring (see Recommendations below).
- `new_season_available: boolean`, `new_season_aired_at: timestamptz` — set by the monthly sync.
- `version`/`updated_at`/`updated_by_device_id`/`deleted_at` — bookkeeping columns from the old
  sync-engine design; kept (dropping them is a pointless migration) but no longer read by anything
  client-side. Deletes today are hard deletes; `deleted_at` is unused.

**`series_entries`** — each MAL entry belonging to a series
- `id` (uuid PK), `series_id` (FK), `user_id` (denormalized, so RLS here is a flat check), `mal_id`
- `kind`: `TV_SEASON` | `MOVIE`
- `order_index` (season order within the series)
- `title`, `episode_count`
- `watch_state`: `UNWATCHED` | `WATCHED` | `WONT_WATCH` — the V / empty mark, plus a deliberate
  "skip this one" (a recap season, a filler film). `WONT_WATCH` counts as *resolved* for status
  derivation, exactly like `WATCHED`; it's what lets a show you're actually finished with reach
  Watched instead of sitting at 3/5 forever.
- `airing_status`: `FINISHED` | `AIRING` | `NOT_YET_AIRED`
- `watched_arc_keys: jsonb` — per-arc watched state for the one entry that has arcs (One Piece); see `src/domain/arcs.ts`.
- `unique(series_id, mal_id)`

**`user_library_meta`** — singleton row per account, `initial_import_completed_at`,
`last_sync_at`. Replaces the old per-device "has this device imported yet" flag — being per-account
rather than per-device is what lets signing into an already-imported account on a second device (or
browser) skip straight to the Library instead of re-running onboarding.

**`api_cache`** — the MAL response cache (guardrail #3), **shared across every account** (not
per-user): anime detail/recommendation data is user-independent, so `anon`-readable, `authenticated`-writable,
pruned daily by `pg_cron`. See `src/repositories/apiCache.ts`.

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

**API base:** `https://api.myanimelist.net/v2`. Authenticated calls send `Authorization: Bearer <token>`. **Phase 8+: the device never calls this base directly** — every endpoint below is proxied through a Supabase Edge Function (`supabase/functions/mal-*`), which holds the actual bearer token server-side. The endpoint list is still accurate; it's just who calls it that changed.

### 1. Auth — three ways to get a session, all sharing the same OAuth2 PKCE mechanics for MAL
- **App account (Supabase Auth):** email/password, or **"Continue with MyAnimeList"** — a MAL OAuth login that auto-creates (first time) or logs into (returning) a Supabase account matched by MAL user id, no separate password. Either way the device ends up with a Supabase session (`src/account/accountRepository.ts`'s `useAccountSession`), stored in AsyncStorage.
- **Guest (anonymous Supabase auth):** `src/account/guestMode.ts`'s `continueAsGuest()` calls `supabase.auth.signInAnonymously()` — this is a **real, temporary account** (a real `auth.uid()`, full RLS-scoped read/write), not a read-only demo mode. It persists in AsyncStorage exactly like a real session, across app restarts, until the user explicitly leaves guest mode (signs out) or converts it. Converting is in-place, not a fresh signup: `accountRepository.ts`'s `signUpWithEmail` calls `supabase.auth.updateUser({email,password})` instead of `supabase.auth.signUp(...)` when the current session `is_anonymous`, keeping the same `auth.uid()` (and every row already written under it); linking MAL works unmodified either way, since it just attaches to whatever's currently signed in. `app/onboarding/account.tsx` has a dedicated render branch for this. **Requires "Allow anonymous sign-ins" enabled in the Supabase project's Auth settings** — a dashboard-only toggle, not something a migration can turn on.
- **MAL link (per account, optional if the account wasn't created via MAL sign-in):** `linkMalAccount()` (native: `src/account/malLinkRepository.ts`; web: `malLinkRepository.web.ts`) — same OAuth dance as sign-in, but attaches to the already-known signed-in account (guest or not) instead of resolving one.
- **The MAL OAuth mechanics themselves** (every variant shares this): Authorize at `https://myanimelist.net/v1/oauth2/authorize` with `response_type=code`, `client_id`, `code_challenge`, `code_challenge_method=plain`, `state`, `redirect_uri` — the redirect URI is always the `mal-oauth-callback` Edge Function's own URL, **not** a client scheme/URL directly, for every platform (this is what lets web work with no custom URL scheme). MAL redirects there; the function exchanges the code (`https://myanimelist.net/v1/oauth2/token`), stores the token pair in Postgres (`mal_accounts`, RLS deny-all + column-restricted, see guardrail #2), then finishes differently per platform: **native** redirects the device to `animetracker://auth` (`?linked=1` or `?handoff=<code>`, caught by `app/auth.tsx`'s Linking listener); **web** 302-redirects the popup to this app's own `/oauth-complete` route (`app/oauth-complete.tsx`, built from a `SITE_URL` Edge Function secret — see Setup/secrets), which `postMessage`s the same payload to `window.opener` and closes itself (caught by `malLinkRepository.web.ts`'s listener), falling back to a same-tab redirect to `/onboarding/account` if the popup has no opener. **Not** inline HTML returned directly from `mal-oauth-callback` itself — that was the original design, but Supabase's Edge Function gateway silently downgrades the `Content-Type` of any HTML-ish function response to `text/plain` and injects a `sandbox` Content-Security-Policy (verified via a raw request against the deployed function; a JSON response from another function passes through untouched), so a `<script>` served from `*.supabase.co` can never execute — redirecting to a page on our own origin instead is the fix, mirroring how the mobile variant already redirects to a URL it owns rather than trying to execute anything on Supabase's domain. Either way, a `handoff` code is traded for a real Supabase session by `mal-session-exchange` — MAL tokens never travel through the redirect itself, only an opaque one-time code.
- **MAL PKCE quirk:** MAL supports only the **`plain`** method — `code_challenge` must **equal** `code_verifier` (43–128 chars). Do not SHA256 it. (`supabase/functions/_shared/pkce.ts`, a Deno port of the same logic `src/domain/pkce.ts` had client-side originally.)
- Access token lasts ~31 days; refresh token longer. **Every MAL-proxying Edge Function calls `getValidMalAccessToken(userId)`** (`supabase/functions/_shared/malAuth.ts`), which runs the `mal_refresh_token_if_needed` Postgres function — refreshes when within 5 minutes of expiry, inside a `SELECT ... FOR UPDATE` transaction that also makes the MAL HTTP call (via the `http` extension), so the row lock genuinely spans the network round trip. This is what lets exactly one place in the whole system ever hold/rotate a given user's MAL refresh token, coordinating a phone and a browser tab refreshing at the same moment. A refresh MAL rejects with 400/401 deletes the `mal_accounts` row (the link is genuinely dead, user must re-link); a 5xx or network error deliberately does not.

### 2. Initial import (onboarding)
- All server-side now, in one call to the **`mal-import`** Edge Function: `GET /users/@me/animelist?fields=list_status,num_episodes,media_type&limit=1000` (paginated via `paging.next`), then the related-anime detail-closure expansion (concurrent, best-effort, same shape the old client-side `mapWithConcurrency` loop had) — returns raw list entries + a detail-by-id map for the client.
- The client (`src/repositories/ImportRepository.ts`) runs `groupIntoSeries` and the DTO→`ReconcileSeries` mapping locally, same as always — that's real domain logic and deliberately was **not** duplicated into the Edge Function (see Conventions).
- Map MAL `list_status.status` → app status:
  `completed → watched entry`, `watching → CURRENTLY_WATCHING`, `dropped → DROPPED`, `plan_to_watch → PLAN`, `on_hold → CURRENTLY_WATCHING`. `WATCHED_FORGOT` has no MAL equivalent (user sets it later).
- Saving the reconciled result is a **single transaction** — it deletes the whole library before reinserting, and the only copy of the import lives in the reconcile screen's state, so a partial write would be unrecoverable.
- Then group into series (below) and show the **reconcile screen**: entries the user marked `completed` on MAL come pre-checked; the user ticks any seasons they actually watched but never marked. (Important: the user historically only marked season 1 of shows they finished.)
- Gated on MAL being linked to the current account (`mal_link_status`) — the reconcile screen is only reachable at all once that's true; see `app/(tabs)/index.tsx`'s gate.

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
- A Postgres write via `AnimeRepository.ts` (optimistic — the UI updates immediately, then rolls back if the write fails). Tapping the status never itself talks to MAL — see §8 for the separate, explicit action that does.
- Tapping the status on the Series Detail screen opens the editor (`setSeriesManualStatus`). It offers the four deliberate statuses **plus `NONE` ("Auto — from watched seasons")** — without `NONE` there'd be no way back from a manual override to derived Watched / Watched X/Y, making any manual pick a one-way door. The Add dialogs deliberately omit `NONE`.
- This is the only way to reach `WATCHED_FORGOT`, which has no MAL equivalent (and §8 never pushes it — see below).

### 6. Monthly sync (server-side)
- **Fully server-side.** `supabase/functions/mal-monthly-sync` is scheduled via `pg_cron`/`pg_net` (`supabase/migrations/20260808000000_monthly_sync_cron.sql`, `0 6 1 * *` — 1st of the month) and does the entire walk itself: for every linked account (`mal_accounts`), for every one of that account's series with `manual_status = 'NONE'` (the SQL-level equivalent of "derived Watched / Watched X/Y" — manual statuses are excluded by definition), it re-fetches `related_anime` on `rootMalId` directly (no client `mal-anime-detail` round trip), walks new sequel edges with a cycle guard, inserts any new `TV_SEASON` `series_entries` rows straight into Postgres, and flips `new_season_available`/`new_season_aired_at` on the parent `series` row. Nothing touches the device directly — a synced account picks up the result through the normal Realtime path (`src/repositories/realtime.ts`), same as any other remote change.
- **Dual-mode auth**, since the same function serves two very different callers: the cron job (no user session — a Postgres-side scheduled HTTP call) authenticates via a custom `x-cron-secret` header checked against the `CRON_SECRET` Edge Function secret; a normal signed-in call (the client's "Sync now" button) falls through to the usual per-user JWT path (`getRequestUserId`). Gateway-level `verify_jwt` stays `true` — the cron caller still sends the anon key as its bearer, same as any client.
- **Narrow, deliberate exception to "Edge Functions are MAL proxies, never a second home for domain logic"**: a scheduled cron run has no client to hand raw DTOs off to, so `mal-monthly-sync` carries small Deno ports of `displayTitle`, `mapAiringStatus`, and `seasonStartEpochMillis` — the same category of exception `mal-import`'s related-anime closure expansion already established, and called out in the function's own header comment.
- **Client-side, this is just a thin "Sync now" button**: `src/repositories/SyncRepository.ts`'s `runMonthlySync()` checks `isMalLinked()`, calls `callMalMonthlySync()` (→ `mal-monthly-sync`, authenticated per-user mode), and invalidates the library query if it reports new seasons found — so the button's own result and the visibly-updated Library list land together rather than the list lagging a beat behind Realtime.
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
- Confirmed against the [MAL API License & Developer Agreement](https://myanimelist.net/static/apiagreement.html): no fee, no read/write distinction in the license, OAuth + Client ID already satisfy its requirements. This is the sole exception to "never write back to MAL" — everywhere else in the app, MAL is read-only and Postgres is the source of truth (see "What this is").
- Endpoint: `PUT /anime/{anime_id}/my_list_status`, form-encoded body, one `status` field sent per call (`plan_to_watch` / `watching` / `completed`). Fields that aren't sent are left untouched on MAL — this app never touches score, dates, episode counts, tags, or comments, so it can't clobber anything the user set directly on MAL's own site. Phase 8+: the client resolves *which* entries to push (`buildPushTargets`, unchanged domain logic) and sends the whole target list in one call to the **`mal-push`** Edge Function, which does the actual PUTs server-side — the Edge Function is a dumb proxy, it never re-decides what to push.
- A Library-screen button, visible only when MAL is linked (which a guest can do too, same as a real account — see §1; the gate is "is MAL linked", not "is this a real account"), behind a confirmation dialog: this edits the user's real MAL list, which is exactly the kind of hard-to-reverse, external-shared-state action that deserves its own in-app confirmation, not just a one-time approval during development.
- Scope is deliberately narrow — only three series-level statuses push, chosen because they're the ones with an unambiguous 1:1 MAL status and no risk of guessing wrong:
  - `PLAN` → every entry (season + movie) in the series gets `plan_to_watch`.
  - `CURRENTLY_WATCHING` → every entry gets `watching`.
  - `WATCHED` / `WATCHED_PARTIAL` ("Watched X/Y") → **per entry**, not per series: only entries locally marked `WATCHED` get `completed`; entries still `UNWATCHED` or marked `WONT_WATCH` are left alone. This is what makes a partially-watched series safe to push — it can't falsely mark an unseen season "completed" on MAL just because the series as a whole reads "Watched 3/5".
  - `DROPPED` and `WATCHED_FORGOT` are **never** pushed. Dropped has a direct MAL equivalent but was deliberately left out to keep the feature's blast radius to exactly what was asked for; `WATCHED_FORGOT` has no MAL equivalent at all (see §5).
- Best-effort per entry inside `mal-push` — one failed PUT doesn't abort the batch, same pattern as Import/Discover/Recommendations. Reports a final "N updated, M failed" summary (no more granular per-request progress ticks now that it's one server call, see `MalPushRepository.ts`).

---

## Conventions

- **Comment every non-trivial function** (repositories, domain logic, DB queries, auth flow — anything not self-evident from its name) with what it does and why it exists. Not line-noise — enough that reading a file top-to-bottom explains its purpose without asking. This exists specifically so the code stays explainable; don't let it lapse.
- One Postgres backend, reactive reads via `use*` hooks (TanStack Query + Realtime invalidation); one-shot reads/writes are plain `async function`s (see Tech stack above for why the split exists).
- Every MAL API response type is a separate TS interface from the Postgres row type (`src/repositories/seriesMapping.ts`) and the domain model — map between them explicitly.
- No secrets, tokens, or PII in logs.
- **Per-anime MAL reads go through `src/repositories/apiCache.ts`** (a **shared** Postgres table, 30-day TTL, pruned daily by `pg_cron` — see the Data model section) — that's guardrail #3's "cache results" in practice, and it's what turns a repeat Recommendations visit from minutes into seconds. Server-side, `supabase/functions/_shared/apiCache.ts` is the Edge Function half of the same table, used by `mal-import` (by far the heaviest MAL caller: one `anime/{id}` per list entry plus the whole relation closure). It shares the client's **exact key space and TTL** deliberately — `mal-import` and `mal-anime-detail` request byte-identical `fields`, so an import warms Discover/Recommendations and vice versa; **if those two field lists ever diverge, the cache version segment must diverge too**, or one side silently reads the other's rows with fields missing. Two more rules: **the monthly-sync Edge Function must keep re-fetching `related_anime` directly** (new-season detection *is* a request for fresh data; a cache hit there is a bug, not an optimization), and **bump the version segment of a cache key whenever you change the `fields` you request** — an old row is still valid JSON, so nothing refetches it and the new fields silently read as `undefined` for a full TTL. The cache is shared across every account, so never wipe it wholesale from client code (`clearApiCache` was deliberately removed) — use the per-call `{ bypass: true }` option instead, which skips the read without ever deleting anyone else's warm cache.
- Prefer small, testable pure functions for grouping and status derivation (`src/domain/`) — they're the logic most likely to have bugs, and the existing Jest tests in `__tests__/` are the regression net; extend them when you touch this logic, don't just eyeball it.
- **Edge Functions (`supabase/functions/`) are MAL proxies, never a second home for domain logic.** `groupIntoSeries`, `deriveSeriesStatus`, `buildPushTargets`, etc. stay client-side in `src/domain/` and are called from there only — an Edge Function's job is "make the MAL call with the right credential and hand back the DTO," not "decide what the DTO means." The one narrow exception is `mal-import`'s related-anime closure expansion (which ids are missing, not how they group) — that's mechanical set-difference bookkeeping, not the grouping algorithm itself.

---

## Setup / secrets

`.env` (gitignored — **verify `.env` itself, not just `.env*.local`, is in `.gitignore`**; Expo's default template only ignores the latter, which does *not* cover a plain `.env` file — this was a near-miss caught during the Phase 1 rewrite):
```
EXPO_PUBLIC_SUPABASE_URL=YOUR_PROJECT_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PROJECT_ANON_KEY
```
Safe to expose in the client bundle — Postgres Row-Level Security (not key secrecy) is what protects a user's rows; see `supabase/migrations/`. `src/account/supabaseClient.ts` treats a blank/missing pair as "accounts not configured yet" rather than crashing, so the app keeps working with no Supabase project set up.

**The MAL Client ID is a Supabase Edge Function secret as of Phase 8** (`MAL_CLIENT_ID`, set via the dashboard's Edge Functions secrets page or `supabase secrets set MAL_CLIENT_ID=...`), never an `EXPO_PUBLIC_` var — the client bundle doesn't hold it, print it, or send it anywhere. Only `supabase/functions/_shared/malAuth.ts` reads it (`Deno.env.get('MAL_CLIENT_ID')`).

**`SITE_URL` is also a Supabase Edge Function secret** (e.g. `https://animetracker-btpk.onrender.com`, set the same way as `MAL_CLIENT_ID` above) — `mal-oauth-callback` reads it (`Deno.env.get('SITE_URL')`) to build the redirect target for the web MAL OAuth popup's `/oauth-complete` landing (see Feature specs §1). Not a secret in the confidentiality sense (it's the app's own public URL), but it has to live server-side because `mal-oauth-callback` is the thing constructing the redirect, not the client. Update it if the deployed web origin ever changes.

`app.json` — the `scheme` field is the **native** OAuth redirect scheme (`animetracker://`, same value the Kotlin app's intent-filter used). `expo-web-browser` + `expo-linking` read this automatically to catch the *final* redirect back from `mal-oauth-callback` on iOS/Android (see Feature specs §1) — there's no manifest/intent-filter to hand-write like the old `AuthRedirectActivity`. Web doesn't use this scheme at all — `malLinkRepository.web.ts` catches the same redirect via a `postMessage` from a popup instead (see Tech stack's Auth bullet). MAL itself only ever needs the Edge Function's URL registered, never this scheme.

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

7. **Accounts, no sync** *(done)* — Supabase project + `series`/`series_entries` schema + RLS (`supabase/migrations/`); email/password sign-up/login (`src/account/`) alongside MAL login and guest mode. An account has no MAL data and nothing syncs yet — it's scaffolding for Phase 8+.
8. **MAL custody moves server-side** *(done, live-verified on-device)* — Edge Functions (`supabase/functions/mal-*`) take over the MAL OAuth exchange/refresh and all MAL API calls; "Continue with MyAnimeList" is now a second way to get an account (auto-created from the MAL identity, via a one-time handoff-code session exchange — see Feature specs §1); the MAL Client ID left the client entirely. Import/Push are gated on whether MAL is linked to the current account (`mal_link_status`); Discover-add stays ungated since it never needed a MAL account. `src/auth/` (the old per-device MAL token store) is gone — replaced by `src/account/malLinkRepository.ts` + `src/account/guestMode.ts`. Verified end-to-end on the Android emulator: sign-in-with-MAL, import, Library, Discover, Recommendations, and the Push confirmation dialog. Two bugs found and fixed during that verification: `mal-session-exchange` was calling Supabase's `verifyOtp` with an invalid `token_hash` + `email` combination (GoTrue rejects it — only `token_hash` + `type` is valid); and `app/auth.tsx`'s redirect raced the caller's own `WebBrowser.openAuthSessionAsync` await, so it now owns finishing the OAuth handoff itself (reads the redirect params, exchanges the handoff code, calls `setSession`, and navigates) since expo-router reliably lands there before the original caller's promise resolves.
9. **Push-only sync** *(superseded, 2026-08-12 — see Phase 12)* — was a local `sync_outbox` table draining into Supabase, one direction only. Kept as history: this is the phase that first proved writes could reach Postgres at all.
10. **Full bidirectional sync** *(superseded, 2026-08-12 — see Phase 12)* — added a watermark poll + Realtime subscription pulling Supabase's changes back down into the local SQLite mirror, with device-id echo suppression and outbox/pull conflict handling. Fully replaced, not just supplemented, by Phase 12 — there's no local mirror left to pull *into*.
11. **Monthly sync moves server-side** *(done)* — `supabase/functions/mal-monthly-sync` runs entirely server-side, scheduled by `pg_cron`/`pg_net`, and also serves the client's synchronous "Sync now" button (per-user JWT mode). See Feature specs §6 for the full design (dual-mode auth, the narrow domain-logic-duplication exception). Unaffected by Phase 12 below — it already only ever touched Postgres.
12. **Direct-Postgres cutover + web build** *(done, 2026-08-12 — live-verified: `npx tsc --noEmit`, `npx jest` all 104 tests, `npx expo export` for both android and web, `npx expo prebuild --clean` for android)* — local SQLite (Drizzle + expo-sqlite) and the Phase 9/10 sync engine (`src/sync/`) are **deleted entirely**. Both native and web now read/write Supabase Postgres directly, with **no offline support** — this is the conventional server-backed client architecture, not a fallback. The trigger: Phase 12's original plan was to keep the Phase 9/10 architecture and give web the same local-SQLite mirror via `expo-sqlite`'s web driver (Web Worker + `SharedArrayBuffer` + OPFS); that driver's cold-start init reliably blew its own synchronous timeout budget on first load (`Sync operation timeout`, reproduced in both headless and real desktop Chrome — root-caused by temporarily instrumenting `node_modules/expo-sqlite`, not guessed at), and an app-level retry workaround made it worse (competing concurrent inits), not better. Rather than keep fighting an alpha driver, dropping offline support outright was the deliberate choice — it also deletes ~2,000 lines of sync machinery, fixes a real bug (the old per-device "has this account imported" flag re-ran onboarding on a second device — now `user_library_meta` is per-account), and removes the entire `wasm`/`SharedArrayBuffer`/COOP-COEP problem that blocked web in the first place. See "What this is", Tech stack, Package layout, and Data model above for the resulting architecture; PLAN.md's Phase 12b/12a sections are kept as an annotated historical record of the investigation. **Guest mode also changed shape** during this phase — see Feature specs §1's "Guest" bullet: a first draft made guests browse-only (no `auth.uid()` to write against without a local mirror), then anonymous Supabase auth was adopted instead, giving guests full read/write with no special-cased UI path anywhere in the app. **Still needs, from you, before this is fully live:** push `supabase/migrations/20260812000000_direct_postgres.sql` (this dev environment has no linked Supabase project to run `supabase db push` from); enable "Allow anonymous sign-ins" in the Supabase dashboard's Auth settings; connect the GitHub repo to a new Render static site (build command `npx expo export --platform web`, publish dir `dist`, SPA rewrite `/*` → `/index.html`, **no custom response headers needed** — the old COOP/COEP requirement is gone with expo-sqlite).

## Non-goals

No multi-user data sharing between accounts (each account's library is private to it). No manga (anime only). No monetization of any kind. Writing back to MAL is scoped to exactly the opt-in push described in §8 — no other write path (score, dates, comments, arbitrary status edits, deleting entries from MAL) is in scope. (Accounts/server-backend were a non-goal through Phase 6; that changed with the Phase 7+ pivot above — see the standing plan doc for why.)
