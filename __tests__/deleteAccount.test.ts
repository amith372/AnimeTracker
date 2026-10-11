// Not a domain test, like __tests__/detailFields.test.ts — it reads an Edge Function's source.
//
// Plan 1 step 5½'s delete action is the one piece of this app whose correctness can't be covered
// the usual way: it is a service_role Edge Function against a real Postgres, and this repo has no
// harness for one (Jest covers pure src/domain/ logic; a local Supabase needs Docker, which isn't
// running on the dev machine). Standing up that machinery for one function was weighed and
// rejected, so the coverage splits: the behaviour that needs a real database — a second account's
// library surviving, the account actually disappearing — is the step's user-run check against the
// live project, and what lives here is the regression a manual check will never catch.
//
// What it catches: someone adds a per-user table later and forgets to delete it, or wires the
// shared MAL response cache into the delete by mistake. Both are silent. The function's header
// comment says not to do either; comments don't fail a build.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'delete-account', 'index.ts'), 'utf8');

describe('delete-account', () => {
  // Every table holding rows owned by one account. Asserted as `from('<table>')`/a quoted list
  // entry rather than a bare substring, so `series` can't be satisfied by `series_entries`
  // happening to contain it.
  const ownedTables = ['series', 'series_entries', 'user_library_meta', 'mal_accounts', 'taste_profiles'];

  test.each(ownedTables)('deletes %s', (table) => {
    expect(source).toContain(`'${table}'`);
  });

  test('never touches the shared MAL response cache', () => {
    // The table everyone shares, including guests: a mirror of MAL's public catalogue, holding
    // nothing about any user. One account's deletion wiping it would cost every other account its
    // warm cache and MAL the refetches — the same reasoning that removed clearApiCache from the
    // client (CLAUDE.md's api_cache conventions). The function's source doesn't name it at all,
    // which is what makes this assertion possible.
    expect(source).not.toContain('api_cache');
  });

  test('deletes the auth.users record itself, not only the rows', () => {
    // Without this the account survives its own deletion: signing in again lands on an empty
    // library with no way to tell it apart from a fresh account. It is also what cascades every
    // table above, which is why it runs first — see the function's header comment.
    expect(source).toContain('auth.admin.deleteUser');
  });

  test('requires a signed-in caller', () => {
    // A service_role function with no caller check deletes whichever account id it is handed.
    expect(source).toContain('getRequestUserId');
  });

  test('never calls MyAnimeList', () => {
    // Forgetting our copy of someone's library is not permission to edit their list on MAL's own
    // site, and the confirmation dialog promises exactly that. The MAL helpers are the only way
    // this function could reach MAL at all, so their absence is the assertion.
    expect(source).not.toContain('malAuth');
    expect(source).not.toContain('malProxy');
    expect(source).not.toContain('myanimelist');
  });
});
