// Which origins a web MAL OAuth flow is allowed to finish on — plan 8 / prd/4-dev-oauth-origin.md.
//
// Deliberately free of imports and of `Deno.` globals, so the one piece of this with real decision
// logic can be imported and tested directly by Jest (__tests__/oauthOrigin.test.ts) instead of
// having its source text asserted against the way __tests__/deleteAccount.test.ts is forced to.
// SITE_URL is a parameter rather than an env read for the same reason.

/**
 * Normalises and allowlists the `Origin` header of a mal-oauth-start request, returning the origin
 * to store on the session row, or null to mean "fall back to SITE_URL" (today's behaviour).
 *
 * Two entries, and it must never become a wildcard, because what a flow ultimately redirects to
 * this origin carrying is a one-time code exchangeable for a Supabase session:
 *
 *  - SITE_URL itself — the deployed site, the production answer.
 *  - Loopback — any port, because Expo's web dev server does not reliably pick one, and pinning a
 *    port would only move the silent failure this exists to fix.
 *
 * The Origin header is attacker-controllable by any non-browser client, so this allowlist is the
 * entire control; the header's provenance is worth nothing. Loopback survives that scrutiny only
 * because a loopback redirect resolves on whichever machine follows it — a spoofed
 * `Origin: http://localhost:8081` sends the code to the victim's own machine, not the attacker's.
 * That argument does not extend to any routable host, so adding one here would be a genuine open
 * redirect and needs its own analysis first.
 */
export function resolveReturnOrigin(originHeader: string | null | undefined, siteUrl: string | null | undefined): string | null {
  if (!originHeader) return null;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    // Not a URL at all — a header someone made up. Fall back rather than fail the sign-in: the
    // caller still gets a working flow, it just doesn't return to them.
    return null;
  }

  // Exact hostname comparison on the *parsed* URL, never a substring test on the raw header. A
  // substring test is the obvious way to write this and it accepts `localhost.evil.com`, which is
  // a routable host the whole argument above explicitly does not cover.
  if (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') return origin.origin;

  if (siteUrl) {
    try {
      if (new URL(siteUrl).origin === origin.origin) return origin.origin;
    } catch {
      // A malformed SITE_URL secret shouldn't decide anything; fall through to the rejection.
    }
  }

  return null;
}
