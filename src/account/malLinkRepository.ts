// Orchestrates both variants of the server-terminated MAL OAuth flow (see the plan doc's §1 and
// supabase/functions/mal-oauth-start|callback|session-exchange): "Continue with MyAnimeList"
// (sign-in — creates/finds the Supabase account) and "Link MyAnimeList" (attaches MAL to an
// already-signed-in account). Both share the same browser-round-trip shape as the old, now-deleted
// src/auth/authRepository.ts's login(): open the authorize URL, await the redirect, done — the
// PKCE verifier/state never touch this device at all anymore (they live server-side, in
// mal_oauth_sessions), so there's nothing here to persist across an Activity kill the way the old
// Kotlin app once had to.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { callMalOauthStart } from '@/api/edgeFunctions';

export type MalLinkResult = { success: true } | { success: false; message: string };

// Only tells the caller whether the browser closed via the matching redirect vs. being dismissed —
// app/auth.tsx receives that same redirect through expo-router's own Linking handling and is what
// actually reads its params and decides where to go next (see its header comment for why).
async function openMalAuthorizeFlow(): Promise<{ cancelled: boolean }> {
  const redirectUri = Linking.createURL('auth');
  const { url } = await callMalOauthStart('mobile');
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  return { cancelled: result.type !== 'success' };
}

/**
 * "Continue with MyAnimeList" — no Supabase session needs to exist yet; one succeeds, the client
 * ends up signed in to whichever account (new or existing) that MAL identity resolves to.
 *
 * Only detects cancellation here. app/auth.tsx receives the same animetracker://auth redirect via
 * expo-router's own Linking handling — reliably before this function's own await resolves — and is
 * what actually exchanges the handoff code and calls setSession; see its header comment for why.
 */
export async function signInWithMal(): Promise<MalLinkResult> {
  try {
    const flow = await openMalAuthorizeFlow();
    if (flow.cancelled) return { success: false, message: 'Login was cancelled.' };
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Login failed.' };
  }
}

/**
 * "Link MyAnimeList" — requires an existing Supabase session; supabase.functions.invoke attaches it
 * automatically, so mal-oauth-start's authenticated variant runs (see its `getRequestUserId`).
 *
 * Only detects cancellation here, same reasoning as signInWithMal above: app/auth.tsx owns the
 * actual redirect (back to the account screen, where a fresh mount re-queries link status).
 */
export async function linkMalAccount(): Promise<MalLinkResult> {
  try {
    const flow = await openMalAuthorizeFlow();
    if (flow.cancelled) return { success: false, message: 'Linking was cancelled.' };
    return { success: true };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Linking failed.' };
  }
}

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
