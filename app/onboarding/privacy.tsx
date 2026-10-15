// The privacy notice, and the one-time consent gate in front of it — plan 1 step 5½.
//
// Two jobs, one screen, told apart by whether this account has already consented:
//   - Not consented: the app is gated behind this screen (app/(tabs)/index.tsx redirects here), so
//     it shows an Accept button and nothing else to press. Consent has to come *before* step 6
//     ever sends anything out of the app — consent that arrives after the data has gone is not
//     consent.
//   - Already consented: the same text, reachable from the Account screen at any time, with the
//     date it was accepted instead of a button. The notice has to stay readable after the fact,
//     not only at the moment it's demanded.
//
// The wording is deliberately specific about what leaves the app and to whom, and deliberately
// claims nothing over the user's data that MyAnimeList's own policy wouldn't allow (their
// agreement, §4(f), requires this notice be no less protective than theirs). The "delete
// everything" action itself lives on the Account screen, next to the rest of the account
// lifecycle; this screen only points at it.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { useAccountSession } from '@/account/accountRepository';
import { MalAttribution } from '@/components/MalAttribution';
import { markPrivacyConsent, usePrivacyConsent } from '@/repositories/AnimeRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { layout, radii, spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

export default function PrivacyScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const router = useRouter();
  const { session } = useAccountSession();
  const consented = usePrivacyConsent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the gate in app/(tabs)/index.tsx stops firing, so replace (not push) back to the
  // Library — the notice must not sit in the back stack for someone to swipe back into.
  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      await markPrivacyConsent();
      router.replace('/');
    } catch (e) {
      setError(userFacingMessage(e, 'Couldn’t save that. Check your connection and try again.'));
      setBusy(false);
    }
  }

  // Tri-state: null means we don't know yet (see usePrivacyConsent). Showing the Accept button
  // while it's unknown would offer to re-record consent that already exists.
  if (!session || consented === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={styles.title}>
        Your data
      </Text>

      <Text variant="titleSmall" style={styles.heading}>
        What this app stores
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        Your library — the series you track, which seasons you’ve watched, and what you’ve liked or
        dropped. If you link MyAnimeList, your MyAnimeList user id and the access tokens that let
        this app read your list; those are held on the server and never stored on your device. If
        you signed up with an email address, that too. There is no analytics, advertising or
        tracking of any kind.
      </Text>

      <Text variant="titleSmall" style={styles.heading}>
        What leaves the app
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        MyAnimeList, for the anime details and recommendations you see, and — only when you ask it
        to — your own list when you export to them. Recommendations also send a de-identified list
        of anime titles and genres to an AI provider (Groq): no email, no account id, nothing that
        identifies you. Your library is private to your account. It is never shared with other
        accounts or sold. Nothing is published unless you publish it yourself — see below.
      </Text>

      {/* Plan 4 step 4. §4(f) requires the notice cover this, and it has to be written so that
          someone who reads it is not surprised by anything the feature does: what a link exposes,
          that it needs no account to open, that it stays live until revoked, and that revoking is
          immediate. Copy that overstated what stays private would be worse than none — which is
          why the paragraph above had to change in the same breath. */}
      <Text variant="titleSmall" style={styles.heading}>
        Sharing your list
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        “Share your list” creates a web link to your library. Anyone who has that link can open it
        in a browser and see every show on your list and its status — no account, no app and no
        MyAnimeList login needed — and they can pass it on. The page never shows your email
        address, your MyAnimeList username or your account id; the only name on it is one you type
        yourself, and you can leave that blank.
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        The link is unlisted — it is a long random address, it is not listed anywhere, and search
        engines are asked not to index it. It stays live until you press “Stop sharing”, which
        takes effect immediately and kills that address for good; sharing again gives you a
        different one. Nothing about who opens the page is recorded.
      </Text>

      <Text variant="titleSmall" style={styles.heading}>
        Deleting it
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        “Delete everything” on the Account screen removes your library, your MyAnimeList link and
        this account itself, permanently and immediately. It does not change your list on
        MyAnimeList — that list is yours and stays exactly as it is. If you were sharing a link, it
        stops working too.
      </Text>

      <Text variant="bodySmall" style={styles.footnote}>
        AnimeTracker is a personal, non-commercial app. Anime data comes from MyAnimeList and
        remains subject to MyAnimeList’s own privacy policy and terms.
      </Text>

      {error && (
        <Text variant="bodyMedium" style={styles.error}>
          {error}
        </Text>
      )}

      {consented ? (
        <Text variant="bodySmall" style={styles.footnote}>
          You accepted this notice on this account.
        </Text>
      ) : (
        <Button
          mode="contained"
          onPress={handleAccept}
          loading={busy}
          disabled={busy}
          buttonColor={colors.primary}
          style={styles.button}
        >
          I understand — continue
        </Button>
      )}

      <MalAttribution />
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  // See account.tsx's twin of this pair for why the background and the cap are two styles.
  screen: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.sm,
    width: '100%',
    maxWidth: layout.onboardingColumn,
    alignSelf: 'center',
  },
  title: { color: colors.textPrimary, marginBottom: spacing.xs },
  heading: { color: colors.textPrimary, marginTop: spacing.sm },
  body: { color: colors.textPrimary },
  footnote: { color: colors.textMuted, marginTop: spacing.sm },
  error: { color: colors.red, marginTop: spacing.sm },
  button: { borderRadius: radii.pill, marginTop: spacing.md },
}));
