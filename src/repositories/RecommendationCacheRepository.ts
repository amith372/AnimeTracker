// The stored "For you" list's round trip -- plan 9 step 3. Reads the list this account last
// computed, and writes the one it just computed.
//
// Split the same way every other repository here is (CLAUDE.md's state/reactivity model): a `use*`
// hook for the screen to hydrate from, and plain async functions for the pipeline to call. The
// division of labour, since three places could plausibly own each part:
//
//  - **src/domain/recommendationCache.ts** decides what the fingerprint is and when a stored list
//    is stale. Pure, unit-tested.
//  - **RecommendationRepository.ts** computes the list and calls `saveRecommendations` the moment
//    it has one, from the same library snapshot it ranked against -- so the list and the
//    fingerprint it is filed under can never describe different libraries.
//  - **this file** owns the Postgres row and the query cache entry, and nothing else.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/account/supabaseClient';
import { useAccountSession } from '@/account/accountRepository';
import {
  isRecommendationListStale,
  parseStoredRecommendations,
} from '@/domain/recommendationCache';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { useLibrary } from './AnimeRepository';
import { libraryKeys, queryClient } from './queryClient';

/** The stored row as the screen needs it: the list, the notice that described it, and the digest
 * it was computed under. */
export interface StoredRecommendations {
  series: ReconcileSeries[];
  generatorNotice: string | null;
  generatedAt: string;
  sourceFingerprint: string;
}

/**
 * Reads the one row, or null when this account has never computed a list.
 *
 * A row whose JSON doesn't narrow to a list of series is treated as absent rather than thrown: the
 * fallback is simply to compute the list, which is what the app did before this step existed, so
 * an unreadable row costs a slow visit rather than an error screen on a feature that still works.
 */
async function fetchStoredRecommendations(userId: string): Promise<StoredRecommendations | null> {
  const { data, error } = await supabase
    .from('recommendation_lists')
    .select('series, generator_notice, generated_at, source_fingerprint')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const series = parseStoredRecommendations(data.series);
  if (!series) return null;
  return {
    series,
    generatorNotice: data.generator_notice ?? null,
    generatedAt: data.generated_at,
    sourceFingerprint: data.source_fingerprint,
  };
}

/** What the Recommendations screen hydrates from. `isStale` is computed against the *live* library
 * rather than stored, so it is right the instant a like or a finishing tick lands -- the library
 * query is already reactive through Realtime and this rides it, the same way useTasteProfile does. */
export interface StoredRecommendationsView {
  stored: StoredRecommendations | null;
  /** True until both the row and the library it must be compared against have been read. The
   * screen must not decide anything while this is true: a fingerprint taken against a library
   * that hasn't loaded yet looks stale for every account and would recompute on every visit,
   * which is the whole bug this step exists to fix. */
  isLoading: boolean;
  isStale: boolean;
}

export function useStoredRecommendations(): StoredRecommendationsView {
  const { session, loading: sessionLoading } = useAccountSession();
  const userId = session?.user.id ?? null;
  const { series: library, isLoading: libraryLoading } = useLibrary();

  const query = useQuery({
    queryKey: libraryKeys.recommendations(userId ?? 'anonymous'),
    queryFn: () => fetchStoredRecommendations(userId!),
    enabled: !!userId,
  });

  const stored = query.data ?? null;
  // Memoized on the fingerprint string and the library identity, which TanStack keeps stable
  // between renders through structural sharing -- same reasoning as useTasteProfile's memo, and
  // the same hazard avoided: a fresh comparison every render would make `isStale` a new value each
  // pass and defeat the mount effect that reads it.
  const isStale = useMemo(
    () => isRecommendationListStale(stored?.sourceFingerprint ?? null, library),
    [stored?.sourceFingerprint, library],
  );

  return {
    stored,
    isLoading: sessionLoading || libraryLoading || (!!userId && query.isPending),
    isStale,
  };
}

/**
 * Stores the list that was just computed, under the fingerprint of the library it was computed
 * from. Called by the pipeline, not by the screen, so the two can never disagree about which
 * library a list describes.
 *
 * Failures are swallowed deliberately, for the same reason apiCache's write-back is: the list is
 * already on screen and correct, and a cache write that couldn't happen must not turn a successful
 * run into an error. The cost of losing it is one slow visit next time. It is also why this is
 * never awaited by anything the user is waiting on.
 */
export async function saveRecommendations(
  series: ReconcileSeries[],
  generatorNotice: string | null,
  sourceFingerprint: string,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return;

  const generatedAt = new Date().toISOString();
  const { error } = await supabase.from('recommendation_lists').upsert({
    user_id: userId,
    series,
    generator_notice: generatorNotice,
    source_fingerprint: sourceFingerprint,
    generated_at: generatedAt,
  });
  if (error) return;

  // setQueryData, not invalidateQueries: we know exactly what was just written, and an
  // invalidation would spend another ~350ms round trip to be told the same thing. This is also
  // what makes a *second* visit in the same session instant without re-reading the row.
  queryClient.setQueryData<StoredRecommendations>(libraryKeys.recommendations(userId), {
    series,
    generatorNotice,
    generatedAt,
    sourceFingerprint,
  });
}
