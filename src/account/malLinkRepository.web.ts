// Web implementation — same two flows as malLinkRepository.ts (native), but the redirect can't use
// a custom URL scheme deep link (animetracker://auth has no meaning in a browser), so
// mal-oauth-callback's web variant instead 302-redirects the popup to this app's own
// /oauth-complete route once MAL is done, which posts a message back to whichever window/tab opened
// it and closes itself (see app/oauth-complete.tsx — and its header comment for why the callback
// function doesn't just return that HTML directly anymore). This file is the window.open() +
// window.addEventListener('message', ...) counterpart to catch that.
//
// Deliberately NOT expo-web-browser's openAuthSessionAsync: its web implementation expects the
// *popup itself* to call WebBrowser.maybeCompleteAuthSession() (a different postMessage shape,
// keyed by a client-generated handle in localStorage) — the popup here lands on a plain app route,
// not something that calls that API, so it can't do that. The custom listener below matches the
// `{ source: 'animetracker-mal-auth', ... }` shape app/oauth-complete.tsx actually sends.
import { callMalOauthStart, callMalSessionExchange } from '@/api/edgeFunctions';
import { supabase } from './supabaseClient';
import type { MalLinkResult } from './malLinkStatus';

export type { MalLinkResult } from './malLinkStatus';
export { isMalLinked, useMalLinkStatus } from './malLinkStatus';

interface MalAuthMessage {
  source: 'animetracker-mal-auth';
  handoff?: string;
  linked?: string;
  malError?: string;
}

function isMalAuthMessage(data: unknown): data is MalAuthMessage {
  return typeof data === 'object' && data !== null && (data as { source?: unknown }).source === 'animetracker-mal-auth';
}

/**
 * Opens the MAL authorize URL in a popup and resolves once mal-oauth-callback's web HTML posts its
 * result back (or the popup is closed/blocked). A same-tab redirect was the other option per the
 * plan doc's open question; popup was chosen so the app tab itself never navigates away.
 */
function openMalAuthorizeFlow(): Promise<MalLinkResult> {
  return new Promise((resolve) => {
    let settled = false;
    let popup: Window | null = null;
    let pollClosed: ReturnType<typeof setInterval> | null = null;

    const finish = (result: MalLinkResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      if (pollClosed) clearInterval(pollClosed);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      // TEMP DEBUG (remove once the web login bug is found): log every message this window
      // receives, matched or not, so a mismatched origin/shape shows up instead of silently
      // vanishing.
      console.log('[MAL-OAUTH-DEBUG] message event received. origin=', event.origin, 'expected=', window.location.origin, 'data=', event.data);
      // The message now comes from our own /oauth-complete route (see that file's header comment
      // for why it's no longer served from *.supabase.co), so it's simply this app's own origin.
      if (event.origin !== window.location.origin) {
        console.log('[MAL-OAUTH-DEBUG] rejected: origin mismatch');
        return;
      }
      if (!isMalAuthMessage(event.data)) {
        console.log('[MAL-OAUTH-DEBUG] rejected: not a recognized message shape');
        return;
      }
      const data = event.data;
      if (data.malError) {
        console.log('[MAL-OAUTH-DEBUG] malError branch:', data.malError);
        finish({ success: false, message: data.malError });
      } else if (typeof data.linked === 'string') {
        console.log('[MAL-OAUTH-DEBUG] linked branch');
        finish({ success: true });
      } else if (typeof data.handoff === 'string') {
        console.log('[MAL-OAUTH-DEBUG] handoff branch, exchanging session...');
        // Sign-in variant: trade the one-time handoff code for a real session, same exchange
        // app/auth.tsx performs for the mobile deep-link path.
        callMalSessionExchange(data.handoff)
          .then(({ session }) => {
            console.log('[MAL-OAUTH-DEBUG] handoff exchanged for session, calling setSession...');
            return supabase.auth.setSession(session);
          })
          .then(({ error }) => {
            console.log('[MAL-OAUTH-DEBUG] setSession result, error=', error);
            if (error) throw error;
            finish({ success: true });
          })
          .catch((e) => {
            console.log('[MAL-OAUTH-DEBUG] handoff exchange failed:', e);
            finish({ success: false, message: e instanceof Error ? e.message : 'Login failed.' });
          });
      } else {
        console.log('[MAL-OAUTH-DEBUG] recognized shape but no branch matched:', data);
      }
    };
    window.addEventListener('message', onMessage);

    callMalOauthStart('web')
      .then(({ url }) => {
        console.log('[MAL-OAUTH-DEBUG] got authorize URL, opening popup. origin of url=', new URL(url).origin);
        popup = window.open(url, 'mal-oauth', 'width=500,height=650');
        console.log('[MAL-OAUTH-DEBUG] popup opened?', !!popup);
        if (!popup) {
          finish({ success: false, message: 'Popup was blocked — allow popups for this site and try again.' });
          return;
        }
        // Backstop for "user closed the popup without completing" — mal-oauth-callback's own HTML
        // always posts a message before closing itself, so this only fires on a genuine dismissal.
        pollClosed = setInterval(() => {
          if (popup?.closed) {
            console.log('[MAL-OAUTH-DEBUG] popup detected closed by poll, settled=', settled);
            finish({ success: false, message: 'Login was cancelled.' });
          }
        }, 500);
      })
      .catch((e) => {
        console.log('[MAL-OAUTH-DEBUG] mal-oauth-start failed:', e);
        finish({ success: false, message: e instanceof Error ? e.message : 'Login failed.' });
      });
  });
}

/** "Continue with MyAnimeList" — see malLinkRepository.ts's native version for the shared shape. */
export async function signInWithMal(): Promise<MalLinkResult> {
  return openMalAuthorizeFlow();
}

/** "Link MyAnimeList" — requires an existing Supabase session; mal-oauth-start's authenticated
 * variant runs automatically since supabase.functions.invoke attaches the current session. */
export async function linkMalAccount(): Promise<MalLinkResult> {
  return openMalAuthorizeFlow();
}
