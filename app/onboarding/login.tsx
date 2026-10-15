// Login screen — the RN equivalent of the old LoginScreen.kt. Shown whenever index.tsx's gate
// finds no Supabase session and no guest flag; on success it navigates back to the Library.
//
// Phase 8: "Log in with MyAnimeList" is now the sign-in-with-MAL flow (signInWithMal) — it creates
// or finds a Supabase account automatically from the MAL identity, so it both logs in *and* links
// MAL in one step (see src/account/malLinkRepository.ts and CLAUDE.md's account model). Someone who
// wants an account with no MAL data at all still has the separate email/password path below.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { signInWithMal } from '@/account/malLinkRepository';
import { continueAsGuest } from '@/account/guestMode';
import { AtLogoMark } from '@/components/AtLogoMark';
import { MalAttribution } from '@/components/MalAttribution';
import { layout, radii } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';
import { fontFamilies } from '@/theme/fonts';

export default function LoginScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const router = useRouter();
  // app/auth.tsx lands the user back here (a fresh mount) with `error` set when the MAL OAuth
  // redirect it received couldn't be turned into a session — see its header comment for why that
  // screen, not this one's own signInWithMal() await, owns reporting the outcome.
  const { error: routedError } = useLocalSearchParams<{ error?: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(routedError ?? null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const result = await signInWithMal();
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    // Native's signInWithMal() resolves via app/auth.tsx, which has already navigated to '/' by the
    // time this await returns (see its header comment) — so this call is a no-op there. Web's
    // resolves from malLinkRepository.web.ts's postMessage listener instead, which only updates the
    // Supabase session and never navigates anything itself; without this, a successful web login
    // just leaves the user sitting on this same screen looking unchanged (session updated, but
    // nothing ever redirects away from it) — same fix handleContinueAsGuest already has below.
    router.replace('/');
  }

  // Anonymous Supabase auth (see guestMode.ts) — a guest gets a real, if temporary, session and
  // therefore a real working library (add/track/mark, all of it), not just a read-only browse.
  // index.tsx's gate routes them straight past onboarding/reconcile, which needs a linked MAL
  // account to import from — Discover/Add still work, so a guest can build a library by hand.
  async function handleContinueAsGuest() {
    setLoading(true);
    setError(null);
    const result = await continueAsGuest();
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    router.replace('/');
  }

  return (
    <View style={styles.container}>
      <AtLogoMark size={76} />
      <Text variant="headlineMedium" style={styles.title}>
        AnimeTracker
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Track your anime watch progress using your MyAnimeList list.
      </Text>
      {error && (
        <Text variant="bodyMedium" style={styles.error}>
          {error}
        </Text>
      )}
      <Button
        mode="contained"
        onPress={handleLogin}
        loading={loading}
        disabled={loading}
        style={styles.loginButton}
        buttonColor={colors.primary}
      >
        Continue with MyAnimeList
      </Button>
      <Button mode="text" onPress={handleContinueAsGuest} disabled={loading}>
        Continue without an account
      </Button>
      {/* Disclosed here, where the risk is actually taken, rather than only at the exit where it
          is too late to have chosen otherwise. A guest session is a real, anonymous Supabase
          account (guestMode.ts): it survives restarts, but there is no password or email to sign
          back into it with, so anything signing it out — including logging into a real account
          from the Account screen — strands the list for good. One line, not a dialog: this is the
          safe, reversible choice at the moment it is made, and it should stay one tap. */}
      <Text variant="bodySmall" style={styles.guestNote}>
        A guest list has no email or password to sign back in with, so signing out loses it. You can
        turn it into a real account later from Account, and keep everything you&apos;ve tracked.
      </Text>
      {/* Separate from MAL sign-in above — see app/onboarding/account.tsx. Doesn't require or
          import a MAL list; MyAnimeList can be linked to it later from that screen. */}
      <Button mode="text" onPress={() => router.push('/onboarding/account')} disabled={loading}>
        Or create/log into an account
      </Button>
      <View style={styles.attribution}>
        <MalAttribution />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.background },
  title: { fontFamily: fontFamilies.displayBlack, color: colors.textPrimary },
  // This screen already centred its column, so the controls were never the problem — they
  // shrink-wrap. The two text blocks do not: an error from the server (now shown verbatim where a
  // function wrote it for the user) would otherwise set as one line the full width of the window.
  subtitle: { textAlign: 'center', color: colors.textMuted, maxWidth: layout.onboardingColumn },
  error: { color: colors.red, textAlign: 'center', maxWidth: layout.onboardingColumn },
  loginButton: { borderRadius: radii.pill, minWidth: 240 },
  // Capped and pulled up tight under the guest button it qualifies — the container's 16px gap
  // would otherwise read it as a fourth, unrelated choice rather than a note on the third.
  guestNote: { textAlign: 'center', color: colors.textMuted, maxWidth: layout.onboardingColumn, marginTop: -12 },
  attribution: { position: 'absolute', bottom: 24 },
}));
