// Email/password account screen — Phase 7's "Create account" path (see CLAUDE.md's account
// model). Reachable from the login screen and, once signed in, from the Library's more-menu.
// Doesn't gate anything yet: an app account has no functional effect until Phase 8 (optional MAL
// link) and Phase 9/10 (sync) land, so this screen intentionally stays outside index.tsx's
// login/import redirect chain — creating or logging into one is a side action, not a replacement
// for MAL login or guest mode.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { logInWithEmail, logOutAccount, signUpWithEmail, useAccountSession } from '@/account/accountRepository';
import { colors, radii, spacing } from '@/theme/colors';

export default function AccountScreen() {
  const { session, loading } = useAccountSession();
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
        {/* MAL linking (Phase 8) and sync (Phase 9/10) aren't wired up yet — for now this screen
            only proves the account itself works end to end. */}
        <Text variant="bodySmall" style={styles.hint}>
          Syncing your library across devices and linking MyAnimeList to this account are coming in a later
          update — for now this just keeps you signed in.
        </Text>
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
