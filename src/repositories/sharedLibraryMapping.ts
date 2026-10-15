// What a shared-library payload means — plan 4 step 3 / prd/2-public-share.md.
//
// The seam between the public Edge Function's wire format and something a screen can render, the
// same job seriesMapping.ts does for Postgres rows and for the same reason it lives in
// repositories/ rather than domain/: src/domain/ stays free of any transport's shape.
//
// The one thing this file must get right is that **it derives nothing of its own**. The status a
// viewer reads comes from `deriveSeriesStatus` — the same function, with the same inputs, that the
// owner's Library runs (success criterion 5). The public page and the app can disagree about
// layout, colour and wording; they must never disagree about what "Watched 3/5 seasons" means.
//
// Pure and free of the Supabase client so Jest can test it directly.
import { deriveSeriesStatus, type SeriesStatus } from '@/domain/seriesStatus';
import type { AiringStatus, EntryKind, ManualStatus, SeriesType, WatchState } from '@/domain/types';

/** One entry exactly as `supabase/functions/shared-library` sends it. No id, no MAL id, no title:
 * the page shows series-level status, so a season's own name has no reader (the PRD's One Piece
 * edge case settled that arc and season detail are not published). */
export interface SharedEntryPayload {
  kind: EntryKind;
  orderIndex: number;
  episodeCount: number;
  watchState: WatchState;
  airingStatus: AiringStatus;
}

/** One series as the function sends it. */
export interface SharedSeriesPayload {
  title: string;
  coverUrl: string | null;
  genres: string[];
  type: SeriesType;
  manualStatus: ManualStatus;
  entries: SharedEntryPayload[];
}

export interface SharedLibraryPayload {
  /** The nickname the sharer typed, or null. The only thing about a person in the whole response. */
  displayName: string | null;
  series: SharedSeriesPayload[];
}

/** One row on the public page: what it renders, with the status already derived. */
export interface SharedSeries {
  title: string;
  coverUrl: string | null;
  genres: string[];
  type: SeriesType;
  status: SeriesStatus;
}

export interface SharedLibrary {
  displayName: string | null;
  series: SharedSeries[];
}

/**
 * The page's heading. A typed nickname if there is one, else a neutral phrase — never anything the
 * app already holds about the sharer, which is the whole of the PRD's "whose list it is" decision
 * and §4(f)'s constraint in one line.
 *
 * Takes the name rather than reading it off the payload so the empty-string case is handled in one
 * place: Postgres rejects '' and the client normalizes blanks to null, but a payload is a wire
 * format and a heading that renders as nothing is the kind of thing that only shows up in
 * production.
 */
export function sharedLibraryHeading(displayName: string | null | undefined): string {
  const name = displayName?.trim();
  return name ? `${name}’s anime list` : 'A shared anime list';
}

/**
 * Payload -> renderable rows, deriving each series' status with the app's own function.
 *
 * Entries arrive sorted by `orderIndex` (the function sorts them) and `deriveSeriesStatus` is
 * order-independent anyway — it looks for the longest consecutive run from season 1 by index, not
 * by position — so nothing re-sorts here. Genres default to an empty array rather than being
 * trusted: `genres` is `jsonb` and an old row could hold null.
 */
export function toSharedLibrary(payload: SharedLibraryPayload): SharedLibrary {
  return {
    displayName: payload.displayName ?? null,
    series: (payload.series ?? []).map((row) => ({
      title: row.title,
      coverUrl: row.coverUrl ?? null,
      genres: row.genres ?? [],
      type: row.type,
      status: deriveSeriesStatus(
        row.manualStatus,
        (row.entries ?? []).map((entry) => ({
          kind: entry.kind,
          orderIndex: entry.orderIndex,
          watchState: entry.watchState,
        })),
      ),
    })),
  };
}
