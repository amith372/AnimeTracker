// Reads the shared-library Edge Function's source, the way the three existing function tests do
// (deleteAccount, tasteProfileFunction, tasteCandidatesFunction), and for the same reason: it is a
// service_role function against a real Postgres, and this repo has no harness for one — Jest covers
// pure src/domain/ logic, and a local Supabase needs Docker, which isn't running on the dev
// machine.
//
// What it catches is the class of regression a manual check cannot. The step's own check (curl the
// slug, read the JSON, revoke, curl again) proves what the function returns *today*, for one
// library. It cannot prove that a column added to `series` next month won't start appearing on a
// public page, or that someone won't reach for `taste_profiles` here to "show what they're into".
// Both are silent, both are one line, and both are exactly what this file refuses.
//
// Every assertion below maps to a line in prd/2-public-share.md's Constraints section.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'shared-library', 'index.ts'), 'utf8');

describe('shared-library Edge Function', () => {
  test('resolves the slug before reading any library table', () => {
    // The whole of the access control. RLS is bypassed here (service_role), so "there is a
    // shared_libraries row for this slug" is what stands in for the policy — and the owner's id
    // must come from that row rather than from anything the caller sent. Asserted as an ordering,
    // because a lookup that happened *after* the library read would be a check on a read that had
    // already happened.
    const slugLookup = source.indexOf("from('shared_libraries')");
    const libraryRead = source.indexOf("from('series')");
    expect(slugLookup).toBeGreaterThan(-1);
    expect(libraryRead).toBeGreaterThan(-1);
    expect(slugLookup).toBeLessThan(libraryRead);
  });

  test('takes no caller identity', () => {
    // There is deliberately no signed-in user here: the caller is a stranger with no account, and
    // an id they could supply would be an id they could change. getRequestUserId appearing in this
    // file would mean the function had grown a second way to decide whose library to return.
    expect(source).not.toContain('getRequestUserId');
  });

  test('scopes the library read to the slug owner', () => {
    // Without the filter, a service_role select returns every account's rows — the single worst
    // failure this feature could have, and one that would look perfectly fine in a check run
    // against an account that is the only one sharing.
    expect(source).toContain("eq('user_id', share.user_id)");
  });

  test('never selects *', () => {
    // A whitelist is what stops a column added later from flowing onto a public page by default.
    expect(source).not.toContain("select('*')");
    expect(source).not.toContain('select("*")');
  });

  test('emits no identifiers of any kind', () => {
    // The response is built field by field, and none of those fields is an id. `user_id` is read
    // (to scope the query) and never returned; row ids and MAL ids are never even selected, which
    // is why the embed is used instead of two selects joined on `series_id`.
    const responseShape = source.slice(source.indexOf('const series = '));
    expect(responseShape).not.toMatch(/\bid:/);
    expect(responseShape).not.toMatch(/malId|mal_id/);
    expect(responseShape).not.toMatch(/userId|user_id/);
  });

  test('never reads the tables that have no business here', () => {
    // taste_profiles is a description of the reader and the most personal thing the app stores;
    // mal_accounts holds live MAL tokens (guardrail #2); user_library_meta holds consent
    // timestamps. The PRD puts all three out of scope explicitly, and sharing the taste profile is
    // listed as a never.
    expect(source).not.toContain('taste_profiles');
    expect(source).not.toContain('mal_accounts');
    expect(source).not.toContain('user_library_meta');
    expect(source).not.toContain('recommendation_lists');
  });

  test('never reaches MyAnimeList', () => {
    // Sharing adds a reader over our own Postgres; it is not a new MAL data flow. The MAL helpers
    // and the API host are the only ways this function could become one.
    expect(source).not.toContain('malAuth');
    expect(source).not.toContain('malProxy');
    expect(source).not.toContain('api.myanimelist.net');
  });

  test('derives no status, leaving that to src/domain/', () => {
    // A label computed here would be a second implementation of the app's trickiest logic, free to
    // disagree with the one the owner sees — success criterion 5. The function returns
    // `manual_status` and the entries; the page runs the real thing.
    expect(source).toContain('manual_status');
    expect(source).not.toContain('deriveSeriesStatus');
    expect(source).not.toContain('statusLabel');
    expect(source).not.toContain('WATCHED_PARTIAL');
  });

  test('answers an unknown slug the same way as a malformed one', () => {
    // Two 404s with the same sentence. Telling a stranger which slugs were once real is a small
    // enumeration gift for no benefit, and the PRD's edge case asks for a plain "this list isn't
    // being shared" rather than an error screen either way.
    const notShared = source.match(/This list isn’t being shared\./g) ?? [];
    expect(notShared).toHaveLength(2);
    expect(source).toContain('404');
  });

  test('filters out soft-deleted rows, like the app does', () => {
    // Hard deletes today, so this is belt rather than braces — but the page and the Library must
    // never disagree about what is in the library, and the failure if soft deletes return is a
    // deleted show reappearing on a public page.
    expect(source).toContain("is('deleted_at', null)");
    expect(source).toContain('entry.deleted_at === null');
  });

  test('returns only the name the sharer typed', () => {
    // The one thing about a person in the whole response, and they wrote it for this page.
    expect(source).toContain('display_name');
    // Everything else the app knows about them — the address they signed up with, the name on
    // their MyAnimeList account — lives on the auth record, so never touching that record is what
    // makes "no personal information reaches the page" structural rather than a promise. §4(f) is
    // about people rather than shows, and this is the line that keeps it true.
    expect(source).not.toMatch(/auth\.(users|admin)/);
    expect(source).not.toContain('getUser');
    expect(source).not.toContain('mal_username');
  });
});
