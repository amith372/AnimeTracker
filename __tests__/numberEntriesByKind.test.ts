import { numberEntriesByKind } from '@/domain/series';
import type { EntryKind } from '@/domain/types';

function entry(kind: EntryKind, title: string) {
  return { kind, title };
}

test('numbers seasons and movies independently, each starting at 1', () => {
  const entries = [
    entry('TV_SEASON', 'Season 1'),
    entry('TV_SEASON', 'Season 2'),
    entry('MOVIE', 'Movie A'),
    entry('TV_SEASON', 'Season 3'),
    entry('MOVIE', 'Movie B'),
  ];
  expect(numberEntriesByKind(entries).map((x) => x.kindNumber)).toEqual([1, 2, 1, 3, 2]);
});

test('empty input returns empty output', () => {
  expect(numberEntriesByKind([])).toEqual([]);
});
