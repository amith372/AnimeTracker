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
//
// The two signed-in branches get *different* exits, which is the one place they deliberately
// diverge. A real account has two genuinely different actions — log out ends a session you can
// come back to, Delete everything erases the library and the auth.users row. For a guest that
// difference collapses: an anonymous session can never be signed into again, so signing out
// abandons the rows on the server forever while deleting erases them, and the only thing that
// differs is invisible to the person choosing. So the guest branch has exactly one exit and it is
// the one that deletes.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { deleteAccountAndData, logInWithEmail, logOutAccount, signUpWithEmail, useAccountSession } from '@/account/accountRepository';
import { useIsGuest } from '@/account/guestMode';
import { linkMalAccount, useMalLinkStatus } from '@/account/malLinkRepository';
import { useLibrary } from '@/repositories/AnimeRepository';
import { layout, radii, spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

// The words on the destructive exit, which are the whole difference between the two signed-in
// branches (see the header). A pair of constants rather than inline strings so neither branch can
// quietly end up with the other's wording — for a guest, "account" and "log out" are both false,
// and this dialog is now the only thing between them and a permanent delete.
type DeleteWording = {
  button: string;
  title: string;
  // Reads first: what is, and isn't, being deleted.
  scope: string;
  // Reads second: why it can't be undone.
  warning: string;
  confirm: string;
};

const ACCOUNT_DELETE_WORDING: DeleteWording = {
  button: 'Delete everything',
  title: 'Delete everything?',
  scope:
    'This deletes everything this app stores — your library, your MyAnimeList link and the account itself. ' +
    'Your list on MyAnimeList is not touched; it stays exactly as it is on their site.',
  warning: 'It can’t be undone.',
  confirm: 'Delete everything',
};

const GUEST_DELETE_WORDING: DeleteWording = {
  button: 'Leave guest mode and delete this list',
  title: 'Leave guest mode and delete this list?',
  scope:
    'This deletes what this app has stored for your guest session — the shows you’ve tracked here and your ' +
    'MyAnimeList link. Your list on MyAnimeList is not touched; it stays exactly as it is on their site.',
  warning: 'A guest list can’t be signed into again, so this can’t be undone.',
  confirm: 'Delete this list',
};

export default function AccountScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { session, loading } = useAccountSession();
  const isGuest = useIsGuest();
  const [malLinked, refreshMalLinked] = useMalLinkStatus();
  // Only so the delete dialog can name how many shows are at stake — see trackedCountLine below.
  const { series: librarySeries, isLoading: libraryLoading, error: libraryError } = useLibrary();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Behind a confirmation dialog for the same reason the MAL push is (CLAUDE.md §8): this is
  // irreversible, and it is the user's whole library.
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const router = useRouter();

  // For a real (non-guest) signup this creates a brand-new account, same as always. For a guest
  // (anonymous session), signUpWithEmail instead *upgrades* that same session in place — see its
  // own comment — so this doubles as "convert your guest library to a real account".
  async function handleSignUp() {
    setBusy(true);
    setMessage(null);
    const result = await signUpWithEmail(email.trim(), password);
    setBusy(false);
    if (!result.success) {
      setMessage(result.message);
      return;
    }
    // Only mention email when a confirmation is genuinely pending — signUpWithEmail reads that off
    // the response rather than guessing. With confirmation off the session is live already and
    // useAccountSession has swapped this screen to its signed-in branch by now, so the guest wording
    // ("your list is saved") is the only message that still has somewhere to show.
    if (!result.needsConfirmation) {
      setMessage(isGuest ? 'Account created — your list is saved to it.' : 'Account created — you’re signed in.');
      return;
    }
    setMessage(
      isGuest
        ? 'Almost there — confirm the link we emailed you to finish setting up your account.'
        : 'Account created — check your email to confirm, then log in.',
    );
  }

  async function handleLogIn() {
    setBusy(true);
    setMessage(null);
    const result = await logInWithEmail(email.trim(), password);
    setBusy(false);
    if (!result.success) setMessage(result.message);
  }

  // The real-account branch's exit only. A guest never reaches this: signing out of an anonymous
  // session abandons its rows on the server with no way back into the same identity, which is the
  // silent half of the exit problem described in the header — so the guest branch offers
  // handleDeleteEverything instead.
  async function handleLogOut() {
    setBusy(true);
    await logOutAccount();
    setBusy(false);
  }

  // Plan 1 step 5½. deleteAccountAndData signs out on both outcomes, so on success this screen's
  // own session goes null and it re-renders as the signed-out branch while the Library's gate sends
  // the user back to login — nothing to navigate here. A failure keeps its message on screen.
  async function handleDeleteEverything() {
    setDeleteConfirmVisible(false);
    setBusy(true);
    setMessage(null);
    const result = await deleteAccountAndData();
    setBusy(false);
    if (!result.success) setMessage(result.message);
  }

  async function handleLinkMal() {
    setBusy(true);
    setMessage(null);
    const result = await linkMalAccount();
    setBusy(false);
    if (result.success) refreshMalLinked();
    else setMessage(result.message);
  }

  // The concrete stake, named in the dialog rather than left to the prose: "deletes your library"
  // is abstract where "47 shows" is not, and this dialog is the only thing standing between a
  // guest and a permanent delete. Reads the same TanStack Query the Library screen already holds,
  // so on a warm cache it costs no extra round trip.
  //
  // Omitted entirely while that read is in flight or has failed, rather than falling back to a
  // count of zero — telling someone with two hundred shows that nothing would be lost is far worse
  // than saying nothing about the number at all.
  const trackedCountLine =
    libraryLoading || libraryError
      ? null
      : librarySeries.length === 0
        ? 'Nothing has been tracked here yet.'
        : `${librarySeries.length} ${librarySeries.length === 1 ? 'show' : 'shows'} tracked here will be deleted.`;

  // Rendered in both signed-in branches (real account and guest), because both have real data and
  // both are offered the same two things: the notice to re-read, and the way out. Written once as a
  // local fragment rather than copied into each branch — a delete button that exists in one branch
  // only is exactly the kind of drift that leaves a guest with no way to delete anything. The
  // branch-specific half is passed in rather than branched on in here, so the structure (and the
  // button's existence) can't diverge even though the words have to: a guest has no "account" in
  // any sense they would recognise, and for them this is also the only exit.
  function dataSection(wording: DeleteWording) {
    return (
      <>
        <Button mode="text" onPress={() => router.push('/onboarding/privacy')} disabled={busy} style={styles.button}>
          What this app stores
        </Button>
        <Button mode="outlined" onPress={() => setDeleteConfirmVisible(true)} disabled={busy} textColor={colors.red} style={styles.button}>
          {wording.button}
        </Button>
        <Portal>
          <Dialog visible={deleteConfirmVisible} onDismiss={() => setDeleteConfirmVisible(false)}>
            <Dialog.Title>{wording.title}</Dialog.Title>
            <Dialog.Content>
              {/* Scope first, then why it can't be undone: saying what is and isn't being deleted
                  before the alarming sentence is what makes the alarm land on the right thing, and
                  it stops the one reassuring line on the screen sitting under a paragraph. */}
              <Text variant="bodyMedium">{wording.scope}</Text>
              {trackedCountLine && (
                <Text variant="bodyMedium" style={styles.dialogNote}>
                  {trackedCountLine}
                </Text>
              )}
              <Text variant="bodyMedium" style={styles.dialogNote}>
                {wording.warning}
              </Text>
              <Text variant="bodyMedium" style={styles.dialogNote}>
                The shared anime details this app caches stay; they hold nothing about you.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setDeleteConfirmVisible(false)}>Cancel</Button>
              <Button onPress={handleDeleteEverything} textColor={colors.red}>
                {wording.confirm}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <View style={styles.flex}>
        <View style={styles.container}>
          <Text variant="bodyLarge" style={styles.centerText}>
            Accounts aren’t set up yet.
          </Text>
        </View>
      </View>
    );
  }

  if (loading || isGuest === null) {
    return <View style={styles.flex} />;
  }

  // A guest (anonymous session, see guestMode.ts) — full read/write access to a real library, but
  // no email/password yet. Two ways to make it permanent: link MyAnimeList (works unchanged, it
  // attaches to whichever session is currently signed in), or set an email/password below, which
  // upgrades this same session in place rather than starting a new one — either way nothing already
  // added is lost. The only way to lose it is the delete at the bottom, which says so.
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
            MyAnimeList is linked.
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
        {/* Log in, because signing out used to be a guest's only route to the login screen — so
            with one exit left, someone who already owns an account would otherwise have to delete
            their guest list to reach it. The fields above are the same two this needs. */}
        <Button mode="text" onPress={handleLogIn} disabled={busy || !email || !password} style={styles.button}>
          Log in to an existing account
        </Button>
        <Text variant="bodySmall" style={styles.hint}>
          Logging in switches to that account. This guest list stays behind and can’t be reached
          again — delete it below first if you don’t want it kept.
        </Text>
        {dataSection(GUEST_DELETE_WORDING)}
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (session) {
    return (
      <View style={styles.flex}>
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
          {dataSection(ACCOUNT_DELETE_WORDING)}
        </View>
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

const useStyles = makeStyles((colors) => ({
  // Carries the page background, so it reaches the full width of the window while the content
  // below stops at the column.
  flex: { flex: 1, backgroundColor: colors.background },
  // The onboarding column. `width: '100%'` is load-bearing rather than redundant with maxWidth —
  // alignSelf:'center' alone makes this shrink-wrap its content, so the fields would size to their
  // placeholder text instead of the column. Sizing to the parent first and capping second is what
  // gives the cap something to cap. Same reasoning as recommend.tsx's webTabs.
  // The background lives on the full-bleed parent, not here: a capped view carrying its own colour
  // would paint a 480px stripe of it and leave the navigator's own background either side.
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: layout.onboardingColumn,
    alignSelf: 'center',
  },
  centerText: { textAlign: 'center', marginTop: spacing.xl },
  title: { color: colors.textPrimary },
  hint: { color: colors.textMuted },
  emailText: { color: colors.textPrimary },
  input: { backgroundColor: colors.surface },
  message: { color: colors.textMuted },
  button: { borderRadius: radii.pill },
  dialogNote: { marginTop: spacing.sm },
}));
