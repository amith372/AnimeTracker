# CLAUDE.md — AnimeTracker

Standing project guide for Claude Code. Read this before writing code each session.

## What this is

A **personal, non-commercial** Android app for tracking anime watch progress, built for a single user on their own Samsung Galaxy S21. It reads data from the **MyAnimeList (MAL) official API v2** and keeps all watch data **locally on the device**. MAL is read-only; the local database is always the source of truth.

- **Package:** `com.amith.animetracker`
- **Repo:** https://github.com/amith372/AnimeTracker
- **Build:** local Gradle only — no third-party/cloud build service.

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

- **Language:** Kotlin, coroutines + Flow
- **UI:** Jetpack Compose (Material 3)
- **Pattern:** MVVM, unidirectional data flow, sealed `UiState`
- **Local DB:** Room (single source of truth for the UI)
- **Networking:** Retrofit + kotlinx.serialization (`Json { ignoreUnknownKeys = true }`)
- **Auth:** OAuth2 with PKCE via a Chrome Custom Tab (manual PKCE; see Auth notes)
- **Background work:** WorkManager (monthly sync)
- **Images:** Coil (`coil-compose`)
- **DI:** manual (a simple `AppContainer`/service-locator held by the `Application`). Hilt is optional and not required for a solo app.

**SDK:** `minSdk 26`, `targetSdk 35`, `compileSdk 35`. Device runs Android 15. Use the latest stable AGP, Kotlin, and Compose BOM. Single Gradle module (`:app`) for now.

---

## Package layout

```
com.amith.animetracker
├── data
│   ├── local        // Room: entities, DAOs, AnimeDatabase
│   ├── remote        // Retrofit service, DTOs, MAL auth
│   └── repository    // AnimeRepository — the only thing ViewModels touch
├── domain           // plain models + derivation logic (status, grouping)
├── ui
│   ├── theme
│   ├── library       // main list of series
│   ├── seriesdetail  // seasons + movies, tap-to-mark
│   ├── discover      // search / browse to add unwatched anime
│   ├── recommend     // recommendations + "catch up" seasons
│   └── onboarding    // login + import + reconcile
├── work             // WorkManager workers (monthly sync)
└── AnimeApp.kt       // Application, AppContainer
```

Rule: **the UI observes Room `Flow`s.** Network calls write into Room; the UI never reads the network directly. This gives offline-first behavior for free — viewing and marking work with no internet.

---

## Data model

Each MAL "anime" is a single season/movie entry. We group related entries into a **Series**.

**Series** — one grouped show (or one standalone movie)
- `id` (local PK), `title`, `coverUrl`, `genres: List<String>`
- `rootMalId` — the MAL id we follow relations from (usually season 1)
- `type`: `SERIES` | `STANDALONE_MOVIE`
- `manualStatus`: `PLAN` | `CURRENTLY_WATCHING` | `DROPPED` | `WATCHED_FORGOT` | `NONE`
  (When `NONE`, the effective status is derived from entries — see below.)

**SeriesEntry** — each MAL entry belonging to a series
- `id` (local PK), `seriesId` (FK), `malId`
- `kind`: `TV_SEASON` | `MOVIE`
- `orderIndex` (season order within the series)
- `title`, `episodeCount`
- `watched: Boolean` (the V / empty mark)
- `airingStatus`: `FINISHED` | `AIRING` | `NOT_YET_AIRED`

**SyncMeta** — `lastSyncEpoch`, per-series `newSeasonAvailable: Boolean`

### Status derivation (the tricky part)

Statuses live **per series**. There are 6:

| Status | How it's set |
|---|---|
| `PLAN`, `CURRENTLY_WATCHING`, `DROPPED`, `WATCHED_FORGOT` | Manual (`manualStatus`) — user sets it, it sticks until changed. |
| **Watched** | Derived: `manualStatus == NONE` **and** every `TV_SEASON` entry is `watched`. |
| **Watched X/Y** | Derived: `manualStatus == NONE` and **some but not all** `TV_SEASON` entries are watched. Display as `watched X/Y`, where **X = highest consecutive watched season**, **Y = total TV_SEASON entries that exist now**. |

- **X/Y counts TV seasons only.** Movies live inside the series with their own `watched` mark but never change X or Y.
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
- Access token lasts ~31 days; refresh token longer. Refresh proactively before the monthly sync.

### 2. Initial import (onboarding)
- `GET /users/@me/animelist?fields=list_status,num_episodes,media_type&limit=1000` (paginate via `paging.next`).
- Map MAL `list_status.status` → app status:
  `completed → watched entry`, `watching → CURRENTLY_WATCHING`, `dropped → DROPPED`, `plan_to_watch → PLAN`, `on_hold → CURRENTLY_WATCHING`. `WATCHED_FORGOT` has no MAL equivalent (user sets it later).
- Then group into series (below) and show the **reconcile screen**: entries the user marked `completed` on MAL come pre-checked; the user ticks any seasons they actually watched but never marked. (Important: the user historically only marked season 1 of shows they finished.)

### 3. Series grouping (from relations)
- For each imported anime: `GET /anime/{id}?fields=related_anime,media_type,num_episodes,genres,main_picture,title`.
- Build the TV chain by following `related_anime` with `relation_type` **`sequel` / `prequel`**.
- Attach related entries where `media_type == "movie"` as `MOVIE` entries **under the parent series** (e.g. a Demon Slayer film nests under the Demon Slayer series).
- A `movie` with no TV series in its relation chain becomes its own `STANDALONE_MOVIE` series, shown with a **Movie** badge.
- Dedupe carefully — chains overlap; group by connected component, don't create duplicate series.

### 4. Discover / add (manual)
- Search: `GET /anime?q={query}&fields=media_type,genres,main_picture,num_episodes,start_season`.
- Browse: `GET /anime/ranking?ranking_type=all|bypopularity|favorite` and `GET /anime/season/{year}/{season}`.
- **Filter out anything already in the local list** (surface only not-yet-tracked / unwatched). Each result has an **Add** button that creates the series/entries locally and sets a status.

### 5. Edit status
- Purely local Room writes. Never `PATCH`/`PUT`/`DELETE` back to MAL.

### 6. Monthly sync (WorkManager)
- Periodic worker (~30 days), constraints: network connected.
- Refresh token first. For each series with derived status **Watched** or **Watched X/Y**: re-fetch `related_anime` on `rootMalId`, add any new `TV_SEASON` entries, recompute X/Y, set `newSeasonAvailable` where Y grew.
- Show the new-season list in-app; the flip from Watched → Watched X/Y is the same mechanism as the alert.

### 7. Recommendations
- **MAL-based:** aggregate `GET /anime/{id}?fields=recommendations` across all **non-dropped watched** series; tally how often each candidate appears.
- **Genre-based:** build a genre-affinity profile from watched series; score candidates by genre overlap.
- Combine, dedupe, and **exclude** anything already in the list or related to dropped shows.
- Plus a **"Catch up" section**: unwatched TV-season entries inside series that are Watched / Watched X/Y.

---

## Conventions

- Repository returns a `Result`-style sealed type; no exceptions leak to ViewModels.
- All network on `Dispatchers.IO`; ViewModels expose `StateFlow<UiState>`.
- One Room DB, exposed as `Flow`; writes are suspend functions in DAOs.
- Every network response DTO is separate from the Room entity and the domain model — map between them explicitly.
- No secrets, tokens, or PII in logs.
- Prefer small, testable pure functions for grouping and status derivation (they're the logic most likely to have bugs).

---

## Setup / secrets

`local.properties` (gitignored — verify it's in `.gitignore`):
```
mal.clientId=YOUR_CLIENT_ID_FROM_MAL
```

Wire into `app/build.gradle.kts`:
```kotlin
android {
    defaultConfig {
        val malClientId: String = project.rootProject
            .file("local.properties").readLines()
            .firstOrNull { it.startsWith("mal.clientId=") }
            ?.substringAfter("=") ?: ""
        buildConfigField("String", "MAL_CLIENT_ID", "\"$malClientId\"")
    }
    buildFeatures { buildConfig = true }
}
```

`AndroidManifest.xml` redirect handler:
```xml
<activity android:name=".ui.onboarding.AuthRedirectActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="animetracker" android:host="auth" />
    </intent-filter>
</activity>
```

`.gitignore` (must exist at the repo root — create it in phase 1). The Android Studio "New Project" template already ignores `local.properties` and `build/`; verify those lines are present and never remove them. Minimum contents:
```gitignore
# Secrets — never commit
local.properties

# Android / Gradle / IDE
.gradle/
build/
/app/build/
.idea/
*.iml
.externalNativeBuild/
.cxx/
captures/
*.apk
*.aab
*.keystore
*.jks
local.properties.*
```

---

## Build & run

- `./gradlew assembleDebug`
- Install on the S21: `adb install -r app/build/outputs/apk/debug/app-debug.apk` (or Run from Android Studio / Claude Code).
- No cloud build — everything is local Gradle.

---

## Build phases (work in this order)

1. **Skeleton + model** — Gradle setup, Room entities/DAOs, Compose library + series-detail screens driven by **fake in-memory data**. Goal: a runnable app on the S21 with tap-to-mark working, no network.
2. **Auth** — OAuth2 PKCE login, encrypted token storage.
3. **Import + grouping + reconcile** — pull `@me` list, build series, reconcile screen.
4. **Discover / add** — search + browse + Add, filtered to not-yet-tracked.
5. **Monthly sync** — WorkManager, new-season detection, Watched → Watched X/Y flip.
6. **Recommendations** — MAL + genre combined, plus Catch-up.

Each phase should leave the app installable and working on the device.

## Non-goals

No writing back to MAL. No accounts/multi-user. No server/backend. No manga (anime only). No monetization of any kind.
