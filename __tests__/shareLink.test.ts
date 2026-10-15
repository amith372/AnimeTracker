// src/domain/shareLink.ts — the share link's pure parts (plan 4 step 1 / prd/2-public-share.md).
//
// Every figure below is derived from the input on paper, not read off what the implementation
// returned: the URLs are written out by hand, and the 60-character cases are counted with
// 'a'.repeat() so the expectation is arithmetic rather than a pasted string.
import { buildShareUrl, normalizeShareName, MAX_SHARE_NAME_LENGTH, SHARE_PATH_PREFIX } from '@/domain/shareLink';

describe('buildShareUrl', () => {
  test('joins the origin and the slug under /s/', () => {
    expect(buildShareUrl('https://animetracker.example', 'abc123')).toBe('https://animetracker.example/s/abc123');
  });

  test("strips the origin's trailing slash rather than doubling it", () => {
    // A hand-configured EXPO_PUBLIC_SITE_URL frequently ends in a slash, and some static hosts
    // answer `//s/abc` with a 404 instead of normalizing it — which would be a link that copies
    // cleanly and fails only once the recipient opens it.
    expect(buildShareUrl('https://animetracker.example/', 'abc123')).toBe('https://animetracker.example/s/abc123');
    expect(buildShareUrl('https://animetracker.example///', 'abc123')).toBe('https://animetracker.example/s/abc123');
  });

  test('keeps a port and a path prefix, since a dev server has both', () => {
    // `expo start --web` serves on localhost:8081, which is the origin the screen falls back to
    // when no site URL is configured — so this is the shape the step's own check produces.
    expect(buildShareUrl('http://localhost:8081', 'abc123')).toBe('http://localhost:8081/s/abc123');
  });

  test('is null when there is no origin, instead of a relative link', () => {
    // A native build with no EXPO_PUBLIC_SITE_URL has no origin at all. '/s/abc123' would look
    // copyable and be useless in the chat it was pasted into, so the screen needs to be able to
    // tell the difference and say so.
    expect(buildShareUrl(null, 'abc123')).toBeNull();
    expect(buildShareUrl(undefined, 'abc123')).toBeNull();
    expect(buildShareUrl('   ', 'abc123')).toBeNull();
  });

  test('is null for an empty slug', () => {
    // Guards the one genuinely dangerous output: 'https://animetracker.example/s/' is the share
    // route with no slug, which is a URL that looks real and identifies nobody's list.
    expect(buildShareUrl('https://animetracker.example', '')).toBeNull();
    expect(buildShareUrl('https://animetracker.example', '  ')).toBeNull();
  });

  test('the route prefix is the one the viewer page is built at', () => {
    // If this ever changes, app/s/[slug].tsx and the robots.txt disallow (step 3) move with it.
    expect(SHARE_PATH_PREFIX).toBe('/s/');
  });
});

describe('normalizeShareName', () => {
  test('trims', () => {
    expect(normalizeShareName('  Amith  ')).toBe('Amith');
  });

  test('collapses blank input to null, which is the "no nickname" value', () => {
    // Postgres rejects '' outright (its length check is `between 1 and 60`), and a stored '' would
    // publish a heading that renders as nothing — the page needs null to reach for its neutral
    // "A shared anime list" instead.
    expect(normalizeShareName('')).toBeNull();
    expect(normalizeShareName('   ')).toBeNull();
    expect(normalizeShareName('\n\t ')).toBeNull();
    expect(normalizeShareName(null)).toBeNull();
    expect(normalizeShareName(undefined)).toBeNull();
  });

  test('caps at the length Postgres accepts', () => {
    // 60 is the column's check constraint. A name one character over must come back at exactly 60
    // rather than reaching Postgres and failing the write — the cap is on the TextInput too, but
    // this is the one a future caller can't skip.
    const sixtyOne = 'a'.repeat(MAX_SHARE_NAME_LENGTH + 1);
    const capped = normalizeShareName(sixtyOne);
    expect(capped).toHaveLength(MAX_SHARE_NAME_LENGTH);
    expect(capped).toBe('a'.repeat(60));
  });

  test('leaves a name of exactly the cap alone', () => {
    const sixty = 'b'.repeat(MAX_SHARE_NAME_LENGTH);
    expect(normalizeShareName(sixty)).toBe(sixty);
  });

  test('trims before capping, not after', () => {
    // 58 characters wrapped in spaces is 60 of input and 58 of name. Capping first would keep a
    // leading space and lose the last two characters of what was typed.
    const name = 'c'.repeat(58);
    expect(normalizeShareName(` ${name} `)).toBe(name);
  });

  test('keeps the text as typed, markup and all', () => {
    // Deliberate, and the reason the PRD calls the nickname untrusted-but-safe: it is rendered
    // through React Native's <Text>, which cannot interpret markup, so there is no injection
    // surface to sanitize for. Stripping characters here would instead mangle names that are
    // simply unusual, and would be a second half-escaping nobody maintains. If this name ever
    // reaches an HTML string (a meta tag, an OG preview), escaping belongs at that boundary.
    expect(normalizeShareName('<b>Amith</b> & co')).toBe('<b>Amith</b> & co');
  });
});
