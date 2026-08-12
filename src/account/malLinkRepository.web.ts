// Web implementation — same two flows as malLinkRepository.ts (native), but the redirect can't use
// a custom URL scheme deep link (animetracker://auth has no meaning in a browser), so
// mal-oauth-callback's web variant instead returns HTML that posts a message back to whichever
// window/tab opened it and closes itself (see that function's `webFinish`) — this file is the
// window.open() + window.addEventListener('message', ...) counterpart to catch that.
//
// Deliberately NOT expo-web-browser's openAuthSessionAsync: its web implementation expects the
// *popup itself* to call WebBrowser.maybeCompleteAuthSession() (a different postMessage shape,
// keyed by a client-generated handle in localStorage) — the popup here is server-rendered HTML
// from the Edge Function, not a page of this app, so it can't do that. The custom listener below
// matches the `{ source: 'animetracker-mal-auth', ... }` shape mal-oauth-callback actually sends.
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

// mal-oauth-callback's popup HTML is served from the Supabase project's own domain, not this app's
// origin — a same-origin check against window.location would reject every legitimate message. This
// is the actual origin to expect instead; the `source` marker above is the other half of the check.
const SUPABASE_ORIGIN = (() => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
})();

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
      if (SUPABASE_ORIGIN && event.origin !== SUPABASE_ORIGIN) return;
      if (!isMalAuthMessage(event.data)) return;
      const data = event.data;
      if (data.malError) {
        finish({ success: false, message: data.malError });
      } else if (typeof data.linked === 'string') {
        finish({ success: true });
      } else if (typeof data.handoff === 'string') {
        // Sign-in variant: trade the one-time handoff code for a real session, same exchange
        // app/auth.tsx performs for the mobile deep-link path.
        callMalSessionExchange(data.handoff)
          .then(({ session }) => supabase.auth.setSession(session))
          .then(({ error }) => {
            if (error) throw error;
            finish({ success: true });
          })
          .catch((e) => finish({ success: false, message: e instanceof Error ? e.message : 'Login failed.' }));
      }
    };
    window.addEventListener('message', onMessage);

    callMalOauthStart('web')
      .then(({ url }) => {
        popup = window.open(url, 'mal-oauth', 'width=500,height=650');
        if (!popup) {
          finish({ success: false, message: 'Popup was blocked — allow popups for this site and try again.' });
          return;
        }
        // Backstop for "user closed the popup without completing" — mal-oauth-callback's own HTML
        // always posts a message before closing itself, so this only fires on a genuine dismissal.
        pollClosed = setInterval(() => {
          if (popup?.closed) finish({ success: false, message: 'Login was cancelled.' });
        }, 500);
      })
      .catch((e) => finish({ success: false, message: e instanceof Error ? e.message : 'Login failed.' }));
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
