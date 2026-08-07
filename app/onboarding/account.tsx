// Email/password account screen — Phase 7's "Create account" path (see CLAUDE.md's account
// model). Reachable from the login screen and, once signed in, from the Library's more-menu.
//
// Phase 8 adds "Link MyAnimeList" here for a signed-in account that doesn't have one yet (an
// account created via "Continue with MyAnimeList" already does, and this screen doesn't offer to
// re-link it — see src/account/malLinkRepository.ts's linkMalAccount, the authenticated variant of
// the same OAuth flow used by the login screen's sign-in variant). Sync itself (Phase 9/10) still
// isn't wired up — MAL data an account gains here is real (Import/Push work once linked), but
// doesn't yet follow the account across devices.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { logInWithEmail, logOutAccount, signUpWithEmail, useAccountSession } from '@/account/accountRepository';
import { linkMalAccount, useMalLinkStatus } from '@/account/malLinkRepository';
import { colors, radii, spacing } from '@/theme/colors';

export default function AccountScreen() {
  const { session, loading } = useAccountSession();
  const [malLinked, refreshMalLinked] = useMalLinkStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignUp() {
    setBusy(true);
    setMessage(null);
    const result = await signUpWithEmail(email.trim(), password);
    setBusy(false);
    setMessage(result.success ? 'Account created — check your email to confirm, then log in.' : result.message);
  }

  async function handleLogIn() {
    setBusy(true);
    setMessage(null);
    const result = await logInWithEmail(email.trim(), password);
    setBusy(false);
    if (!result.success) setMessage(result.message);
  }

  async function handleLogOut() {
    setBusy(true);
    await logOutAccount();
    setBusy(false);
  }

  async function handleLinkMal() {
    setBusy(true);
    setMessage(null);
    const result = await linkMalAccount();
    setBusy(false);
    if (result.success) refreshMalLinked();
    else setMessage(result.message);
  }

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.container}>
        <Text variant="bodyLarge" style={styles.centerText}>
          Accounts aren’t set up yet.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.container} />;
  }

  if (session) {
    return (
      <View style={styles.container}>
        <Text variant="titleMedium">Signed in as</Text>
        <Text variant="bodyLarge" style={styles.emailText}>
          {session.user.email}
        </Text>
        {message && (
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>
        )}
        {malLinked === false && (
          <>
            <Text variant="bodySmall" style={styles.hint}>
              Link MyAnimeList to import your list and update it from here.
            </Text>
            <Button mode="contained" onPress={handleLinkMal} loading={busy} disabled={busy} buttonColor={colors.primary} style={styles.button}>
              Link MyAnimeList
            </Button>
          </>
        )}
        {malLinked === true && (
          <Text variant="bodySmall" style={styles.hint}>
            MyAnimeList is linked to this account.
          </Text>
        )}
        {/* Syncing your library across devices (Phase 9/10) isn't wired up yet — MAL data this
            account gains (once linked) is real, it just doesn't follow you across devices yet. */}
        <Button mode="outlined" onPress={handleLogOut} loading={busy} disabled={busy} style={styles.button}>
          Log out
        </Button>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        Create an account, or log in to an existing one
      </Text>
      <Text variant="bodySmall" style={styles.hint}>
        This is separate from MyAnimeList — an account here doesn’t need or import a MAL list. You can link
        MyAnimeList to it later.
      </Text>
      <TextInput
        mode="outlined"
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        style={styles.input}
      />
      <TextInput
        mode="outlined"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />
      {message && (
        <Text variant="bodyMedium" style={styles.message}>
          {message}
        </Text>
      )}
      <Button
        mode="contained"
        onPress={handleLogIn}
        loading={busy}
        disabled={busy || !email || !password}
        buttonColor={colors.primary}
        style={styles.button}
      >
        Log in
      </Button>
      <Button mode="text" onPress={handleSignUp} disabled={busy || !email || !password} style={styles.button}>
        Create account
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  centerText: { textAlign: 'center', marginTop: spacing.xl },
  title: { color: colors.textPrimary },
  hint: { color: colors.textMuted },
  emailText: { color: colors.textPrimary },
  input: { backgroundColor: colors.surface },
  message: { color: colors.textMuted },
  button: { borderRadius: radii.pill },
});
