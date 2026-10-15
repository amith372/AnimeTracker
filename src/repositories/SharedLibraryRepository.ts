// Reading a public share link — plan 4 step 3 / prd/2-public-share.md.
//
// The viewer's side of the feature, and the only repository here that reads data belonging to
// someone other than the person holding the device. It has no writes at all: the page is read-only
// by design (the PRD's scope puts every viewer write out), so there is nothing optimistic to roll
// back and no cache to invalidate.
//
// Unlike every other query in the app, this one is **not keyed by account**. There is no account —
// the whole point is that a stranger can open it — so it sits under its own `['shared-library',
// slug]` root rather than under `libraryKeys.root`, which sign-out wipes. A viewer never signs
// out, and a sharer who does must not take the page they were looking at with them.
import { useQuery } from '@tanstack/react-query';
import { callSharedLibrary } from '@/api/edgeFunctions';
import { toSharedLibrary, type SharedLibrary, type SharedLibraryPayload } from './sharedLibraryMapping';

/** One query per slug. Not under libraryKeys — see the header. */
export const sharedLibraryKey = (slug: string) => ['shared-library', slug] as const;

export interface SharedLibraryView {
  library: SharedLibrary | null;
  /** True when the slug resolved to nothing: revoked, mistyped, or never real. The page treats all
   * three identically on purpose — telling a stranger which slugs were once real is an enumeration
   * gift for no benefit (the PRD's edge case). */
  notShared: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * The public page's one read. `notShared` is a separate flag rather than an error because the two
 * need different pages: a revoked link gets a plain sentence and no retry button, while a dropped
 * connection gets a retry — and conflating them is how a viewer ends up being told a live list
 * doesn't exist because their train went into a tunnel.
 */
export function useSharedLibrary(slug: string | undefined): SharedLibraryView {
  const query = useQuery({
    queryKey: sharedLibraryKey(slug ?? ''),
    queryFn: async () => {
      const payload = await callSharedLibrary(slug!);
      // null is the function's 404 — mapped to null here too, and read as `notShared` below.
      // `undefined` would be indistinguishable from "still loading" in TanStack's cache, so the
      // absence has to be an explicit null.
      return payload === null ? null : toSharedLibrary(payload as SharedLibraryPayload);
    },
    enabled: !!slug,
    // One retry, like the app's default. A page that retries a 404 would spend a stranger's time
    // re-asking a question already answered, but callSharedLibrary returns rather than throwing
    // for that case, so a retry here only ever follows a real failure.
    retry: 1,
  });

  return {
    library: query.data ?? null,
    notShared: query.isSuccess && query.data === null,
    isLoading: !slug || query.isPending,
    error: (query.error as Error | null) ?? null,
    refetch: () => void query.refetch(),
  };
}
