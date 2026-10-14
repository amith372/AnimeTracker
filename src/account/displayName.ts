// The live half of plan 6's greeting — feeds the current Supabase session into the pure resolver
// in src/domain/displayName.ts. Split for the usual reason (see CLAUDE.md's state/reactivity
// model): the decision is pure and unit-tested, the session subscription is not.
import { resolveDisplayName } from '@/domain/displayName';
import { useAccountSession } from '@/account/accountRepository';

/**
 * The name to greet the signed-in user by, for the web sidebar.
 *
 * `loading` is distinct from a null name on purpose: the sidebar renders nothing at all while the
 * session resolves, rather than flashing "Guest" and then correcting itself a moment later. A
 * greeting that changes who it is addressing is worse than one that arrives a beat late.
 *
 * Reads `user_metadata.mal_username`, which mal-oauth-callback writes on every MAL sign-in or
 * link. No network call of its own: the session is already in memory.
 */
export function useDisplayName(): { name: string | null; loading: boolean } {
  const { session, loading } = useAccountSession();

  if (loading) return { name: null, loading: true };
  if (!session) return { name: null, loading: false };

  const metadata = session.user.user_metadata as { mal_username?: unknown } | null;
  const malUsername = typeof metadata?.mal_username === 'string' ? metadata.mal_username : null;

  return {
    name: resolveDisplayName({
      isAnonymous: session.user.is_anonymous ?? false,
      malUsername,
      email: session.user.email,
    }),
    loading: false,
  };
}
