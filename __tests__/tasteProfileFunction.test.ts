// Reads the taste-profile Edge Function's source, the same way __tests__/deleteAccount.test.ts and
// __tests__/detailFields.test.ts read theirs, and for the same reason: what matters about this
// function can't be reached from Jest any other way. It calls a third party and talks to a real
// Postgres, and this repo has no harness for either (Jest covers pure src/domain/ logic; a local
// Supabase needs Docker, which isn't running on the dev machine).
//
// What it catches is specifically the regression that would be silent. The PRD's whole compliance
// position — its reading of MAL agreement §3(a)(vii) — rests on one fact: no MAL API response ever
// reaches the model. The database sits between them. A later change that imported a MAL helper into
// this function to "enrich the prompt" would quietly dissolve that argument, and nothing else in
// the build would notice. The function's header comment says not to; a comment does not fail a
// build.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'taste-profile', 'index.ts'), 'utf8');

describe('taste-profile Edge Function', () => {
  test('never reaches MyAnimeList', () => {
    // The MAL helpers and the API host are the only ways this function could obtain a MAL
    // response at all, so their absence is the assertion. This is the one the compliance position
    // depends on.
    expect(source).not.toContain('malAuth');
    expect(source).not.toContain('malProxy');
    expect(source).not.toContain('api.myanimelist.net');
  });

  test('re-checks privacy consent server-side', () => {
    // buildTastePayload already refuses client-side, but that gate is a promise and this is the
    // thing holding the key. Either one failing alone must not be able to send a library.
    expect(source).toContain('privacy_consented_at');
  });

  test('requires a signed-in caller', () => {
    // Without this, the consent check has no account to check against and the key is open to the
    // anon key, which every client bundle carries.
    expect(source).toContain('getRequestUserId');
  });

  test('reads the provider key from the environment, never a literal', () => {
    // Guardrail #1's rule, applied to the second provider key the app has: an Edge Function
    // secret, never a committed constant and never an EXPO_PUBLIC_ var.
    expect(source).toContain("Deno.env.get('GROQ_API_KEY')");
    expect(source).not.toMatch(/gsk_[A-Za-z0-9]/);
  });

  test('does not write the taste_profiles row', () => {
    // The client upserts it under its own RLS, so the profile and the fingerprint it came from are
    // written together by the one party that knows both — see TasteProfileRepository. A write from
    // here would be a row with no fingerprint, i.e. permanently stale.
    //
    // Asserted as the table access rather than the bare name, unlike delete-account's api_cache
    // assertion: that function's source genuinely never names the table, whereas this one's header
    // comment names taste_profiles on purpose, to say it isn't the writer. A substring check would
    // be satisfied by deleting that sentence.
    expect(source).not.toContain("from('taste_profiles')");
  });
});
