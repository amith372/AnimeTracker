// Not a domain test — it reads src/repositories/ShareRepository.ts's source, the way
// __tests__/deleteAccount.test.ts and __tests__/tasteProfileFunction.test.ts read a function's.
//
// Plan 4 step 1 has one property that matters more than anything else about the file and cannot be
// unit-tested the usual way: **the client never writes the slug**. The slug is a Postgres column
// default and `authenticated` holds no grant on that column
// (20261015010000_shared_libraries.sql), so a client that tried would get a permission error
// rather than a predictable link — but the error would surface as "couldn't start sharing", at
// which point the obvious-looking fix is to send a slug from the client. This test is what fails
// first instead.
//
// The behaviour that needs a real database — a revoke genuinely deleting the row, a re-share
// minting a different slug — is the step's user-run check. What lives here is the regression a
// manual check will never catch, because a client-generated slug would *work*.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'src', 'repositories', 'ShareRepository.ts'), 'utf8');

describe('ShareRepository', () => {
  test('writes exactly two payloads, and neither names the slug', () => {
    // Asserted as "these are the only writes" rather than "slug never appears", because `slug`
    // legitimately appears all over the file's *reads* and in the ShareLink type. Counting the
    // write call sites is what makes the claim precise: two of them, with payloads spelled out
    // here, so a third write — or a slug added to either of these two — fails this test rather
    // than shipping a predictable link.
    const writes = source.match(/\.(insert|upsert|update)\(/g) ?? [];
    expect(writes).toHaveLength(2);
    expect(source).toContain('.upsert({ user_id: userId }');
    expect(source).toContain('.update({ display_name: displayName })');
  });

  test('never generates randomness of its own', () => {
    // A client-side slug is the specific failure mode: Math.random is not unguessable, and
    // reaching for expo-crypto here would add a dependency to replace a column default that is
    // already 122 bits. If a future change needs any of these, the slug decision is being
    // re-opened and the PRD should be re-read first.
    expect(source).not.toContain('Math.random');
    expect(source).not.toContain('randomUUID');
    expect(source).not.toContain('expo-crypto');
  });

  test('builds the nickname and the slug through separate code paths', () => {
    // The nickname is user-typed and public; the slug is the secret half of the URL. A slug
    // derived from a name would be guessable by anyone who knows the name. normalizeShareName is
    // the only thing that touches the typed text, and it is imported from the domain rather than
    // reimplemented here.
    expect(source).toContain('normalizeShareName');
    expect(source).toContain("display_name: displayName");
  });

  test('scopes every read and write to the signed-in account', () => {
    // RLS already enforces this server-side; the client filter is what stops a bug from asking for
    // every row and getting one arbitrary one back under `maybeSingle`. Owner-only is the single
    // security-relevant line in the whole feature (PRD constraints), so it is asserted rather than
    // trusted.
    expect(source).toContain('.eq(\'user_id\', userId)');
    expect(source).toContain('requireUserId');
  });

  test('revoking deletes the row rather than hiding it', () => {
    // A flag column would leave the old slug reusable and would make "stop sharing" a promise the
    // database could not keep (§3(e)'s removal requirement, and the step's own check: re-sharing
    // must produce a *different* slug).
    expect(source).toMatch(/\.delete\(\)/);
    expect(source).not.toContain('revoked_at');
  });

  test('reads a whitelist of columns, never *', () => {
    // The same rule step 2's public function is held to, applied one level earlier: a column added
    // to shared_libraries later must not start flowing into the client because nobody remembered
    // this file reads it.
    expect(source).not.toContain("select('*')");
    expect(source).toContain('SHARE_COLUMNS');
  });

  test('never touches the tables that have no business here', () => {
    // taste_profiles describes the reader, mal_accounts holds live MAL tokens (guardrail #2), and
    // user_library_meta holds the consent timestamp. None of the three has any part in sharing a
    // list, and naming them here is how one of them ends up in a public response later.
    expect(source).not.toContain('taste_profiles');
    expect(source).not.toContain('mal_accounts');
    expect(source).not.toContain('user_library_meta');
  });

  test('never calls MyAnimeList', () => {
    // Sharing adds a reader over our own Postgres and no new MAL data flow at all (PRD's
    // compliance position). A MAL call from this file would be a new flow nobody reviewed.
    expect(source).not.toContain('edgeFunctions');
    expect(source).not.toContain('myanimelist');
  });
});
