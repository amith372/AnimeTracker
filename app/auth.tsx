// Redirect target for MAL's OAuth callback (animetracker://auth). expo-router's own Linking
// listener always lands here on the incoming deep link — independent of, and reliably faster than,
// WebBrowser.openAuthSessionAsync's promise resolving back in whichever screen originally opened
// the browser (src/account/malLinkRepository.ts's signInWithMal/linkMalAccount). That screen can
// already be unmounted (replaced by this one) by the time its own await continues, so relying on it
// to finish the sign-in — read the handoff code, exchange it, setSession, navigate — silently lost
// the result. This screen is the one reliable landing spot, so it does that work itself instead.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { callMalSessionExchange } from '@/api/edgeFunctions';
import { supabase } from '@/account/supabaseClient';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const { handoff, linked, malError } = useLocalSearchParams<{
    handoff?: string;
    linked?: string;
    malError?: string;
  }>();
  // Guards against the effect re-running on a benign param-identity change — the handoff code is
  // single-use server-side anyway, but a double-run would still waste a network round trip.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Could be a failed "Continue with MyAnimeList" or a failed "Link MyAnimeList" — the redirect
      // URL is identical for both (see mal-oauth-callback's finishError), so there's no way to tell
      // which screen to send the error back to. Login is the reasonable default landing spot.
      if (typeof malError === 'string') {
        router.replace({ pathname: '/onboarding/login', params: { error: malError } });
        return;
      }
      if (typeof handoff === 'string') {
        try {
          const { session } = await callMalSessionExchange(handoff);
          const { error } = await supabase.auth.setSession(session);
          if (error) throw error;
          router.replace('/');
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Login failed.';
          router.replace({ pathname: '/onboarding/login', params: { error: message } });
        }
        return;
      }
      if (linked === '1') {
        // No client-side state to change — mal-oauth-callback already attached MAL to the signed-in
        // account server-side. A fresh mount of the account screen re-queries mal_link_status itself.
        router.replace('/onboarding/account');
        return;
      }
      router.replace('/');
    })();
  }, [handoff, linked, malError, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
