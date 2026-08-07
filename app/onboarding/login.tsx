// Login screen — the RN equivalent of the old LoginScreen.kt. Shown whenever index.tsx's auth
// gate finds no stored access token; on success it navigates back to the Library.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { continueAsGuest, login } from '@/auth/authRepository';
import { AtLogoMark } from '@/components/AtLogoMark';
import { MalAttribution } from '@/components/MalAttribution';
import { colors, radii } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    const result = await login();
    setLoading(false);
    if (result.success) {
      router.replace('/');
    } else {
      setError(result.message);
    }
  }

  // Skips MAL entirely — index.tsx's gate routes a guest straight to an empty library instead of
  // onboarding/reconcile, which needs a MAL list to import. Discover still works (MAL's browse/
  // search endpoints don't require a signed-in user), so a guest can build a library by hand.
  async function handleContinueAsGuest() {
    await continueAsGuest();
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
        Log in with MyAnimeList
      </Button>
      <Button mode="text" onPress={handleContinueAsGuest} disabled={loading}>
        Continue without an account
      </Button>
      {/* Separate from MAL login — see app/onboarding/account.tsx. Doesn't require or import a
          MAL list; MyAnimeList can be linked to it later. */}
      <Button mode="text" onPress={() => router.push('/onboarding/account')} disabled={loading}>
        Or create/log into an account
      </Button>
      <View style={styles.attribution}>
        <MalAttribution />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: colors.background },
  title: { fontFamily: fontFamilies.displayBlack, color: colors.textPrimary },
  subtitle: { textAlign: 'center', color: colors.textMuted },
  error: { color: colors.red, textAlign: 'center' },
  loginButton: { borderRadius: radii.pill, minWidth: 240 },
  attribution: { position: 'absolute', bottom: 24 },
});
