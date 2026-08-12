// Platform-agnostic half of the MAL link story — pure Supabase queries, no Linking/WebBrowser
// dependency, so it's shared verbatim by both malLinkRepository.ts (native) and
// malLinkRepository.web.ts (web) rather than duplicated. Split out specifically so those two
// platform-specific files can each do `export * from './malLinkStatus'` without a self-import
// cycle — Metro resolves the bare `./malLinkRepository` specifier to whichever platform file is
// currently being bundled, including from *within* that same file, so re-exporting from the
// platform file's own base name would recurse.
import { supabase } from './supabaseClient';
import { useCallback, useEffect, useState } from 'react';

export type MalLinkResult = { success: true } | { success: false; message: string };

/** One-shot check for non-component contexts (e.g. SyncRepository's monthly sync, which used to
 * gate on the old per-device isLoggedIn()). */
export async function isMalLinked(): Promise<boolean> {
  const { data } = await supabase.from('mal_link_status').select('user_id').maybeSingle();
  return data !== null;
}

/**
 * Reactive-ish MAL link status for the current account — one-shot-plus-manual-refresh, same shape
 * as the account/MAL hooks elsewhere in the app (no realtime source to subscribe to for this yet).
 * Reads `mal_link_status` (a view over mal_accounts with the token columns withheld — see the
 * Phase 8 migration) rather than mal_accounts directly, so this can never accidentally select a
 * token column even by future accident.
 */
export function useMalLinkStatus(): [boolean | null, () => void] {
  const [linked, setLinked] = useState<boolean | null>(null);
  const refresh = useCallback(() => {
    supabase
      .from('mal_link_status')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => setLinked(data !== null));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return [linked, refresh];
}
