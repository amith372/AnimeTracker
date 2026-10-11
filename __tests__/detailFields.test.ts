// The reference above is what lets this one file use `fs`, `path` and `__dirname`: tsconfig's
// `types` is ["jest"] (Expo's default), so Node's globals aren't in scope by default. Kept
// file-scoped rather than added to tsconfig, since no other file in the app wants them.
/// <reference types="node" />
// Not a domain test, unlike the rest of this directory — it reads the source files themselves.
//
// It exists because two pairs of constants have to agree across files that nothing links together,
// and both failures are silent for a full 30-day cache TTL (CLAUDE.md's api_cache rules):
//
//   1. `mal-anime-detail` and `mal-import` must request byte-identical `fields`. They deliberately
//      share one api_cache key space so an import warms Discover/Recommendations and vice versa,
//      which is only sound if a row written by either is complete for the other. Diverge them and
//      one side silently reads the other's rows with fields missing — reading as `undefined`, not
//      as an error.
//   2. The client's `DETAIL_CACHE_VERSION` and the Edge Functions' must match, for the same reason
//      and with the same symptom.
//
// A comment in each file already says all of this. Comments don't fail a build.
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

/** Pulls a single-quoted `const NAME = '...'` value out of a source file. */
function constant(source: string, name: string): string {
  const match = source.match(new RegExp(`const ${name} = '([^']*)'`));
  if (match === null) throw new Error(`${name} not found — was it renamed?`);
  return match[1];
}

describe('the constants two files have to agree on', () => {
  test("mal-anime-detail and mal-import request byte-identical fields", () => {
    const detail = constant(read('supabase/functions/mal-anime-detail/index.ts'), 'DETAIL_FIELDS');
    const importer = constant(read('supabase/functions/mal-import/index.ts'), 'DETAIL_FIELDS');
    expect(importer).toBe(detail);
  });

  test('the client and server detail cache versions match', () => {
    const client = constant(read('src/repositories/apiCache.ts'), 'DETAIL_CACHE_VERSION');
    const server = constant(read('supabase/functions/_shared/apiCache.ts'), 'DETAIL_CACHE_VERSION');
    expect(server).toBe(client);
  });

  test('every field the taste profile and the obscurity signal need is actually requested', () => {
    // Asserting the fields by name, not just that the two lists agree: they could agree perfectly
    // and still be missing what the ranking reads, which is the other half of the same silent
    // failure. `start_season` is era's input and predates this step; the other three are plan 1
    // step 5's.
    const fields = constant(read('supabase/functions/mal-anime-detail/index.ts'), 'DETAIL_FIELDS').split(',');
    for (const field of ['genres', 'start_season', 'studios', 'source', 'num_list_users']) {
      expect(fields).toContain(field);
    }
  });
});
