// Plan 7's allowlist — the one piece of prd/4-dev-oauth-origin.md with a decision in it.
//
// Unlike __tests__/deleteAccount.test.ts, this imports the Edge Function module directly rather
// than reading its source: supabase/functions/_shared/oauthOrigin.ts is written with no imports and
// no `Deno.` globals precisely so it can be tested as the pure function it is.
//
// Every expectation below is derived from the PRD's two allowlist rules, not from running the
// implementation: SITE_URL and loopback are allowed, everything else falls back to null.
import { resolveReturnOrigin } from '../supabase/functions/_shared/oauthOrigin';

const SITE_URL = 'https://animetracker-btpk.onrender.com';

describe('resolveReturnOrigin', () => {
  describe('allows', () => {
    it('the deployed site itself', () => {
      expect(resolveReturnOrigin(SITE_URL, SITE_URL)).toBe(SITE_URL);
    });

    it('localhost on the Expo web default port', () => {
      expect(resolveReturnOrigin('http://localhost:8081', SITE_URL)).toBe('http://localhost:8081');
    });

    // Any port, not a pinned one: Expo's dev server does not reliably pick 8081, and a pinned port
    // would reproduce the exact silent failure this feature exists to remove.
    it('loopback by IP, on a different port', () => {
      expect(resolveReturnOrigin('http://127.0.0.1:19006', SITE_URL)).toBe('http://127.0.0.1:19006');
    });

    it('https loopback — the rule is the host, not the scheme', () => {
      expect(resolveReturnOrigin('https://localhost', SITE_URL)).toBe('https://localhost');
    });
  });

  describe('rejects', () => {
    // The whole reason the implementation parses the URL instead of testing for a substring.
    // `localhost.evil.com` is a routable host the PRD's loopback argument explicitly does not
    // cover, and a naive `includes('localhost')` would hand it a session handoff code.
    it('a routable host that merely contains "localhost"', () => {
      expect(resolveReturnOrigin('http://localhost.evil.com', SITE_URL)).toBeNull();
    });

    it('an unrelated origin', () => {
      expect(resolveReturnOrigin('https://evil.com', SITE_URL)).toBeNull();
    });

    // A subdomain of the deployed site is not the deployed site: origins compare whole.
    it('a subdomain of the deployed site', () => {
      expect(resolveReturnOrigin('https://evil.animetracker-btpk.onrender.com', SITE_URL)).toBeNull();
    });

    // Same host and scheme, different port — still a different origin, and the browser agrees.
    it('the deployed host on another port', () => {
      expect(resolveReturnOrigin('https://animetracker-btpk.onrender.com:8443', SITE_URL)).toBeNull();
    });

    it('a header that is not a URL', () => {
      expect(resolveReturnOrigin('not-a-url', SITE_URL)).toBeNull();
    });

    it('an absent header — native, or a client that sends none', () => {
      expect(resolveReturnOrigin(null, SITE_URL)).toBeNull();
      expect(resolveReturnOrigin(undefined, SITE_URL)).toBeNull();
      expect(resolveReturnOrigin('', SITE_URL)).toBeNull();
    });
  });

  describe('when SITE_URL is unusable', () => {
    // A missing or malformed secret must not decide anything, and must not take loopback down with
    // it — a dev server is exactly where a half-configured project gets worked on.
    it('still allows loopback', () => {
      expect(resolveReturnOrigin('http://localhost:8081', undefined)).toBe('http://localhost:8081');
      expect(resolveReturnOrigin('http://localhost:8081', 'not-a-url')).toBe('http://localhost:8081');
    });

    it('rejects everything else', () => {
      expect(resolveReturnOrigin('https://evil.com', undefined)).toBeNull();
      expect(resolveReturnOrigin(SITE_URL, 'not-a-url')).toBeNull();
    });
  });
});
