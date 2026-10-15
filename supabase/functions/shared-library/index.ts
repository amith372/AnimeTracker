// The public read behind a share link — plan 4 step 2 / prd/2-public-share.md. A slug in, one
// account's library out, to a caller who has no account and never will.
//
// This is the only function in the app that reads a library it was not asked to read *by its
// owner*, so it is also the only one where the security argument has to be stated rather than
// inherited:
//
//  - **RLS on `series` and `series_entries` is unchanged and still owner-only.** Nothing was
//    opened to `anon`. This runs as service_role, which bypasses RLS entirely, and the thing
//    standing in for the policy is the slug lookup below: no `shared_libraries` row, no read. That
//    lookup happens *first* and its result is the only source of the user id used afterwards.
//    There is no caller-supplied id anywhere in this file, and no caller-identity helper either —
//    unlike every authenticated function here, a caller's identity is simply not an input.
//  - **`shared_libraries` is not readable by `anon` either**, so a stranger cannot enumerate who
//    is sharing; they can only present a slug and be told yes or no.
//  - **The response is a whitelist, built field by field**, never a star select — so a column
//    added to `series` later cannot start appearing on a public page because nobody remembered
//    this function reads it. In particular nothing here emits an account id, a row id or a MAL id.
//  - **It names no other table.** The taste profile describes the reader and is the most personal
//    thing the app stores; the MAL token table is deny-all by design (guardrail #2); the library
//    meta row holds consent timestamps. None of the three has any business in this code path, and
//    — as with the shared response cache in delete-account — **their table names appear nowhere in
//    this file on purpose**, so __tests__/sharedLibraryFunction.test.ts can assert their absence
//    rather than trusting this paragraph. The same goes for the name a sharer signed in to
//    MyAnimeList with, which lives on their auth record: this function never reads that record.
//  - **It never calls MyAnimeList.** Sharing adds a reader over our own Postgres; it is not a new
//    MAL data flow (the PRD's compliance position, §3(a)(ii)/§2(b)). The MAL helpers are not
//    imported and must not be.
//
// What it is *not* doing is as deliberate: it returns the entries and the manual status, and
// computes no status label. Deriving "Watched 3/5 seasons" here would be a second implementation
// of the trickiest logic in the app, free to disagree with the one the owner sees. The page runs
// the real src/domain/ code on this payload instead (CLAUDE.md's Edge Function convention), and
// the names of those functions are likewise kept out of this file so their absence is assertable.
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { describeError } from '../_shared/errors.ts';

// Exactly what a viewer's page renders, and nothing else. Entry titles are absent on purpose: the
// page shows series-level status (the PRD's One Piece edge case settled that arc and season detail
// are not published), so a season's own name is data with no reader. `deleted_at` is selected on
// the child only so the filter below can use it — it is dropped in the mapping, like every other
// column that isn't in the response shape.
//
// The embed is one round trip rather than the client's two selects. That matters more here than it
// does in the app: this is a cold page load for someone who has never seen this site, on a backend
// where every round trip is ~350ms, and there is no cache to hide it behind. It also means no row
// ids are ever selected — the two-select version needs `id`/`series_id` to group by, and this one
// structurally cannot leak what it never reads.
const LIBRARY_SELECT =
  'title, cover_url, genres, type, manual_status, ' +
  'series_entries(kind, order_index, episode_count, watch_state, airing_status, deleted_at)';

interface EntryRow {
  kind: string;
  order_index: number;
  episode_count: number;
  watch_state: string;
  airing_status: string;
  deleted_at: string | null;
}

interface SeriesRow {
  title: string;
  cover_url: string | null;
  genres: string[] | null;
  type: string;
  manual_status: string;
  series_entries: EntryRow[] | null;
}

/**
 * The slug, from a JSON body or the query string.
 *
 * Both, because the two callers are genuinely different: the page calls this through
 * `supabase.functions.invoke`, which always POSTs a JSON body, while a human checking the feature
 * (or anyone debugging a link that doesn't work) reaches for curl, where `?slug=` is the obvious
 * thing to type. Neither form is more trusted than the other — the slug is a lookup key, not a
 * credential, and what it is matched against is a table with one row per sharer.
 */
async function readSlug(req: Request): Promise<string | null> {
  const fromQuery = new URL(req.url).searchParams.get('slug');
  if (fromQuery) return fromQuery.trim();
  try {
    const body = await req.json();
    const slug = body?.slug;
    return typeof slug === 'string' && slug.trim() ? slug.trim() : null;
  } catch {
    // No body, or not JSON. That is a malformed request, not an error worth describing.
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  try {
    const slug = await readSlug(req);
    // The same answer as an unknown slug, on purpose. A viewer who mistypes a link and a viewer
    // holding a revoked one should see the same page, and distinguishing "malformed" from "no
    // such link" tells a stranger something about which slugs were once real.
    if (!slug) return jsonResponse({ error: 'This list isn’t being shared.' }, 404);

    // Resolve the slug first, and take the owner's id from this row and nowhere else. Everything
    // below is scoped to what this returns, which is the whole of the access control here.
    const { data: share, error: shareError } = await supabaseAdmin
      .from('shared_libraries')
      .select('user_id, display_name')
      .eq('slug', slug)
      .maybeSingle();
    if (shareError) return jsonResponse({ error: 'Couldn’t load this list.' }, 500);
    if (!share) return jsonResponse({ error: 'This list isn’t being shared.' }, 404);

    const { data, error } = await supabaseAdmin
      .from('series')
      .select(LIBRARY_SELECT)
      .eq('user_id', share.user_id)
      // Matching the app's own read (src/repositories/AnimeRepository.ts's fetchLibrary). Deletes
      // are hard deletes today and this column is always null, but the page and the Library must
      // never be able to disagree about what is in the library — and if soft deletes ever come
      // back, the failure without this line is a deleted show reappearing on a public page.
      .is('deleted_at', null)
      .order('title');
    if (error) return jsonResponse({ error: 'Couldn’t load this list.' }, 500);

    // Field by field, camelCase, matching src/domain/'s model rather than the column names — the
    // page is TypeScript and runs the app's real status derivation on this, so landing in the
    // shape it already speaks saves a mapping layer that would exist only to rename things.
    const rows = (data ?? []) as unknown as SeriesRow[];
    const series = rows.map((row) => ({
      title: row.title,
      coverUrl: row.cover_url,
      genres: row.genres ?? [],
      type: row.type,
      manualStatus: row.manual_status,
      entries: (row.series_entries ?? [])
        .filter((entry) => entry.deleted_at === null)
        // Sorted here rather than in the query: PostgREST's syntax for ordering an embedded
        // resource has changed name across supabase-js versions, and the whole list for one series
        // is a handful of rows. Order matters because the page numbers seasons by position.
        .sort((a, b) => a.order_index - b.order_index)
        .map((entry) => ({
          kind: entry.kind,
          orderIndex: entry.order_index,
          episodeCount: entry.episode_count,
          watchState: entry.watch_state,
          airingStatus: entry.airing_status,
        })),
    }));

    // `displayName` is the only thing about the sharer in the whole response, and it is a string
    // they typed for this purpose. Nothing identifying them travels with it — not the address they
    // signed up with, not the name on their MyAnimeList account, not their account id. §4(f) of
    // the MAL agreement is about people rather than shows, and this is the line where that is
    // enforced rather than described.
    return jsonResponse({ displayName: share.display_name ?? null, series });
  } catch (e) {
    return jsonResponse({ error: `shared-library failed: ${describeError(e)}` }, 500);
  }
});
