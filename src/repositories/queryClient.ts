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
};
