# PRD 4 — MAL sign-in that works in dev and production at once

Status: **drafted 2026-10-14, awaiting sign-off.** Found while trying to run plan 6 step 1's check:
MAL sign-in cannot complete at all on a local web dev server.

## Problem

The web MAL OAuth popup can only finish on **one** origin, fixed at deploy time by the `SITE_URL`
Edge Function secret.

`mal-oauth-callback`'s `webFinish` redirects the popup to `${SITE_URL}/oauth-complete`. That page
(`app/oauth-complete.tsx:36`) posts the result to `window.opener` with `targetOrigin` set to its own
origin, and the opener (`src/account/malLinkRepository.web.ts:64`) drops any message whose
`event.origin` is not its own. Both are correct, and both assume popup and opener share an origin.

On a dev server they do not. The app is on `http://localhost:8081`, `SITE_URL` points at the
deployed site, so the popup finishes on the deployed origin and addresses its message there. The
browser will not deliver that to a `localhost` opener, and the listener would reject it if it did.
**The symptom is silence**: MAL authorizes, the popup closes, and the page the user started from is
unchanged — no error, nothing in the console, nothing to search for.

Native is unaffected: it redirects to `animetracker://auth`, which is origin-less by construction.

Today this makes any work touching sign-in, linking, import, or push unverifiable without deploying
first, which is the opposite of a dev loop.

## Success criteria

- "Continue with MyAnimeList" and "Link MyAnimeList" both complete on a local web dev server.
- The same build, unchanged, still completes on the deployed site.
- An OAuth flow started from an origin that is **not** allowlisted finishes at `SITE_URL`, exactly
  as it does today.
- Native sign-in and linking are untouched.
- No new way for a third party to receive a handoff code.

## Scope

**In:** carrying the initiating origin through the OAuth round trip, and validating it.

**Explicitly out:** the native redirect path; the shape of the popup handshake itself; `SITE_URL`
going away (it stays the default and the production answer); anything about what a session can do
once it exists.

## Design

One nullable column and one lookup.

1. `mal_oauth_sessions` gains `return_origin text` (nullable). The row already carries `platform`
   and `code_verifier` across the same round trip; this is the third thing that must survive it.
2. `mal-oauth-start`, for `platform === 'web'` only, reads the request's `Origin` header, checks it
   against the allowlist below, and stores it when allowed. Not allowed, absent, or native → the
   column stays null.
3. `mal-oauth-callback`'s `webFinish` redirects to `session.return_origin ?? SITE_URL`.

A null therefore reproduces today's behaviour exactly, which is what makes this a strict superset
rather than a change in the production path. `webFinish` has to take the origin as an argument
rather than closing over a module constant; every call site is already inside the handler where the
session row is in scope.

### The allowlist

Two entries, and it must never become a wildcard:

- **`SITE_URL`** — the deployed site, the production answer.
- **Loopback origins** — `http://localhost:<port>` and `http://127.0.0.1:<port>`, any port.

Ports are not pinned because Expo's web dev server picks one (8081 normally, but not reliably), and
pinning it would reintroduce the same silent failure one port later.

### Why loopback is safe to allow in production

The `Origin` header is attacker-controllable by any non-browser client, so the allowlist — not the
header's provenance — is the entire control. Given that, the question is what an attacker gains by
spoofing `Origin: http://localhost:8081`.

They gain nothing, because **a loopback redirect resolves on the machine that follows it**. The
victim's browser is what visits `localhost:8081/oauth-complete?handoff=...`, so the handoff code is
delivered to the victim's own machine, not the attacker's. To intercept it the attacker would need
to already be running a server on the victim's loopback interface, at which point the OAuth flow is
not the weakness.

This reasoning holds **only** for loopback. Any future allowlist entry naming a routable host would
be a genuine open redirect handing out session handoff codes, and would need its own analysis.

## Edge cases

| Case | Behaviour |
|---|---|
| Existing `mal_oauth_sessions` rows (no column value) | Null → `SITE_URL`. The column is nullable and added without a default for exactly this reason. |
| `Origin` header absent | Null → `SITE_URL`. |
| Origin present but not allowlisted | Null → `SITE_URL`, silently. It is not an error: the caller gets a working sign-in, just not one that returns to them. |
| `platform === 'mobile'` | Origin never read or stored; the native redirect is unchanged. |
| Dev server on a different port | Allowed — any loopback port matches. |
| `https://localhost` | Allowed. Matching is on host, not scheme-plus-port. |
| A host merely *containing* "localhost" (`localhost.evil.com`) | **Rejected.** The check parses the URL and compares `hostname` exactly; it never does a substring test. This is the single likeliest way to get the allowlist wrong. |

## Open questions

**None.**

## Implementation

### Step 1 — Carry the origin through the round trip
- Migration `supabase/migrations/<ts>_oauth_return_origin.sql`: `alter table ... add column if not
  exists return_origin text;`. Additive and nullable, so it is safe to apply to the live project
  ahead of the functions.
- `supabase/functions/_shared/oauthOrigin.ts`: the allowlist predicate, as one pure function with
  no imports and no `Deno.` globals, so Jest can import it directly rather than asserting against
  its source text the way `__tests__/deleteAccount.test.ts` has to.
- `mal-oauth-start`: read `req.headers.get('Origin')`, run it through the predicate, store the
  result.
- `mal-oauth-callback`: select `return_origin`, and pass it to `webFinish`.
- Tests (`__tests__/oauthOrigin.test.ts`), figures derived from the rules above and not from what
  the function returns: `SITE_URL` itself allowed; `http://localhost:8081` and
  `http://127.0.0.1:19006` allowed; `https://localhost` allowed; `http://localhost.evil.com`
  **rejected**; `https://evil.com` rejected; a malformed string rejected; an absent header
  rejected.
- Both steps ship together: the column is inert without the functions, and the functions read null
  without the column.
- **Check:** with the dev server running, press "Continue with MyAnimeList". The popup should close
  and leave you signed in on `localhost`, not on the deployed site. Then confirm the deployed site
  still signs in. Failure: the popup closing with nothing happening (today's bug), landing on the
  deployed origin from dev, or the deployed site breaking.
