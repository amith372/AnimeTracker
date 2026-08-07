import { displayTitle } from '@/domain/title';

describe('displayTitle', () => {
  it('prefers the English title when MAL has one', () => {
    expect(displayTitle('Kimetsu no Yaiba', 'Demon Slayer: Kimetsu no Yaiba')).toBe('Demon Slayer: Kimetsu no Yaiba');
  });

  it('falls back to the romaji title when there is no English one', () => {
    expect(displayTitle('Mushishi', undefined)).toBe('Mushishi');
    expect(displayTitle('Mushishi', null)).toBe('Mushishi');
  });

  // MAL frequently returns alternative_titles.en as an empty or whitespace-only string rather than
  // omitting the field — treating that as a real title would blank out the row entirely.
  it('treats a blank English title as absent', () => {
    expect(displayTitle('Mushishi', '')).toBe('Mushishi');
    expect(displayTitle('Mushishi', '   ')).toBe('Mushishi');
  });
});
