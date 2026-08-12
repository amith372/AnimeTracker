# PLAN.md — Phase 12 history (async SQLite driver, web build, direct-Postgres cutover) + Phase 13 backlog

Standing plan doc (full account/sync architecture, Phases 7–12 overview) lives outside the repo at
`C:\Users\Amit_PC\.claude\plans\i-want-to-build-recursive-dream.md`. Phases 7–11 are done and
live-verified (see CLAUDE.md's Build phases section). **Phase 12 is also done as of 2026-08-12** —
this file is now mostly a historical record of how it got there, kept because the investigation
that led to the final architecture is worth not re-deriving. A Phase 13 cleanup backlog follows,
independent of all of the above.

**Where things ended up:** local SQLite (Drizzle + expo-sqlite) and the Phase 9/10 sync engine
(`src/sync/`) are deleted. Both native and web read/write Supabase Postgres directly, with no
offline support on either platform. See CLAUDE.md's "What this is", Tech stack, Package layout,
Data model, and Build phases (Phase 12) sections for the resulting architecture and what's
verified — that's the current source of truth, not this file.

---

## Phase 12a — Async SQLite driver spike — cancelled, 2026-08-12, no code change needed

**Outcome: nothing to build.** The phase existed to unblock a web build on the assumption that
`expo-sqlite`'s synchronous driver has no web implementation, so the app's whole sync write path
would have to be rewritten async first. That assumption was wrong at the versions this repo pinned
(`drizzle-orm@0.45.2`, `expo-sqlite@57.0.1`, Expo SDK 57):

1. **There is no async Drizzle driver for `expo-sqlite`, and there can't be a drop-in one** —
   `drizzle-orm/expo-sqlite` is hard-typed as `SQLiteSession<'sync', ...>` and calls
   `client.prepareSync()`/`runSync`/`getAllSync`/`executeSync` unconditionally.
2. **`openDatabaseAsync` would work and would buy nothing** for the driver — both open functions
   return the identical `SQLiteDatabase`, and Drizzle still calls `prepareSync` underneath either
   way. (This turned out to matter for a different reason — see 12b's cold-start finding below.)
3. **`expo-sqlite` already ships a full web implementation, including the entire sync surface**,
   via a Web Worker + `SharedArrayBuffer`/`Atomics` blocking bridge, with persistence through
   wa-sqlite's OPFS `AccessHandlePoolVFS`. `enableChangeListener` was honored on web too, so
   `useLiveQuery` worked unchanged — confirmed empirically in 12b, modulo the cold-start bug that
   ultimately killed the whole approach (below).

---

## Phase 12b — Web build attempt on local SQLite — abandoned, 2026-08-12

**Original plan:** ship web on the *same* local-SQLite architecture as native (`metro.config.js`
for the `wasm` asset + COOP/COEP headers, `expo-secure-store` → `localStorage` swaps, a web OAuth
popup, deploy to Render). Steps 0–3 landed real, useful findings before the plan changed:

- **Step 0 (`metro.config.js`)** — done: `assetExts` includes `wasm`; a dev-server
  `enhanceMiddleware` sets COOP/COEP. This file was later deleted along with expo-sqlite (Phase
  12), since it existed for no other reason.
- **Step 1 found a dev-server COOP/COEP gap**: `npx expo start --web` can't be made
  cross-origin-isolated via `metro.config.js` alone — Expo's own `ManifestMiddleware` serves `/`
  *ahead of* the wrapped Metro middleware, so the headers never reach the top-level document, only
  bundle/asset sub-requests. Worked around at the time via `expo export` + a local static server
  that sets headers on every path.
- **Step 1 found the actual blocker: a cold-start `Sync operation timeout` crash.** With headers
  correct, `crossOriginIsolated`/`SharedArrayBuffer` worked and the worker/wasm loaded fine — but
  the *first* `openDatabaseSync` call on a fresh page load reliably threw. Root-caused by
  temporarily instrumenting `node_modules/expo-sqlite/web/{worker.ts,WorkerChannel.ts}` (reverted
  after diagnosis): the worker genuinely completes its one-time cold init (wasm compile + OPFS VFS
  setup + `sqlite3.open_v2`) in ~40ms of its own measured time, but the main thread's
  `invokeWorkerSync` busy-wait has a **fixed 1,000,000-iteration cap** on its `Atomics.pause()`
  spin loop, which timed out after **~75-80ms measured wall-clock** — shorter than the worker
  needed despite the worker's own work being individually faster than that window. Reproduced in
  headless Chromium *and* confirmed independently in real desktop Chrome — not a test-harness
  artifact.
- **A retry-based app-level workaround was tried and made things worse, not better.** Retrying
  `openDatabaseSync` after a failure re-triggered a *second* concurrent cold init in the worker
  (no lock around the async init path), racing the first and taking even longer; up to 6 rapid
  retries all failed the same way. A version that waited between retries (without sending a second
  competing message) also failed, suggesting the main-thread busy-spin itself was starving the
  worker thread from making progress in this environment, not just running out of budget.

**Decision, 2026-08-12: stop fighting the driver.** Rather than pursue the two originally-planned
fallbacks in order (a web-only SQLite package, then direct-Postgres-for-web-only), the call was
made to drop offline support **entirely, on both platforms**, and go straight to direct-Postgres
everywhere — see Phase 12 (direct-Postgres cutover) below for why that's a better outcome than
either narrower fallback, and CLAUDE.md's Phase 12 entry for what actually shipped.

*(Findings not superseded by the cutover, kept for reference: `credentialless` not `require-corp`
for COEP — `require-corp` would have blocked MAL's cross-origin poster CDN images; Render was
chosen as host over Vercel, nothing depended on which.)*

---

## Phase 12 — Direct-Postgres cutover (what actually shipped), 2026-08-12

The "fallback: direct-Postgres on web" design once documented here (a `.web.ts`-only split, native
keeping SQLite) was **not** what shipped — once offline was being dropped for web, keeping a
second, native-only local-SQLite architecture alive just to preserve native offline support wasn't
worth the two-data-layer maintenance cost that design's own costs section already flagged. Instead:

- **Both platforms cut over identically.** `src/db/`, `src/sync/`, `drizzle.config.ts`,
  `metro.config.js` deleted; `drizzle-orm`, `drizzle-kit`, `expo-sqlite`, `expo-secure-store`
  removed. One data-access layer (`src/repositories/AnimeRepository.ts` + `seriesMapping.ts`),
  not two — the exact "parallel web implementation" cost the old fallback design was trying to
  avoid by keeping native on SQLite doesn't exist, because there's only one implementation now.
- **Reactivity:** TanStack Query (`@tanstack/react-query`) + a Supabase Realtime subscription
  (`src/repositories/realtime.ts`) invalidating the query cache — the "back the reactive `use*`
  hooks with Supabase Realtime subscriptions" idea from the old fallback design, generalized to
  both platforms instead of web-only.
- **Guest mode changed shape mid-implementation.** The first pass made guests browse-only (no
  `auth.uid()`, no local mirror to write into). That was reversed once anonymous Supabase auth was
  identified as a better fit — a guest now gets a real, if temporary, `auth.uid()` via
  `supabase.auth.signInAnonymously()`, so guest and real-account code paths are identical
  everywhere except account-conversion UI (`app/onboarding/account.tsx`). See CLAUDE.md's Feature
  specs §1.
- **Verified:** `npx tsc --noEmit` and `npx jest` (104 tests, unchanged assertions) clean;
  `npx expo export --platform android` and `--platform web` both bundle (web is now a single JS
  bundle — no separate worker bundle, since there's no wasm/SharedArrayBuffer dependency left);
  `npx expo prebuild --clean` regenerates the native Android project cleanly with no
  expo-sqlite/expo-secure-store artifacts.
- **Not yet live-verified on-device** (no Android emulator run, no deployed web build) — see
  "Still open" below.

### Still open — needs you, not more code
1. **Push the new migration.** `supabase/migrations/20260812000000_direct_postgres.sql` (adds
   `api_cache`, `user_library_meta`, the `add_series` RPC, and a daily prune cron) hasn't been
   applied — this dev environment has no Supabase project linked to run `supabase db push` from.
2. **Enable anonymous sign-ins.** Supabase dashboard → Authentication → Settings → "Allow
   anonymous sign-ins". Guest mode returns an auth error until this is on.
3. **Deploy web to Render.** New static site, build command `npx expo export --platform web`,
   publish directory `dist`, SPA rewrite `/*` → `/index.html`. **No custom response headers
   needed** — the COOP/COEP requirement was entirely about expo-sqlite's `SharedArrayBuffer`
   bridge, which no longer exists. (Also: don't add `Cross-Origin-Opener-Policy: same-origin` even
   out of habit — it would break `malLinkRepository.web.ts`'s `window.opener`-based OAuth popup.)
4. **Live-verify end to end**, on a real device/emulator and a real deployed URL: sign up/log in
   (email, MAL, guest), import, tap-to-mark, Discover-add, Recommendations, Push to MAL, Sync now,
   and the cross-device Realtime proof (a change on one platform appearing on the other without a
   manual refresh) — the actual payoff of the whole Phase 7–12 arc.
5. **Existing local libraries are stranded** — anyone who used the app before this cutover (signed
   in or not) had their data in local SQLite, which is now deleted client-side. Nothing was written
   to migrate it. Worth a decision, even if the decision is "accept it."

---

## Phase 13 — React Native list-performance / rendering cleanup

**Origin:** a `react-native-skills`-guided review of the existing app (2026-08-08) against that
skill's rule set (`AGENTS.md`) found the codebase clean on animation, navigation, and most UI
patterns, but a real cluster of list-performance and derived-state issues — one of which is a
correctness bug already flagged in the code's own comments, not just a style deviation.
Independent of Phase 12 — can land in either order. File:line references below predate the Phase
12 cutover's edits to several of these same files (`index.tsx`, `recommend.tsx`, `series/[id].tsx`)
and may have drifted a few lines; re-check on pickup rather than trusting them exactly.

### Findings to fix

1. **List item components are unmemoized, paired with inline `renderItem` closures** — the two
   together mean adding `React.memo` alone wouldn't help, both need fixing together:
   - `SeriesRow` (`app/(tabs)/index.tsx`, its `renderItem` builds a fresh `onPress` per row)
   - `PosterTile` (`src/components/PosterTile.tsx`) — used in Discover's horizontal preview rows
     and the paginated 3-column grid, which can grow to hundreds of tiles via `onEndReached`.
     Highest-exposure instance of this pattern.
   - `CatchUpCard` / `RecommendationCard` (`app/(tabs)/recommend.tsx`)
   - `EntryRow` / `ArcListRow` (`app/series/[id].tsx`) — means toggling one season's checkbox
     currently re-renders every visible row.
2. **`useCatchUp()` is unmemoized and is the root cause of a bug already documented in-repo** —
   `src/repositories/RecommendationRepository.ts`'s `useCatchUp` calls `getCatchUpEntries(allSeries)`
   directly in the render body with no `useMemo`, producing a new array reference every render even
   when `allSeries` hasn't changed. `app/(tabs)/recommend.tsx`'s own comment describes a
   near-infinite-update bug this causes; its `filteredCatchUp`/`sortedRecommended`/`catchUpSplit`/
   `catchUpSections` compound it with more unmemoized `.filter()`/`.sort()` calls feeding straight
   into `SectionList`'s `sections` prop. Contrast with `src/repositories/AnimeRepository.ts`'s
   `useLibrary`, which relies on TanStack Query's structural sharing for stable references —
   `useCatchUp` should follow the same "stable identity unless the underlying data changed" rule,
   via `useMemo`.
3. **`SquareCheckbox.tsx`** builds its `style` prop as an inline object literal instead of
   `StyleSheet.create`, inside a list row (Series Detail) that re-renders per tap.
4. **No `FlashList`** — all lists use RN's built-in `FlatList`/`SectionList`. Not a crash risk
   (`FlatList` still virtualizes), lowest-priority item here, most relevant to Discover's large
   paginated grid if the library ever grows large enough to matter.
5. **Minor UI-pattern deviations, low priority:**
   - `login.tsx`, `account.tsx` — `{error && (...)}` / `{message && (...)}` on `string | null`
     without boolean coercion (the `react/jsx-no-leaked-render` anti-pattern); low real risk since
     these are never `0`/`NaN`, but worth a `!!`/ternary fix for correctness-by-construction.
   - `app/(tabs)/_layout.tsx`, `discover.tsx`, `index.tsx` — Android-only `elevation` instead of
     cross-platform `boxShadow` string syntax.
   - `app/_layout.tsx`, `app/(tabs)/_layout.tsx` — `SafeAreaView` wrapping instead of
     `contentInsetAdjustmentBehavior="automatic"` on the root scrollable content.

### Not violations (confirmed clean, no action needed)
No Reanimated/`Animated` usage anywhere (nothing to fix). Navigation already uses Expo Router's
native-stack-backed `Stack`/`Tabs`. `Pressable` used consistently, never `TouchableOpacity`.
`expo-image` used for all list/detail imagery. `StyleSheet.create` used consistently elsewhere.

### Suggested order
Fix #2 (`useCatchUp` + `recommend.tsx` derived state) first — it's the one with an actual observed
bug behind it, not just a performance concern. Then #1 (memoize list items + hoist `renderItem`
closures via `useCallback`) together, screen by screen. #3 and #5 are quick, low-risk touch-ups.
Treat #4 (FlashList) as optional/deferred — no correctness impact, revisit only if a list's size in
practice starts to matter.

### Verification
- `npx jest` / `npx tsc --noEmit` clean.
- Manual: confirm the `recommend.tsx` near-infinite-update issue referenced in its own comment is
  gone after #2; confirm toggling one row (Library tap-to-mark, Series Detail checkbox, Discover
  add) no longer visibly re-renders sibling rows (React DevTools highlight-renders, or just eyeball
  responsiveness on a long list).
