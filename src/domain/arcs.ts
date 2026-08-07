// Hardcoded story-arc breakdown for the one series that needs arc-level tracking instead of
// season-level: One Piece (MAL id 21) is a single 1000+ episode TV_SEASON entry with no real
// season splits on MAL, so a single "Season 1" checkbox is not useful. This is deliberately a
// hardcoded, single-entry lookup, not a general per-series configuration mechanism; see
// app/series/[id].tsx for the one place it is consulted.
//
// Episode ranges are NOT sourced from any MAL field (MAL has no arc data) — cross-checked by hand
// against api.api-onepiece.com (East Blue through Dressrosa) and animefillerguide.com plus dated
// 2025/2026 news coverage of the Egghead->Elbaf transition (Whole Cake Island onward). No source
// found covers this live/programmatically for the arcs that actually go stale (Whole Cake Island
// onward — the older arcs are long-finished and unlikely to ever need re-checking), so this stays
// a plain hardcoded list with no in-app freshness check. Will need manual review as new
// episodes/arcs air, most importantly extending or splitting the final entry (currently "Elbaf")
// once that arc ends and the next one is named.
export interface Arc {
  key: string;
  title: string;
  episodeStart: number;
  episodeEnd: number;
}

export const ONE_PIECE_MAL_ID = 21;

// Grouped at saga granularity (matching how the anime is commonly discussed/tracked), not every
// individual named sub-arc; e.g. East Blue's four introductory arcs are one row here. The last
// entry's episodeEnd is an open-ended sentinel (not a real episode count) so a new episode airing
// doesn't require an edit here — it's never used for range math, only as a stable checkable row.
export const ONE_PIECE_ARCS: Arc[] = [
  { key: 'east_blue', title: 'East Blue Saga', episodeStart: 1, episodeEnd: 61 },
  { key: 'alabasta', title: 'Alabasta Saga', episodeStart: 62, episodeEnd: 143 },
  { key: 'skypiea', title: 'Sky Island Saga (Jaya / Skypiea)', episodeStart: 144, episodeEnd: 206 },
  { key: 'water_seven', title: 'Water 7 Saga (Water 7 / Enies Lobby)', episodeStart: 207, episodeEnd: 325 },
  { key: 'thriller_bark', title: 'Thriller Bark Saga', episodeStart: 326, episodeEnd: 389 },
  { key: 'summit_war', title: 'Summit War Saga (Sabaody / Impel Down / Marineford)', episodeStart: 390, episodeEnd: 516 },
  { key: 'fishman_island', title: 'Fish-Man Island Saga', episodeStart: 517, episodeEnd: 574 },
  { key: 'dressrosa', title: 'Dressrosa Saga (Punk Hazard / Dressrosa)', episodeStart: 575, episodeEnd: 746 },
  // Includes the Reverie/Zou run (747-782) that precedes the Whole Cake Island arc proper
  // (783-877) and the Levely arc (878-889) that follows it — all grouped under this saga per
  // animefillerguide.com, closing a real gap this file used to have (747-782 belonged to no arc).
  { key: 'whole_cake_island', title: 'Whole Cake Island Saga', episodeStart: 747, episodeEnd: 889 },
  { key: 'wano', title: 'Wano Country Saga', episodeStart: 890, episodeEnd: 1085 },
  { key: 'egghead', title: 'Egghead Arc', episodeStart: 1086, episodeEnd: 1155 },
  { key: 'elbaf', title: 'Elbaf Arc', episodeStart: 1156, episodeEnd: 9999 },
];

// Looks up the arc breakdown for an entry's MAL id, returns undefined for every entry except the
// one this feature targets. The only entry point app/series/[id].tsx needs.
export function arcsForMalId(malId: number): Arc[] | undefined {
  return malId === ONE_PIECE_MAL_ID ? ONE_PIECE_ARCS : undefined;
}
