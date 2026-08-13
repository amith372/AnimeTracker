// Email/password account screen — Phase 7's "Create account" path (see CLAUDE.md's account
// model). Reachable from the login screen and, once signed in, from the Library's more-menu.
//
// Also where "Link MyAnimeList" lives for a signed-in account that doesn't have one yet (an
// account created via "Continue with MyAnimeList" already does, and this screen doesn't offer to
// re-link it — see src/account/malLinkRepository.ts's linkMalAccount, the authenticated variant of
// the same OAuth flow used by the login screen's sign-in variant).
//
// Three render branches, not two: a real signed-in account, a guest (anonymous session — see
// src/account/guestMode.ts), and signed-out. The guest branch is what lets someone who started
// without an account upgrade in place, keeping everything they already tracked.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { logInWithEmail, logOutAccount, signUpWithEmail, useAccountSession } from '@/account/accountRepository';
import { useIsGuest } from '@/account/guestMode';
import { linkMalAccount, useMalLinkStatus } from '@/account/malLinkRepository';
import { colors, radii, spacing } from '@/theme/colors';

export default function AccountScreen() {
  const { session, loading } = useAccountSession();
  const isGuest = useIsGuest();
  const [malLinked, refreshMalLinked] = useMalLinkStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // For a real (non-guest) signup this creates a brand-new account, same as always. For a guest
  // (anonymous session), signUpWithEmail instead *upgrades* that same session in place — see its
  // own comment — so this doubles as "convert your guest library to a real account".
  async function handleSignUp() {
    setBusy(true);
    setMessage(null);
    const result = await signUpWithEmail(email.trim(), password);
    setBusy(false);
    setMessage(
      result.success
        ? isGuest
          ? 'Account created — your list is saved to it. Check your email if a confirmation is needed.'
          : 'Account created — check your email to confirm, then log in.'
        : result.message,
    );
  }

  async function handleLogIn() {
    setBusy(true);
    setMessage(null);
    const result = await logInWithEmail(email.trim(), password);
    setBusy(false);
    if (!result.success) setMessage(result.message);
  }

  // For a real account this ends the session outright. For a guest (anonymous session) this is
  // effectively "discard this guest library" — there's no way back into the same anonymous
  // identity once its session is gone, which is the intended lifespan (see guestMode.ts).
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

  if (loading || isGuest === null) {
    return <View style={styles.container} />;
  }

  // A guest (anonymous session, see guestMode.ts) — full read/write access to a real library, but
  // no email/password yet. Two ways to make it permanent: link MyAnimeList (works unchanged, it
  // attaches to whichever session is currently signed in), or set an email/password below, which
  // upgrades this same session in place rather than starting a new one — either way nothing already
  // added is lost. The only way to lose it is "Leave guest mode" below.
  if (session && isGuest) {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text variant="titleMedium" style={styles.title}>
          Browsing as a guest
        </Text>
        <Text variant="bodySmall" style={styles.hint}>
          Your list is real and saved, but only to this device's guest session — set a password or
          link MyAnimeList below to keep it for good.
        </Text>
        {malLinked === false && (
          <Button mode="contained" onPress={handleLinkMal} loading={busy} disabled={busy} buttonColor={colors.primary} style={styles.button}>
            Link MyAnimeList
          </Button>
        )}
        {malLinked === true && (
          <Text variant="bodySmall" style={styles.hint}>
            MyAnimeList is linked to this account.
          </Text>
        )}
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
          onPress={handleSignUp}
          loading={busy}
          disabled={busy || !email || !password}
          buttonColor={colors.primary}
          style={styles.button}
        >
          Create account
        </Button>
        <Button mode="outlined" onPress={handleLogOut} loading={busy} disabled={busy} style={styles.button}>
          Leave guest mode (discards this list)
        </Button>
      </ScrollView>
      </KeyboardAvoidingView>
    );
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
        <Button mode="outlined" onPress={handleLogOut} loading={busy} disabled={busy} style={styles.button}>
          Log out
        </Button>
      </View>
    );
  }

  return (
    // KeyboardAvoidingView, because this screen is a password field near the bottom of a scroll
    // view: on iOS nothing moves out of the keyboard's way on its own, so the field being typed
    // into and the button that submits it could both sit behind it. Android's adjustResize already
    // handles this, hence the platform-conditional behavior rather than a blanket 'padding'.
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  centerText: { textAlign: 'center', marginTop: spacing.xl },
  title: { color: colors.textPrimary },
  hint: { color: colors.textMuted },
  emailText: { color: colors.textPrimary },
  input: { backgroundColor: colors.surface },
  message: { color: colors.textMuted },
  button: { borderRadius: radii.pill },
});
