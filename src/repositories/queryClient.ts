// TanStack Query singleton — the RN equivalent of src/account/supabaseClient.ts's `supabase`
// singleton, and (after the SQLite → direct-Postgres cutover) the closest thing this app has to
// Drizzle's `useLiveQuery`: the server is the source of truth, and this cache is what makes reads
// reactive without a round trip on every render.
//
// `staleTime: Infinity` is deliberate, not an oversight: freshness comes from Supabase Realtime
// (src/repositories/realtime.ts) invalidating queries when the server actually changes, not from
// polling. A finite staleTime would just mean occasionally refetching data that hasn't changed.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

// Central query-key registry for the library. Keyed by userId (not a fixed constant) so
// `removeQueries({ queryKey: libraryKeys.root })` on sign-out can drop every signed-in user's
// cached data in one call — without this, a fresh sign-in on the same device could briefly render
// the previous account's library before the first real fetch lands.
export const libraryKeys = {
  root: ['library'] as const,
  library: (userId: string) => ['library', userId] as const,
  meta: (userId: string) => ['library', userId, 'meta'] as const,
  // Plan 1 step 6's generated taste profile. Deliberately nested under the same ['library',
  // userId] root as the rest rather than given a root of its own: it is per-account data, and the
  // sign-out cleanup above drops everything under `root` in one call. A sibling root would need
  // its own removeQueries and would be forgotten exactly once — leaving one account's taste
  // description on screen after another signs in on the same device.
  taste: (userId: string) => ['library', userId, 'taste'] as const,
  // Plan 9 step 3's stored "For you" list. Under the same root, for the same reason as `taste`
  // above: it is derived from one account's library, and a list computed for one account must not
  // survive another signing in on the same device.
  recommendations: (userId: string) => ['library', userId, 'recommendations'] as const,
};
