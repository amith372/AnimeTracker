// Plan 5's "Edge Function error messages are unwrapped and then discarded".
//
// Two halves, and they only work together. isUserFacingEdgeStatus() decides which of our Edge
// Functions' `{error}` bodies a screen may show verbatim, and it decides it from the HTTP status
// alone — which is only sound while the functions keep their side of the convention: a branch that
// worded its own sentence returns a deliberate status, and the handler's catch-all (the one that
// interpolates describeError(e) or a raw PostgrestError message) returns 500 and nothing else.
// So the second describe block reads the function sources, the same way
// __tests__/tasteProfileFunction.test.ts and __tests__/deleteAccount.test.ts read theirs: a
// developer string returned at 403 would otherwise land in a Snackbar and no test would notice.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { isUserFacingEdgeStatus, UserFacingError, userFacingMessage } from '@/repositories/errorMessage';

const functionsDir = join(__dirname, '..', 'supabase', 'functions');

/** Every deployed function's source, keyed by directory name — `_shared` holds no handler, and
 * the directory also contains loose files (deno.json) that are not functions at all. */
function functionSources(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(functionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    out[entry.name] = readFileSync(join(functionsDir, entry.name, 'index.ts'), 'utf8');
  }
  return out;
}

describe('isUserFacingEdgeStatus', () => {
  // Each figure is the status one of our own branches actually returns, read off the function
  // source rather than off the implementation: 403 is mal-import's "MyAnimeList is not linked",
  // 429 is taste-candidates' daily limit, 503 is "no model key is configured", 502 is "The model
  // returned no profile", 400 is "This login link has expired", 401 is "Not signed in."
  test.each([400, 401, 403, 429, 502, 503])('shows a deliberate %i', (status) => {
    expect(isUserFacingEdgeStatus(status)).toBe(true);
  });

  test('hides a catch-all 500', () => {
    // The only status our handlers' catch blocks use, and the only one whose body is developer
    // text. This single case is the whole reason the function exists.
    expect(isUserFacingEdgeStatus(500)).toBe(false);
  });

  test('hides anything with no status at all', () => {
    // No `context` on the error (a transport failure rather than a response) means no body was
    // unwrapped either, so there is nothing to show.
    expect(isUserFacingEdgeStatus(undefined)).toBe(false);
  });

  test('hides a 2xx or 3xx', () => {
    // Not a shape our functions produce; guarding it keeps the rule "a failure we worded",
    // not "any response carrying an error field".
    expect(isUserFacingEdgeStatus(200)).toBe(false);
    expect(isUserFacingEdgeStatus(302)).toBe(false);
  });
});

describe('userFacingMessage with an Edge Function error', () => {
  test('shows the function sentence a UserFacingError carries', () => {
    const e = new UserFacingError('MyAnimeList is not linked to this account.');
    expect(userFacingMessage(e, 'Couldn’t import your list.')).toBe('MyAnimeList is not linked to this account.');
  });

  test('still replaces a plain Error with the caller’s fallback', () => {
    // The 500 path: the string is `taste-profile failed: ${describeError(e)}` and must not render.
    const e = new Error('taste-profile failed: permission denied for table user_library_meta (42501)');
    expect(userFacingMessage(e, 'Couldn’t describe your taste just now.')).toBe('Couldn’t describe your taste just now.');
  });
});

describe('the Edge Functions’ half of the convention', () => {
  test('every error body holding developer text is returned at 500', () => {
    // describeError(e) is the catch-all's own helper and `.message}` is how a PostgrestError's
    // wording gets interpolated — the two ways a branch can carry text written for a developer.
    // Either one at a status other than 500 would now be shown to the user verbatim.
    const offenders: string[] = [];
    for (const [name, source] of Object.entries(functionSources())) {
      source.split('\n').forEach((line, i) => {
        if (!line.includes('jsonResponse(')) return;
        if (!line.includes('describeError(') && !line.includes('.message}')) return;
        const status = /,\s*(\d{3})\s*\)/.exec(line)?.[1];
        if (status !== '500') offenders.push(`${name}/index.ts:${i + 1} returns ${status ?? 'no status'}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  test('at least one function actually uses the catch-all, so the scan is not vacuous', () => {
    // A scan that matches nothing passes just as happily as one that matches only 500s.
    const matched = Object.values(functionSources()).filter((s) => s.includes('describeError(e)')).length;
    expect(matched).toBeGreaterThan(0);
  });

  test('neither model function returns the provider’s own body', () => {
    // Decided 2026-10-14: the status distinguishes the failures, the provider's JSON is logged
    // instead of shown. These sentences are now displayed verbatim, so this is a copy assertion
    // as much as a privacy-of-wording one.
    for (const name of ['taste-profile', 'taste-candidates']) {
      const source = readFileSync(join(functionsDir, name, 'index.ts'), 'utf8');
      expect(source).toContain('The model provider refused the request (${response.status}).`');
      expect(source).not.toContain('(${response.status}). ${detail}');
    }
  });
});
