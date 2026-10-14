# PRD 3 — A greeting that names who is signed in

Status: **drafted 2026-10-14, awaiting sign-off.** Asked for mid-session on 2026-10-14, after plan
1 step 8's check passed. Two shape decisions were answered the same day and are recorded below.

## Problem

The app never says whose library it is showing. There are three ways to get a session — email/
password, "Continue with MyAnimeList", and guest (anonymous auth) — and no screen distinguishes
them. Two consequences, and the second is the one that matters:

1. With a guest session and a real account both reachable from the same browser, nothing on screen
   says which one is live. The libraries differ; the UI does not.
2. **A guest has no signal that their library is temporary.** Guest mode is a real account with a
   real `auth.uid()` (CLAUDE.md Feature specs §1), so it looks and behaves exactly like a permanent
   one right up until the session is lost. Naming it "Guest" is the cheapest honest warning there
   is.

## Success criteria

- The wide-web sidebar shows one line, `Welcome <name>`, under the wordmark, on every route.
- `<name>` resolves as: MAL username if the account has MAL linked; otherwise the local-part of the
  account's email; otherwise `Guest` for an anonymous session.
- An account that already existed before this change gets its name **without the user re-linking
  MAL**.
- A synthetic `mal-123456@mal-users.animetracker.app` address never appears on screen.
- The sidebar still renders, unchanged and un-erroring, when Supabase is not configured, when the
  name cannot be fetched, and while the session is still loading.

## Scope

**In:** the sidebar line; requesting and storing the MAL username; a one-time backfill for accounts
created before this change.

**Explicitly out:**
- **The mobile layout.** There is no sidebar on a phone, and the decision on 2026-10-14 was web
  only. Adding a greeting to the mobile Library header is a separate ask.
- A user-editable nickname, avatars, or any account-settings surface.
- **Any name on plan 4's public share page.** See Constraints.
- Changing how accounts are created, authenticated, or linked. This PRD adds a field to an existing
  flow; it does not touch the flow's logic.

## Decisions settled 2026-10-14

| Question | Answer | Why |
|---|---|---|
| What is the name for a MAL-created account? | Store the MAL username | The alternatives were `mal-123456` (worse than nothing) or no name at all. MAL returns `name` from the same `users/@me` call we already make; we simply never asked for it. |
| Where does the greeting go? | Web sidebar, under the app title | Visible on every route, costs no vertical space in the lists, and does not scroll away. |

## Constraints

- **MAL agreement §4(f)** governs personal information about people. Showing the account owner
  their *own* MAL username, to themselves, inside their own authenticated session, is not
  distribution. It must never reach plan 4's public page — `prd/2-public-share.md` already bars MAL
  username, MAL user id, email and account id from that page, and **this PRD does not relax that**.
  The greeting is sidebar-only and the sidebar is never rendered for a share viewer.
- **The username is cosmetic and is never an authorization input.** Nothing in RLS, no Edge
  Function gate, and no derivation reads it. That is what makes Supabase `user_metadata` the right
  home for it — it already holds `mal_user_id` from the same callback (`mal-oauth-callback`), it
  needs no migration, and a user being able to edit their own `user_metadata` can therefore only
  change what their own sidebar says.
- **Guardrail #3** (stay light on MAL's servers): the backfill is at most one `users/@me` call per
  account, once, and only when the stored name is absent.
- No secrets or PII in logs — the username is neither logged nor sent anywhere but the sidebar.

## Edge cases

| Case | Behaviour |
|---|---|
| Guest who has linked MAL | Show the MAL username, **not** "Guest". Once MAL is linked the session is identifiable, and of two true answers the name is the informative one. *(Proposed — see Open questions.)* |
| MAL linked, username fetch fails | Fall back to `Welcome back` with no name. The greeting must never block or error the sidebar. |
| User renames themselves on MAL | The stored name goes stale until the next sign-in or re-link. Accepted: renames are rare, and re-fetching on every load would spend a MAL call per page view against guardrail #3. |
| Email/password account that also has MAL linked | MAL username wins — it is the name the user chose, the email is the one they typed to log in. |
| Supabase not configured | No greeting at all; sidebar identical to today. |
| Session still loading | Render nothing rather than flashing "Guest" and then correcting itself. |

## Open questions

1. **Guest + MAL linked** — the table above proposes showing the MAL username. The counter-argument
   is that "Guest" is a warning about impermanence, and linking MAL does not make the session
   permanent, so suppressing it is exactly when the warning matters most. **Needs a decision before
   step 3.**

## Implementation

### Step 1 — Store the MAL username at its source
- `supabase/functions/mal-oauth-callback/index.ts`: request `fields: 'id,name'` instead of
  `'id'`, and write `mal_username` into `user_metadata` — on the create path (alongside the
  existing `mal_user_id`) and on both the link-variant and existing-account paths via
  `supabaseAdmin.auth.admin.updateUserById`.
- Deploy with `--use-api` (no Docker on this machine; see `build_plan.md`).
- **Check:** sign out, "Continue with MyAnimeList" again, and confirm in the Supabase dashboard
  (Authentication → the user → metadata) that `mal_username` now holds your MAL name. Failure: the
  field is absent, or sign-in itself breaks.

### Step 2 — Backfill accounts that predate step 1
- New Edge Function `supabase/functions/mal-me/`: reads the caller's user id from the JWT, gets a
  token via `getValidMalAccessToken(userId)`, fetches `users/@me?fields=id,name`, writes
  `mal_username` to `user_metadata`, returns `{ name }`. A proxy and a write, no domain logic —
  within the Edge Function rule in CLAUDE.md's Conventions.
- `src/api/edgeFunctions.ts`: a typed `callMalMe()` wrapper.
- **Check:** with your existing account, confirm the dashboard shows `mal_username` after one app
  load. Failure: still absent, or a visible error.

### Step 3 — The sidebar line
- `src/account/displayName.ts`: a `useDisplayName()` hook returning `{ name, isGuest, loading }`,
  resolving in the order set out in Success criteria and triggering step 2's backfill once when MAL
  is linked and no name is stored.
- `src/components/web/WebSidebar.tsx`: render the line under `brandRow`.
- Tests: the resolution order is pure and belongs in `__tests__/` — a MAL name beating an email, an
  email local-part being taken correctly, an anonymous session reading `Guest`, and the
  fetch-failed fallback. Figures derived from the inputs, not from what the hook returned.
- **Check:** open the web app and confirm the sidebar reads `Welcome <your MAL name>`. Then open a
  private window, continue as a guest, and confirm it reads `Welcome Guest`. Failure: a raw
  `mal-123456` address, a blank line, a flash of "Guest" before the real name, or a sidebar that
  errors.
