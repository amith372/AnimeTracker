// Plan 1 step 6's pure half. Two things here are load-bearing beyond ordinary correctness:
//
//  - **The fingerprint decides when a model call fires.** The PRD's trigger rule is "liked /
//    dropped / newly completed, and nothing else"; an episode tick short of completion must cost
//    nothing. That is a behavioural promise with a bill attached, so it is asserted directly,
//    including the tick that *does* count because it finishes a series.
//  - **The payload is the only thing that ever leaves the app.** The assertion is made on the
//    serialized body rather than the object, because that is what gets sent — a field nobody reads
//    is still a field on the wire.
//
// Every expected value below is worked out from the inputs on paper (the fingerprint strings are
// spelled out in full for exactly that reason), never copied from what the implementation printed.
import {
  buildTastePayload,
  hasEnoughTasteSignal,
  isTasteProfileStale,
  MIN_TASTE_VERDICTS,
  parseTasteProfile,
  tasteBucketOf,
  tasteFingerprint,
} from '@/domain/tasteProfile';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import type { Series, SeriesEntry } from '@/domain/series';
import type { WatchState } from '@/domain/types';

function makeSeries(overrides: Partial<Series>): Series {
  return {
    // Deliberately distinctive, and deliberately not a plausible substring of any title below:
    // two of the tests assert these never appear in the serialized payload.
    id: 'series-id-x',
    title: 'Series',
    coverUrl: null,
    genres: [],
    rootMalId: 9999,
    type: 'SERIES',
    manualStatus: 'NONE',
    status: { kind: 'WATCHED' },
    entries: [],
    newSeasonAvailable: false,
    newSeasonAiredAtEpochMillis: null,
    liked: false,
    ...overrides,
  };
}

const PARTIAL_1_OF_2 = {
  kind: 'WATCHED_PARTIAL',
  watchedSeasons: 1,
  totalSeasons: 2,
  watchedMovies: 0,
  totalMovies: 0,
} as const;

// The standing fixture. Five of the seven series speak for a bucket, which is exactly
// MIN_TASTE_VERDICTS — so the gate tests below can go either side of the line by adding or
// removing one.
//
//   Alpha   1001  liked, finished          -> liked
//   Bravo   1002  dropped                  -> dropped
//   Charlie 1003  finished, not liked      -> watchedNeutral
//   Delta   1004  plan to watch            -> (none)
//   Echo    1005  1 of 2 seasons, not liked-> (none)
//   Foxtrot 1006  watched-forgot           -> watchedNeutral
//   Golf    1007  1 of 2 seasons, liked    -> liked
const LIBRARY: Series[] = [
  makeSeries({ id: 'series-id-a', title: 'Alpha', rootMalId: 1001, liked: true, status: { kind: 'WATCHED' } }),
  makeSeries({ id: 'series-id-b', title: 'Bravo', rootMalId: 1002, manualStatus: 'DROPPED', status: { kind: 'DROPPED' } }),
  makeSeries({ id: 'series-id-c', title: 'Charlie', rootMalId: 1003, status: { kind: 'WATCHED' } }),
  makeSeries({ id: 'series-id-d', title: 'Delta', rootMalId: 1004, manualStatus: 'PLAN', status: { kind: 'PLAN' } }),
  makeSeries({ id: 'series-id-e', title: 'Echo', rootMalId: 1005, status: PARTIAL_1_OF_2 }),
  makeSeries({
    id: 'series-id-f',
    title: 'Foxtrot',
    rootMalId: 1006,
    manualStatus: 'WATCHED_FORGOT',
    status: { kind: 'WATCHED_FORGOT' },
  }),
  makeSeries({ id: 'series-id-g', title: 'Golf', rootMalId: 1007, liked: true, status: PARTIAL_1_OF_2 }),
];

// Derived from the table above: the five contributing series, each as `rootMalId:bucket`, sorted.
// All five ids are four digits, so the string sort and a numeric one agree.
const LIBRARY_FINGERPRINT = 'v1:1001:liked|1002:dropped|1003:watchedNeutral|1006:watchedNeutral|1007:liked';

const CONSENTED_AT = '2026-10-11T00:00:00.000Z';

describe('tasteBucketOf', () => {
  test.each([
    ['a liked finished series', LIBRARY[0], 'liked'],
    ['a dropped series', LIBRARY[1], 'dropped'],
    ['a finished series', LIBRARY[2], 'watchedNeutral'],
    ['a plan-to-watch series', LIBRARY[3], null],
    ['a part-watched series nobody liked', LIBRARY[4], null],
    ['a watched-forgot series', LIBRARY[5], 'watchedNeutral'],
    ['a liked part-watched series', LIBRARY[6], 'liked'],
  ])('puts %s in %s', (_label, series, expected) => {
    expect(tasteBucketOf(series as Series)).toBe(expected);
  });

  test('a dropped series counts as dropped even if it was liked first', () => {
    // The precedence that matters most: a bail is the strongest verdict the user ever gives, and
    // reading this one as a favourite would teach the generator the opposite of the truth.
    const likedThenDropped = makeSeries({ liked: true, manualStatus: 'DROPPED', status: { kind: 'DROPPED' } });
    expect(tasteBucketOf(likedThenDropped)).toBe('dropped');
  });

  test('a currently-watching series is not yet a verdict', () => {
    const watching = makeSeries({ manualStatus: 'CURRENTLY_WATCHING', status: { kind: 'CURRENTLY_WATCHING' } });
    expect(tasteBucketOf(watching)).toBeNull();
  });
});

describe('hasEnoughTasteSignal', () => {
  test('five verdicts is enough', () => {
    // The fixture contributes exactly five (see the table): two liked, two neutral, one dropped.
    expect(MIN_TASTE_VERDICTS).toBe(5);
    expect(hasEnoughTasteSignal(LIBRARY)).toBe(true);
  });

  test('four is not', () => {
    // Dropping Charlie leaves 1001, 1002, 1006, 1007 — four verdicts.
    expect(hasEnoughTasteSignal(LIBRARY.filter((s) => s.title !== 'Charlie'))).toBe(false);
  });

  test('a library of nothing but plans and part-watched shows says nothing', () => {
    // Twelve series, zero verdicts: this is the library the PRD's small-library edge case is
    // about, and generating a profile from it would be invention rather than inference.
    const noVerdicts = Array.from({ length: 12 }, (_, i) =>
      makeSeries({ rootMalId: 2000 + i, manualStatus: 'PLAN', status: { kind: 'PLAN' } }),
    );
    expect(hasEnoughTasteSignal(noVerdicts)).toBe(false);
  });
});

describe('buildTastePayload', () => {
  test('sends three sorted lists of titles and nothing else', () => {
    const payload = buildTastePayload(LIBRARY, CONSENTED_AT);
    expect(payload).toEqual({
      liked: ['Alpha', 'Golf'],
      watchedNeutral: ['Charlie', 'Foxtrot'],
      dropped: ['Bravo'],
    });
  });

  test('is byte-identical whatever order the library arrives in', () => {
    // Two devices building this from the same library must produce the same body, or an idempotent
    // request isn't idempotent. Postgres gives no ordering guarantee without an ORDER BY.
    const reversed = [...LIBRARY].reverse();
    expect(JSON.stringify(buildTastePayload(reversed, CONSENTED_AT))).toBe(
      JSON.stringify(buildTastePayload(LIBRARY, CONSENTED_AT)),
    );
  });

  test('the serialized body carries no identifier, and no MAL id', () => {
    // Asserted on the wire format, not the object: a field nobody reads is still a field that got
    // sent. Every id in the fixture is distinctive enough that a false pass is not possible —
    // 'series-id-' appears in no title, and no title contains a four-digit number.
    const body = JSON.stringify(buildTastePayload(LIBRARY, CONSENTED_AT));

    expect(body).not.toContain('series-id-');
    for (const series of LIBRARY) {
      expect(body).not.toContain(String(series.rootMalId));
      expect(body).not.toContain(series.id);
    }
    // And no key beyond the three buckets, so a field added to Series later can't ride along.
    expect(Object.keys(JSON.parse(body))).toEqual(['liked', 'watchedNeutral', 'dropped']);
  });

  test('refuses to build anything before the privacy notice is accepted', () => {
    // The last gate in front of the only data that leaves the app. It must throw rather than
    // return an empty payload: "send nothing" would silently succeed and look like a working
    // feature with an unhelpful model.
    expect(() => buildTastePayload(LIBRARY, null)).toThrow(/privacy notice/i);
    expect(() => buildTastePayload(LIBRARY, '')).toThrow(/privacy notice/i);
  });
});

describe('tasteFingerprint', () => {
  test('digests the contributing series and their buckets', () => {
    expect(tasteFingerprint(LIBRARY)).toBe(LIBRARY_FINGERPRINT);
  });

  test('is independent of library order', () => {
    expect(tasteFingerprint([...LIBRARY].reverse())).toBe(LIBRARY_FINGERPRINT);
  });

  test('a library with no verdicts digests to the bare version prefix', () => {
    expect(tasteFingerprint([makeSeries({ manualStatus: 'PLAN', status: { kind: 'PLAN' } })])).toBe('v1:');
  });

  test('moves when a series is liked', () => {
    // Charlie (1003) goes from watchedNeutral to liked. Nothing else changes, and the sorted
    // position of 1003 is unchanged, so only that one segment differs.
    const liked = LIBRARY.map((s) => (s.title === 'Charlie' ? { ...s, liked: true } : s));
    expect(tasteFingerprint(liked)).toBe(
      'v1:1001:liked|1002:dropped|1003:liked|1006:watchedNeutral|1007:liked',
    );
  });

  test('moves when a series is dropped', () => {
    // Delta (1004) contributed nothing as a plan-to-watch; dropped, it becomes a verdict and the
    // digest gains a sixth segment, sorted between 1003 and 1006.
    const dropped = LIBRARY.map((s) =>
      s.title === 'Delta' ? { ...s, manualStatus: 'DROPPED' as const, status: { kind: 'DROPPED' as const } } : s,
    );
    expect(tasteFingerprint(dropped)).toBe(
      'v1:1001:liked|1002:dropped|1003:watchedNeutral|1004:dropped|1006:watchedNeutral|1007:liked',
    );
  });

  test('moves when a contributing series is removed', () => {
    const withoutBravo = LIBRARY.filter((s) => s.title !== 'Bravo');
    expect(tasteFingerprint(withoutBravo)).toBe(
      'v1:1001:liked|1003:watchedNeutral|1006:watchedNeutral|1007:liked',
    );
  });

  test('does not move when a plan-to-watch series is added', () => {
    // Adding to the backlog is not a verdict, and must not cost a model call.
    const plusPlan = [...LIBRARY, makeSeries({ rootMalId: 3001, manualStatus: 'PLAN', status: { kind: 'PLAN' } })];
    expect(tasteFingerprint(plusPlan)).toBe(LIBRARY_FINGERPRINT);
  });
});

describe('tasteFingerprint across an episode tick', () => {
  // A five-season series with no manual status, so its status is genuinely derived rather than
  // hand-asserted — the thing under test is how progress interacts with the fingerprint, and
  // stating the status by hand would test nothing but the fixture.
  function tickingSeries(watchedSeasons: number): Series {
    const entries: SeriesEntry[] = Array.from({ length: 5 }, (_, i) => ({
      id: `tick-entry-${i}`,
      malId: 4000 + i,
      kind: 'TV_SEASON' as const,
      orderIndex: i,
      title: `Season ${i + 1}`,
      episodeCount: 12,
      watchState: (i < watchedSeasons ? 'WATCHED' : 'UNWATCHED') as WatchState,
      airingStatus: 'FINISHED' as const,
      watchedArcKeys: null,
    }));
    return makeSeries({
      id: 'series-id-tick',
      title: 'Hotel',
      rootMalId: 1008,
      entries,
      status: deriveSeriesStatus('NONE', entries),
    });
  }

  test('a tick short of the end changes nothing', () => {
    // 3 of 5 and 4 of 5 both derive to WATCHED_PARTIAL, which is no bucket — so the digest is the
    // fixture's own, unchanged, at both. This is the PRD's "an episode tick must not fire a model
    // call", asserted at the only place it can be.
    expect(tasteFingerprint([...LIBRARY, tickingSeries(3)])).toBe(LIBRARY_FINGERPRINT);
    expect(tasteFingerprint([...LIBRARY, tickingSeries(4)])).toBe(LIBRARY_FINGERPRINT);
  });

  test('the tick that finishes the series does change it', () => {
    // 5 of 5 derives to WATCHED, so 1008 joins the neutral bucket. It sorts last, after 1007.
    expect(tasteFingerprint([...LIBRARY, tickingSeries(5)])).toBe(
      `${LIBRARY_FINGERPRINT}|1008:watchedNeutral`,
    );
  });

  test('and so the profile only goes stale on the finishing tick', () => {
    expect(isTasteProfileStale(LIBRARY_FINGERPRINT, [...LIBRARY, tickingSeries(4)])).toBe(false);
    expect(isTasteProfileStale(LIBRARY_FINGERPRINT, [...LIBRARY, tickingSeries(5)])).toBe(true);
  });
});

describe('isTasteProfileStale', () => {
  test('a matching fingerprint is fresh', () => {
    expect(isTasteProfileStale(LIBRARY_FINGERPRINT, LIBRARY)).toBe(false);
  });

  test('no stored profile is stale by definition', () => {
    // Which is what makes "Describe my taste" and "Regenerate" one code path.
    expect(isTasteProfileStale(null, LIBRARY)).toBe(true);
  });
});

describe('parseTasteProfile', () => {
  test('accepts a well-formed profile', () => {
    expect(
      parseTasteProfile({
        summary: 'You go for slow-burn character drama.',
        seeksOut: ['slow burn', 'character drama'],
        tolerates: ['shonen action'],
        avoids: ['gag comedy'],
      }),
    ).toEqual({
      summary: 'You go for slow-burn character drama.',
      seeksOut: ['slow burn', 'character drama'],
      tolerates: ['shonen action'],
      avoids: ['gag comedy'],
    });
  });

  test('trims the summary and the descriptors', () => {
    const parsed = parseTasteProfile({ summary: '  Spaced out.  ', seeksOut: [' padded '] });
    expect(parsed).toEqual({ summary: 'Spaced out.', seeksOut: ['padded'], tolerates: [], avoids: [] });
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['a bare string', 'You like anime.'],
    ['an object with no summary', { seeksOut: ['a'] }],
    ['a whitespace-only summary', { summary: '   ' }],
    ['a non-string summary', { summary: 42 }],
  ])('rejects %s', (_label, raw) => {
    // Returning null rather than throwing is what lets the card degrade to "no profile yet" with
    // a working regenerate button, instead of taking the screen down — guardrail #5 one layer out.
    expect(parseTasteProfile(raw)).toBeNull();
  });

  test('drops junk out of the descriptor lists rather than failing', () => {
    // A usable summary with one malformed list is still a usable profile; the alternative is
    // throwing away a good generation over a field the user barely reads.
    const parsed = parseTasteProfile({
      summary: 'Fine.',
      seeksOut: 'not a list',
      tolerates: ['keep', 3, null, '', '  ', 'this'],
      avoids: [],
    });
    expect(parsed).toEqual({ summary: 'Fine.', seeksOut: [], tolerates: ['keep', 'this'], avoids: [] });
  });
});
