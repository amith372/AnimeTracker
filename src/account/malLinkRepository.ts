// Native (iOS/Android) implementation — orchestrates both variants of the server-terminated MAL
// OAuth flow (see the plan doc's §1 and supabase/functions/mal-oauth-start|callback|session-exchange):
// "Continue with MyAnimeList" (sign-in — creates/finds the Supabase account) and "Link MyAnimeList"
// (attaches MAL to an already-signed-in account). Both share the same browser-round-trip shape as
// the old, now-deleted src/auth/authRepository.ts's login(): open the authorize URL, await the
// redirect, done — the PKCE verifier/state never touch this device at all anymore (they live
// server-side, in mal_oauth_sessions), so there's nothing here to persist across an Activity kill
// the way the old Kotlin app once had to.
//
// Metro resolves `.web.ts` over this bare file on web builds — see malLinkRepository.web.ts for
// that platform's popup+postMessage equivalent, and malLinkStatus.ts for the platform-agnostic
// status queries both files re-export.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { callMalOauthStart } from '@/api/edgeFunctions';
import type { MalLinkResult } from './malLinkStatus';

export type { MalLinkResult } from './malLinkStatus';
export { isMalLinked, useMalLinkStatus } from './malLinkStatus';

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
