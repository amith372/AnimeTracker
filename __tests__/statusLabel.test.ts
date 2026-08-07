import {
  MANUAL_STATUS_CHOICES,
  STATUS_FILTER_KINDS,
  manualStatusLabel,
  statusKindLabel,
  statusLabel,
} from '@/domain/statusLabel';

describe('statusLabel', () => {
  test('fills in the real season counts for a partial watch', () => {
    const status = { kind: 'WATCHED_PARTIAL', watchedSeasons: 1, totalSeasons: 3, watchedMovies: 0, totalMovies: 0 } as const;
    expect(statusLabel(status)).toBe('Watched 1/3 seasons');
  });

  test('shows both halves when the series has films as well as seasons', () => {
    const status = { kind: 'WATCHED_PARTIAL', watchedSeasons: 3, totalSeasons: 5, watchedMovies: 2, totalMovies: 3 } as const;
    expect(statusLabel(status)).toBe('Watched 3/5 seasons, 2/3 movies');
  });

  test('omits the seasons half for a standalone movie', () => {
    // "0/0 seasons" would be noise on every standalone-movie row.
    const status = { kind: 'WATCHED_PARTIAL', watchedSeasons: 0, totalSeasons: 0, watchedMovies: 0, totalMovies: 1 } as const;
    expect(statusLabel(status)).toBe('Watched 0/1 movies');
  });

  test('matches the generic category label for every non-parameterised status', () => {
    expect(statusLabel({ kind: 'WATCHED' })).toBe(statusKindLabel('WATCHED'));
    expect(statusLabel({ kind: 'DROPPED' })).toBe(statusKindLabel('DROPPED'));
    expect(statusLabel({ kind: 'PLAN' })).toBe(statusKindLabel('PLAN'));
  });
});

describe('statusKindLabel', () => {
  test('describes the partial-watch bucket generically, with no counts to fill in', () => {
    expect(statusKindLabel('WATCHED_PARTIAL')).toBe('Watched X/Y');
  });

  test('every filter kind has a non-empty label', () => {
    for (const kind of STATUS_FILTER_KINDS) {
      expect(statusKindLabel(kind).length).toBeGreaterThan(0);
    }
  });
});

describe('manualStatusLabel', () => {
  test('NONE reads as auto-derived rather than as a status of its own', () => {
    expect(manualStatusLabel('NONE')).toBe('Auto — from watched seasons');
  });

  test('every manual choice has a non-empty label', () => {
    for (const status of MANUAL_STATUS_CHOICES) {
      expect(manualStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  test('the add-flow choices deliberately exclude NONE', () => {
    // Adding a series as "auto-derived" is meaningless; NONE only exists to undo an override,
    // which is why the Detail screen's editor appends it separately.
    expect(MANUAL_STATUS_CHOICES).not.toContain('NONE');
    expect(MANUAL_STATUS_CHOICES).toHaveLength(4);
  });
});
