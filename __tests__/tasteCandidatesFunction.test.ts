// Reads the taste-candidates Edge Function's source, the same way __tests__/tasteProfileFunction.
// test.ts, __tests__/deleteAccount.test.ts and __tests__/detailFields.test.ts read theirs, and for
// the same reason: what matters about this function can't be reached from Jest any other way. It
// calls a third party and talks to a real Postgres, and this repo has no harness for either (Jest
// covers pure src/domain/ logic; a local Supabase needs Docker, which isn't running on the dev
// machine).
//
// What it catches is the set of regressions that would otherwise be silent. The PRD's compliance
// position rests on one fact — no MAL API response reaches the model — and this is the second
// function that could break it. The daily ceiling is the only thing between a key this function
// holds and a client calling it in a loop with the anon key every bundle carries; a ceiling that
// gets removed, or moved after the model call, still passes every other test in this repo. The
// function's header comment says not to do any of this; a comment does not fail a build.
/// <reference types="node" />
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, '..', 'supabase', 'functions', 'taste-candidates', 'index.ts'), 'utf8');

describe('taste-candidates Edge Function', () => {
  test('never reaches MyAnimeList', () => {
    // The MAL helpers and the API host are the only ways this function could obtain a MAL response
    // at all, so their absence is the assertion. The suggested titles are searched on MAL by the
    // client, after the model has already answered — which is what keeps the API and the model
    // unconnected, with our own database between them.
    expect(source).not.toContain('malAuth');
    expect(source).not.toContain('malProxy');
    expect(source).not.toContain('api.myanimelist.net');
  });

  test('re-checks privacy consent server-side', () => {
    // buildGeneratorPayload already refuses client-side, but that gate is a promise and this is
    // the thing holding the key. Either one failing alone must not be able to send a library.
    expect(source).toContain('privacy_consented_at');
  });

  test('requires a signed-in caller', () => {
    // Without this there is no account to check consent against and no account to charge the daily
    // ceiling to — the key would be open to the anon key itself.
    expect(source).toContain('getRequestUserId');
  });

  test('spends a daily quota, and spends it before the model call', () => {
    // Order is the assertion, not just presence. A ceiling checked after the provider call does
    // not bound anything in the case it exists for: a failing provider is exactly when a client
    // retries in a loop.
    expect(source).toContain('model_call_consume');
    expect(source.indexOf('model_call_consume')).toBeLessThan(source.indexOf('GROQ_URL,'));
  });

  test('reads the provider key from the environment, never a literal', () => {
    // Guardrail #1's rule, applied to the second place the Groq key is used: an Edge Function
    // secret, never a committed constant and never an EXPO_PUBLIC_ var.
    expect(source).toContain("Deno.env.get('GROQ_API_KEY')");
    expect(source).not.toMatch(/gsk_[A-Za-z0-9]/);
  });

  test('decides nothing about which suggestions are used', () => {
    // The resolution gate, the obscurity ceiling and the exclusions are all src/domain/
    // candidateGenerator.ts's, called client-side (CLAUDE.md's Edge Function convention). A copy
    // of any of them here would be a second place to fix when the threshold moves, and the kind
    // of duplication that quietly diverges.
    expect(source).not.toContain('TITLE_MATCH_THRESHOLD');
    expect(source).not.toContain('num_list_users');
    expect(source).not.toContain('titleSimilarity');
  });

  test('does not read or write the library tables', () => {
    // It is handed the titles it needs in the request body. Reading the library here would mean
    // the client and the server could disagree about what was excluded, and would make the
    // function a second home for the question of what counts as tracked.
    expect(source).not.toContain("from('series')");
    expect(source).not.toContain("from('taste_profiles')");
  });
});
