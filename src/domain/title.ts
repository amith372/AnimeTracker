// Which of MAL's several titles to actually show the user.
//
// MAL's `title` field is the romaji transliteration ("Kimetsu no Yaiba", "Shingeki no Kyojin"),
// which is what the API returns by default. `alternative_titles.en` carries the official English
// title when one exists ("Demon Slayer", "Attack on Titan"). English is far easier to recognise
// and search for, so it wins whenever MAL actually has one.
//
// Kept as a pure function in domain/ rather than inlined at each mapping site because the choice
// is a product decision that has to be identical everywhere — Library, Discover, Recommendations
// and the reconcile checklist must all name the same show the same way, or grouping looks broken
// even when it isn't.

/**
 * Picks the display title for one anime. Falls back to the romaji `title` whenever MAL has no
 * English title, or has one that's blank/whitespace — a surprisingly common case for older and
 * niche shows, where `alternative_titles.en` is present but an empty string.
 */
export function displayTitle(title: string, englishTitle?: string | null): string {
  const english = englishTitle?.trim();
  return english ? english : title;
}
