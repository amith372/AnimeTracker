// "Delete everything" — plan 1 step 5½. Removes every row this app holds for the calling account,
// then the account itself. Runs as service_role because deleting an auth.users record is an admin
// operation no client JWT can perform, and because the token table (mal_accounts) is deny-all to
// every client role by design (guardrail #2).
//
// Deliberately NOT a MAL proxy, unlike every other function here: it never calls MAL at all. The
// user's list on MyAnimeList is theirs and is left exactly as it is — forgetting our copy of
// someone's data is not permission to edit their data somewhere else.
//
// The shared MAL response cache is also left alone. It holds no user data (just a mirror of MAL's
// public catalogue), it is shared by every account including guests, and one account's deletion
// must never wipe a cache everyone else is warming — the same rule that got clearApiCache deleted
// client-side. That table's name appears nowhere in this file on purpose, so
// __tests__/deleteAccount.test.ts can assert its absence rather than trusting this paragraph.
//
// Order matters: the auth.users row goes first.
//
// Every per-user table below has `on delete cascade` on its user_id FK, so deleting the auth user
// is already what removes the data. Doing that first means the only failure mode is "nothing was
// deleted, retry" — whereas sweeping the rows first and then failing to delete the user would
// leave an orphaned login that signs in to an empty library, which is precisely the failure the
// step's check looks for. The explicit sweep that follows is the belt to that braces: it is a
// no-op today, and it is what still deletes the rows if a per-user table is ever added without a
// cascading FK (or with none at all).
import { supabaseAdmin, getRequestUserId } from '../_shared/supabaseAdmin.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

// Every table keyed to one account. series_entries is listed even though it cascades from series,
// for the same reason the whole sweep exists: it must not depend on another table's FK being
// configured the way it is today. A table from a plan step that hasn't been migrated onto this
// project yet is a no-op rather than a failure — see isMissingTable below.
//
// model_call_quota (plan 1 step 7) holds nothing but a per-day counter, which is not data anyone
// would think of as theirs. It is swept anyway, because the question this list answers is "does
// this account leave anything behind", and a row keyed to a deleted account's id is something
// left behind whatever it contains.
const OWNED_TABLES = [
  'series_entries',
  'series',
  'user_library_meta',
  'mal_accounts',
  'taste_profiles',
  'model_call_quota',
  'recommendation_lists',
  // Plan 4 step 1's public share link. The one row in this list whose survival would be visible
  // from outside the app: a live URL serving a deleted account's library, with nobody left who
  // could revoke it. The `on delete cascade` is what actually removes it (the auth.users row goes
  // first, above), and this is the belt to that braces.
  'shared_libraries',
] as const;

/**
 * Whether a Postgres/PostgREST error means "that table isn't there" rather than "the delete
 * failed". taste_profiles arrives with step 6, and until then a sweep over it would otherwise turn
 * a successful deletion into a 500. PostgREST answers an unknown relation with PGRST205 (not in
 * the schema cache); 42P01 is Postgres' own undefined_table, in case it reaches us raw.
 */
function isMissingTable(error: { code?: string | null } | null): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return jsonResponse({ error: 'Not signed in.' }, 401);

    // Deleting the auth user cascades every table below. A guest (anonymous session) is a real
    // auth.users row too, so this works unchanged for one — nothing here special-cases them.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) return jsonResponse({ error: `Couldn’t delete the account: ${authError.message}` }, 500);

    // The sweep. Best-effort per table and reported rather than thrown: the account is already
    // gone by now, so failing the whole request would tell the user nothing was deleted when in
    // fact everything was. Anything left behind is named in the response so it's visible at all.
    const remaining: string[] = [];
    for (const table of OWNED_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
      if (error && !isMissingTable(error)) remaining.push(table);
    }

    return jsonResponse({ deleted: true, remaining });
  } catch (e) {
    return jsonResponse({ error: `delete-account failed: ${describeError(e)}` }, 500);
  }
});
