// Plan 1 step 7's gate, tested on paper. Every expected figure below is derived from the Dice
// definition — `2 x shared / (|a| + |b|)` over the two titles' distinct normalized words — and not
// one of them was read off what the implementation returned (CLAUDE.md's standing rule). The
// working is written out beside each case so a future change to normalizeTitle shows up here as a
// disagreement with arithmetic rather than as a number that quietly moved.
import {
  acceptableSuggestions,
  buildGeneratorPayload,
  isWithinObscurityCeiling,
  MAX_GENERATED_TITLES,
  MAX_LIST_USERS,
  normalizeTitle,
  pickTitleMatch,
  TITLE_MATCH_THRESHOLD,
  titleSimilarity,
} from '@/domain/candidateGenerator';
import type { Series } from '@/domain/series';
import type { TasteProfile } from '@/domain/tasteProfile';

const PROFILE: TasteProfile = {
  summary: 'You go for slow-burn character drama and bail on gag comedy.',
  seeksOut: ['slow-burn drama'],
  tolerates: ['shonen action'],
  avoids: ['gag comedy'],
};

/** A library row with only the fields the generator payload reads. */
function series(title: string): Series {
  return {
    id: `id-${title}`,
    title,
    coverUrl: null,
    genres: [],
    rootMalId: 1,
    type: 'SERIES',
    manualStatus: 'NONE',
    status: { kind: 'WATCHED' },
    entries: [],
    newSeasonAvailable: false,
  } as unknown as Series;
}

describe('normalizeTitle', () => {
  test('folds punctuation, case and accents to one spelling', () => {
    // The three ways MAL and a model disagree about the same name.
    expect(normalizeTitle('Steins;Gate')).toBe('steins gate');
    expect(normalizeTitle('FULLMETAL ALCHEMIST: Brotherhood')).toBe('fullmetal alchemist brotherhood');
    expect(normalizeTitle('Jūni Taisen')).toBe('juni taisen');
  });

  test('collapses runs of separators and trims', () => {
    expect(normalizeTitle('  Re:ZERO -Starting Life-  ')).toBe('re zero starting life');
  });

  test('is empty for a title with nothing to compare', () => {
    // Guards the cache key as much as the comparison: an empty key segment would make every
    // such suggestion share one cached resolution.
    expect(normalizeTitle('!!!')).toBe('');
  });
});

describe('titleSimilarity', () => {
  test('an exact match, once punctuation is folded, is 1', () => {
    // {steins, gate} against {steins, gate}: 2 x 2 / (2 + 2) = 1.
    expect(titleSimilarity('Steins;Gate', 'Steins Gate')).toBe(1);
  });

  test('a one-word title inside a longer one scores well under the threshold', () => {
    // {monster} against {monster, musume}: 2 x 1 / (1 + 2) = 0.666...
    // This is the wrong-show case the threshold exists for, and MAL's search genuinely returns
    // Monster Musume for a query of "Monster".
    expect(titleSimilarity('Monster', 'Monster Musume')).toBeCloseTo(2 / 3, 10);
  });

  test('a sequel marker on an otherwise identical title scores 0.8', () => {
    // {steins, gate, 0} against {steins, gate}: 2 x 2 / (3 + 2) = 0.8.
    // Below the 0.85 threshold on purpose — see TITLE_MATCH_THRESHOLD's comment.
    expect(titleSimilarity('Steins;Gate 0', 'Steins;Gate')).toBeCloseTo(0.8, 10);
    expect(0.8).toBeLessThan(TITLE_MATCH_THRESHOLD);
  });

  test('an extra word costs little on a long title', () => {
    // {rascal, does, not, dream, of, a, bunny, girl, senpai} (9) against the same without "a" (8),
    // sharing all 8: 2 x 8 / (9 + 8) = 16/17 = 0.941...
    const score = titleSimilarity(
      'Rascal Does Not Dream of a Bunny Girl Senpai',
      'Rascal Does Not Dream of Bunny Girl Senpai',
    );
    expect(score).toBeCloseTo(16 / 17, 10);
    expect(score).toBeGreaterThan(TITLE_MATCH_THRESHOLD);
  });

  test('shares nothing when a word is misspelled', () => {
    // The documented cost of a word-set metric: {monstar} and {monster} share nothing.
    expect(titleSimilarity('Monstar', 'Monster')).toBe(0);
  });

  test('an empty title matches nothing', () => {
    expect(titleSimilarity('!!!', 'Monster')).toBe(0);
  });
});

describe('pickTitleMatch', () => {
  test('accepts an exact match', () => {
    const match = pickTitleMatch('Mushishi', [
      { id: 10, titles: ['Mushishi'] },
      { id: 11, titles: ['Mushishi Zoku Shou'] },
    ]);
    expect(match).toEqual({ id: 10, similarity: 1 });
  });

  test('rejects a fabricated title', () => {
    // Nothing MAL returns for an invented name comes close: {crimson, veil, chronicles} against
    // {chronicles, of, the, going, home, club} shares 1 of 9 -> 2/9 = 0.222, and against
    // {monster} shares nothing.
    expect(
      pickTitleMatch('Crimson Veil Chronicles', [
        { id: 20, titles: ['Chronicles of the Going Home Club'] },
        { id: 21, titles: ['Monster'] },
      ]),
    ).toBeNull();
  });

  test('rejects a wrong-show fuzzy match', () => {
    // 0.666... from the similarity test above, below the threshold. Accepting this would put a
    // monster-girl harem comedy on a card that says "Monster".
    expect(pickTitleMatch('Monster', [{ id: 30, titles: ['Monster Musume'] }])).toBeNull();
  });

  test('matches on an alternative English title, not only the romaji one', () => {
    // MAL's main title is romaji; a model asked for anime answers in English. Without the
    // alternatives, almost every correct suggestion would be refused.
    const match = pickTitleMatch('Frieren: Beyond Journey’s End', [
      { id: 40, titles: ['Sousou no Frieren', 'Frieren: Beyond Journey’s End'] },
    ]);
    expect(match).toEqual({ id: 40, similarity: 1 });
  });

  test('takes the closest match, not the first one over the threshold', () => {
    // MAL ranks by its own relevance and routinely puts a recap or spin-off first. Here the first
    // result scores 2 x 2 / (3 + 2) = 0.8 — under the threshold anyway — and the second scores 1.
    const match = pickTitleMatch('Vinland Saga', [
      { id: 50, titles: ['Vinland Saga 2'] },
      { id: 51, titles: ['Vinland Saga'] },
    ]);
    expect(match).toEqual({ id: 51, similarity: 1 });
  });

  test('is null when the search returned nothing', () => {
    expect(pickTitleMatch('Mushishi', [])).toBeNull();
  });
});

describe('isWithinObscurityCeiling', () => {
  test('drops a blockbuster the prompt failed to exclude', () => {
    expect(isWithinObscurityCeiling(MAX_LIST_USERS + 1)).toBe(false);
    // A real top-ten-by-members figure, an order of magnitude over the ceiling.
    expect(isWithinObscurityCeiling(3_900_000)).toBe(false);
  });

  test('keeps a well-regarded non-blockbuster', () => {
    expect(isWithinObscurityCeiling(250_000)).toBe(true);
    // Exactly at the ceiling is inside it — the constant names a maximum, not an exclusive bound.
    expect(isWithinObscurityCeiling(MAX_LIST_USERS)).toBe(true);
  });

  test('keeps a show whose audience size is unknown', () => {
    // The project-wide convention: fail toward showing things. The case that arises is a detail
    // row cached before num_list_users was requested.
    expect(isWithinObscurityCeiling(undefined)).toBe(true);
    expect(isWithinObscurityCeiling(null)).toBe(true);
  });
});

describe('buildGeneratorPayload', () => {
  test('refuses before the privacy notice has been accepted', () => {
    expect(() => buildGeneratorPayload(PROFILE, [series('Monster')], null)).toThrow(/privacy notice/i);
  });

  test('sends the profile and every tracked title, sorted', () => {
    const payload = buildGeneratorPayload(
      PROFILE,
      [series('Mushishi'), series('Aria the Animation'), series('Monster')],
      '2026-10-11T00:00:00.000Z',
    );
    expect(payload.profile).toBe(PROFILE);
    expect(payload.exclude).toEqual(['Aria the Animation', 'Monster', 'Mushishi']);
  });

  test('carries nothing but the profile and the titles', () => {
    // The compliance position in one assertion: no id, no MAL id, no status, no email. Asserted on
    // the serialized body, as step 6's payload test is, because that is what actually leaves.
    const payload = buildGeneratorPayload(PROFILE, [series('Monster')], '2026-10-11T00:00:00.000Z');
    expect(Object.keys(payload).sort()).toEqual(['exclude', 'profile']);
    const body = JSON.stringify(payload);
    expect(body).not.toContain('id-Monster');
    expect(body).not.toContain('rootMalId');
    expect(body).not.toContain('WATCHED');
  });
});

describe('acceptableSuggestions', () => {
  test('drops titles already in the library, however they are spelled', () => {
    // The prompt already asks for this; the model ignores it often enough that each one would
    // otherwise cost a MAL search to resolve and then be discarded downstream anyway.
    expect(acceptableSuggestions(['Steins;Gate', 'Mushishi'], ['STEINS GATE'])).toEqual(['Mushishi']);
  });

  test('dedupes two spellings of one suggestion', () => {
    expect(acceptableSuggestions(['Steins;Gate', 'Steins Gate', 'Mushishi'], [])).toEqual([
      'Steins;Gate',
      'Mushishi',
    ]);
  });

  test('drops a title that normalizes to nothing', () => {
    expect(acceptableSuggestions(['!!!', 'Mushishi'], [])).toEqual(['Mushishi']);
  });

  test('caps the list at the MAL request budget, keeping the strongest suggestions', () => {
    // 15 asked for, 12 acted on — the model is told strongest first, so the cap takes the head.
    const suggested = Array.from({ length: 15 }, (_, i) => `Show ${i + 1}`);
    const accepted = acceptableSuggestions(suggested, []);
    expect(accepted).toHaveLength(MAX_GENERATED_TITLES);
    expect(accepted[0]).toBe('Show 1');
    expect(accepted[MAX_GENERATED_TITLES - 1]).toBe(`Show ${MAX_GENERATED_TITLES}`);
  });

  test('trims the whitespace a model leaves on a title', () => {
    expect(acceptableSuggestions(['  Mushishi '], [])).toEqual(['Mushishi']);
  });
});
