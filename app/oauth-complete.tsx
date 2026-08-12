// Landing page for the web MAL OAuth popup (see src/account/malLinkRepository.web.ts).
// mal-oauth-callback redirects the popup here after MAL finishes, rather than returning executable
// HTML directly from *.supabase.co: Supabase's Edge Function gateway strips the Content-Type and
// injects a `sandbox` Content-Security-Policy on any HTML-ish function response (an anti-XSS
// hardening against *.supabase.co being used to host arbitrary live/scripted pages), so a
// <script>-based postMessage/close handoff can't run from that domain at all. This route runs on
// our own origin instead, where no such restriction applies. Native never lands here — its redirect
// target is the animetracker:// deep link, handled by app/auth.tsx.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function OAuthCompleteScreen() {
  const router = useRouter();
  const { handoff, linked, malError } = useLocalSearchParams<{
    handoff?: string;
    linked?: string;
    malError?: string;
  }>();
  // Same double-invoke guard as app/auth.tsx — postMessage/close is idempotent-unsafe enough to be
  // worth it even though this effect is cheap.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const payload: Record<string, string> = {};
    if (typeof handoff === 'string') payload.handoff = handoff;
    if (linked === '1') payload.linked = '1';
    if (typeof malError === 'string') payload.malError = malError;

    if (typeof window !== 'undefined' && window.opener) {
      // Popup and opener are guaranteed same-origin (both served from this app's own domain), so
      // targeting window.location.origin here is exactly the opener's origin too.
      window.opener.postMessage({ source: 'animetracker-mal-auth', ...payload }, window.location.origin);
      window.close();
    } else {
      // No opener — e.g. the popup got detached from its opener, or something opened this URL
      // directly. Land on the account screen with the same params rather than stranding the user on
      // a blank page; malLinkRepository.web.ts's own popup-blocked handling covers the common case
      // (no popup opened at all) separately.
      router.replace({ pathname: '/onboarding/account', params: payload });
    }
  }, [handoff, linked, malError, router]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
