# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary users are the developer and a small circle of people they know personally (friends/family) — not a public audience seeking this out on their own. Each person gets their own private account (Supabase Auth email/password, "Continue with MyAnimeList" OAuth, or an anonymous guest session); there is no cross-account sharing (see Capabilities and Constraints). The shared situation: someone who already has (or is actively building) a MyAnimeList watch history and wants a better way to track progress across a show's seasons and movies than MAL's own per-entry list gives them, on both phone and web.

## Product Purpose

Track anime watch progress against a user's real MyAnimeList data, automatically grouping a show's related seasons and movies into one Series with a derived watch status, so the user always knows where they left off and what to watch next. MAL is the import source; the app's own Postgres becomes the source of truth for status once something is tracked, with one explicit, opt-in action to push select statuses back to MAL. Success looks like the user trusting the app's status enough that they stop checking MAL directly for their own progress.

## Positioning

Automatic grouping of a show's seasons and movies into a single Series with a derived rollup status ("Watched 3/5 seasons") — MAL itself tracks every season/movie as a separate, unrelated list entry with no such rollup. On top of that: a "Catch up" list (the next unwatched season/movie in shows already underway) and recommendations that blend MAL's own co-recommendation tally with the user's own genre affinity. A straight MAL-list clone, or a generic tracker like AniList, would need to rebuild this status math from scratch to make the same claim.

## Operating Context

- MyAnimeList API v2 is the only external data source, and only through the official API (never scraped) — see Capabilities and Constraints.
- Supabase Postgres is the backend for every account; Supabase Auth covers three account paths (email/password, MAL OAuth sign-in, anonymous guest).
- Core workflows: initial import + reconcile from an existing MAL list; manual Discover/search/browse + add; tap-to-mark a season/movie watched or "won't watch"; manual status override with a way back to automatic; a monthly server-side sync that detects new seasons and flips a show from Watched to Watched X/Y; Recommendations (Catch-up + For You); one opt-in "push to MAL" action.
- One Expo/React Native codebase targets Android, iOS, and web. Web now has a deliberately different, desktop-oriented layout (left sidebar nav, poster-card grids, a wide two-column Series Detail) from native's mobile layout (bottom tabs, stacked lists) — see Platform.
- No offline mode: the app needs a network connection for everything beyond what's already cached in memory for the current session.

## Capabilities and Constraints

- Bound by the MyAnimeList API License & Developer Agreement: the MAL Client ID never reaches the client (Edge Function secret only); MAL access/refresh tokens are server-side only (Postgres, deny-all RLS, service-role-only access); all MAL data comes through the official API, never scraped HTML; the app must display "Data from MyAnimeList" attribution and must not imitate MAL's branding or UI as its own identity; the API is unsupported and can be revoked, so failures must be handled gracefully, never crash.
- Strictly non-commercial: no ads, fees, subscriptions, or donations of any kind. Adding any would require MAL's written permission and is explicitly out of scope.
- MAL is read-only except one explicit, user-confirmed push (Plan to watch / Watching / Watched-per-entry only) — nothing else in the app round-trips to MAL for its own logic.
- No local database and no offline support (a deliberate architecture decision) — every screen reads and writes Postgres directly.
- No multi-user data sharing between accounts. Each account's library is private, even among the people-you-know userbase.
- Anime only — no manga.

## Brand Commitments

- Name: "AnimeTracker" (package/bundle id `com.amith.animetracker`).
- Logo mark: an "AT" wordmark in a rounded square filled with a coral → pink → blue gradient, used as the app icon and in-app brand mark.
- Must never look like, or read as, the official MyAnimeList app or its branding — attribution, not imitation.
- Typography: Zen Kaku Gothic New for display/anime-title text and Plus Jakarta Sans for UI/body text, used everywhere; Shippori Mincho is reserved for web-only chrome headlines (sidebar wordmark, page titles, the Series Detail hero title) as of the recent web-layout work.
- The color palette is sourced from an approved external design project ("Anime tracker app design" on claude.ai/design) and should be treated as settled, not reinvented from scratch.

## Evidence on Hand

- `CLAUDE.md` at the project root is an unusually complete, standing product/engineering spec: data model, MAL endpoint list, status-derivation rules, screen-by-screen feature specs, and build-phase history. Treat it as primary evidence for anything not captured here.
- The claude.ai/design project "Anime tracker app design" is the source of both the current color palette and the web-only layout just implemented (`AnimeTracker Web.dc.html`); its `uploads/` folder holds prior exports.
- No user testimonials, marketing screenshots, or press exist, and none should be fabricated — this product doesn't market itself.

## Product Principles

1. Postgres is the source of truth for everything the app displays and derives; MAL is a read source except one explicit, narrow, user-confirmed push.
2. Status is derived automatically from what's actually marked watched, but a manual override always wins, and always has a way back to "auto."
3. Every MAL API guardrail in `CLAUDE.md` is contractual, not a style preference — never work around them for convenience.
4. Never monetize; never make cross-account data shared or public.
5. Native and web may diverge in visual language (this product is `adaptive`) but never in what the app actually does — one grouping algorithm, one status model, the same repositories and hooks underneath both.

## Accessibility & Inclusion

None established yet — no specific accessibility requirement has driven decisions so far.
