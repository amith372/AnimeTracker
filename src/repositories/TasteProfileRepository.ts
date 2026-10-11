// The taste profile's round trip — plan 1 step 6. Reads the stored profile reactively, and
// generates a new one on demand.
//
// Split the same way every other repository here is (CLAUDE.md's state/reactivity model): a `use*`
// hook for the screen to re-render on, and a plain async function for the button to call. The
// division of labour with the rest of step 6 is worth stating, because three places could plausibly
// own each part:
//
//  - **src/domain/tasteProfile.ts** decides which series count, what the payload is, and when a
//    profile is stale. All pure, all unit-tested.
//  - **supabase/functions/taste-profile** holds the key and calls the model. Nothing else.
//  - **this file** sequences them and owns the Postgres row, writing the profile and the
//    fingerprint it came from together — they are only meaningful as a pair, and the Edge Function
//    deliberately doesn't know the fingerprint at all.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/account/supabaseClient';
import { useAccountSession } from '@/account/accountRepository';
import { callTasteProfile } from '@/api/edgeFunctions';
import {
  buildTastePayload,
  hasEnoughTasteSignal,
  isTasteProfileStale,
  parseTasteProfile,
  tasteFingerprint,
  type TasteProfile,
} from '@/domain/tasteProfile';
import { getAllSeriesOnce, getPrivacyConsentedAtOnce, useLibrary } from './AnimeRepository';
import { libraryKeys, queryClient } from './queryClient';

/** The stored row, as the screen needs it: the profile plus whether the library has moved since. */
export interface StoredTasteProfile {
  profile: TasteProfile;
  generatedAt: string;
  sourceFingerprint: string;
}

/** Reads the one row, or null when this account has never generated a profile. A row whose stored
 * JSON doesn't narrow to a TasteProfile is treated as absent rather than thrown: the regenerate
 * button is then the obvious fix, where an error screen would leave no way forward. */
async function fetchTasteProfile(userId: string): Promise<StoredTasteProfile | null> {
  const { data, error } = await supabase
    .from('taste_profiles')
    .select('profile, generated_at, source_fingerprint')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profile = parseTasteProfile(data.profile);
  if (!profile) return null;
  return { profile, generatedAt: data.generated_at, sourceFingerprint: data.source_fingerprint };
}

/**
 * What the Recommendations screen renders. Deliberately more than the profile itself:
 *
 *  - `isStale` is why the card can offer "your library has changed since this was written" rather
 *    than silently showing a description of a library the user no longer has.
 *  - `hasEnoughSignal` is the PRD's small-library edge case. A profile written from two shows is
 *    invention, and the honest card says so instead of generating one.
 *
 * Both are computed from the live library rather than stored, so they are correct the instant a
 * like or a drop lands — the library query is already reactive through Realtime, and this rides it.
 */
export interface TasteProfileView {
  stored: StoredTasteProfile | null;
  isLoading: boolean;
  error: Error | null;
  isStale: boolean;
  hasEnoughSignal: boolean;
}

export function useTasteProfile(): TasteProfileView {
  const { session, loading: sessionLoading } = useAccountSession();
  const userId = session?.user.id ?? null;
  const { series, isLoading: libraryLoading } = useLibrary();

  const query = useQuery({
    queryKey: libraryKeys.taste(userId ?? 'anonymous'),
    queryFn: () => fetchTasteProfile(userId!),
    enabled: !!userId,
  });

  // Memoized on `series`, whose identity TanStack keeps stable between renders through structural
  // sharing — the same reasoning as useCatchUp's memo, and the same hazard avoided: a fresh
  // fingerprint string on every render would make `isStale` a new value each pass and defeat any
  // memo downstream of it.
  const stored = query.data ?? null;
  const { isStale, hasEnoughSignal } = useMemo(
    () => ({
      isStale: isTasteProfileStale(stored?.sourceFingerprint ?? null, series),
      hasEnoughSignal: hasEnoughTasteSignal(series),
    }),
    [stored?.sourceFingerprint, series],
  );

  return {
    stored,
    isLoading: sessionLoading || libraryLoading || (!!userId && query.isPending),
    error: (query.error as Error | null) ?? null,
    isStale,
    hasEnoughSignal,
  };
}

/**
 * Generates a profile and stores it. Backs both the first "describe my taste" and the regenerate
 * button — they are the same operation, since a missing profile is stale by definition.
 *
 * The order matters and is not arbitrary: the fingerprint is taken from the *same* library snapshot
 * the payload was built from, before the model call rather than after it. Taking it afterwards
 * would stamp the row with a library that may have changed during the call, and the profile would
 * then read as current when it describes something slightly older — a staleness check that quietly
 * under-reports is worse than none.
 *
 * Throws on failure rather than returning a flag, so the caller can show the real reason (no
 * consent, too small a library, the provider down). Step 7's degrade path is the deterministic
 * recommendation list continuing to render regardless, which it does because nothing in the ranker
 * reads this.
 */
export async function generateTasteProfile(): Promise<TasteProfile> {
  const series = await getAllSeriesOnce();
  if (!hasEnoughTasteSignal(series)) {
    throw new Error('Not enough watched or dropped series yet to describe your taste.');
  }

  // Throws if consent is null — the client-side half of the gate. The Edge Function re-checks it
  // against Postgres, so this failing open could still not leak a library; see
  // supabase/functions/taste-profile's header.
  const consentedAt = await getPrivacyConsentedAtOnce();
  const payload = buildTastePayload(series, consentedAt);
  const fingerprint = tasteFingerprint(series);

  const { profile: raw } = await callTasteProfile(payload);
  const profile = parseTasteProfile(raw);
  if (!profile) throw new Error('The model didn’t return a usable profile. Try again.');

  const { data: sessionData } = await supabase.auth.getSession();
  const ownerId = sessionData.session?.user.id;
  if (!ownerId) throw new Error('You’re not signed in.');

  const generatedAt = new Date().toISOString();
  const { error } = await supabase.from('taste_profiles').upsert({
    user_id: ownerId,
    profile,
    source_fingerprint: fingerprint,
    generated_at: generatedAt,
  });
  if (error) throw error;

  // setQueryData, not invalidateQueries: we know exactly what was just written, and the card is on
  // screen waiting for it. An invalidation would spend another round trip to be told the same
  // thing — which on this backend is a real ~350ms the user watches a spinner for.
  queryClient.setQueryData<StoredTasteProfile>(libraryKeys.taste(ownerId), {
    profile,
    generatedAt,
    sourceFingerprint: fingerprint,
  });
  return profile;
}
