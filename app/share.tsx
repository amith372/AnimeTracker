// "Share your list" — plan 4 step 1 / prd/2-public-share.md. Create a public link, name it, copy
// it, stop sharing.
//
// A screen of its own, reached from the Library's three-dot menu rather than from the account
// screen where it was first built (moved 2026-10-15, at the user's request — the PRD's step 1 is
// corrected to match). Sharing is something you do with your library, not a setting on your
// account, and the account screen was already the longest in the app: an email field, a password
// field, MAL linking, the privacy notice and two exits. Burying a URL and a text field at the
// bottom of that put the one thing you would come back to repeatedly behind the one thing you
// visit once.
//
// Everything a guest needs is here too — a guest may share (PRD decision table, settled
// 2026-10-14), since every other feature in the app treats an anonymous session as the real
// account it is. The one difference is a sentence in the confirmation dialog, below.
//
// Nothing on this screen is public on its own: it writes a row. The function that serves it is
// step 2 and the page a stranger sees is step 3.
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useAccountSession } from '@/account/accountRepository';
import { useIsGuest } from '@/account/guestMode';
import { isSupabaseConfigured } from '@/account/supabaseClient';
import { MAX_SHARE_NAME_LENGTH, normalizeShareName } from '@/domain/shareLink';
import {
  createShareLink,
  renameShareLink,
  revokeShareLink,
  shareUrlFor,
  useShareLink,
} from '@/repositories/ShareRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { layout, radii, spacing } from '@/theme/colors';
import { dialogStyle } from '@/theme/dialog';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

export default function ShareScreen() {
  const styles = useStyles();
  const colors = useThemeColors();
  const { session, loading: sessionLoading } = useAccountSession();
  const isGuest = useIsGuest();
  const { link: shareLink, isLoading: shareLoading } = useShareLink();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Two dialogs, not one. Creating the link is the outward-facing, hard-to-reverse half (a link
  // that has been sent cannot be un-sent, only killed), and the guest warning below is only
  // actionable *before* the link exists. Stopping gets its own, lighter confirmation because the
  // URL may already be in someone else's chat history.
  const [shareConfirmVisible, setShareConfirmVisible] = useState(false);
  const [revokeConfirmVisible, setRevokeConfirmVisible] = useState(false);
  const [shareName, setShareName] = useState('');

  // Seeds the nickname field from the stored row, keyed on the slug rather than the name: the slug
  // changes exactly when the link is created or re-created, so this fills the field once when the
  // row arrives and never fights the user mid-type. Keying it on displayName would reset the draft
  // on every save and discard an in-progress edit the moment a rename landed.
  useEffect(() => {
    setShareName(shareLink?.displayName ?? '');
  }, [shareLink?.slug]);

  // The three writes. Each reports through the same `message` line and catches rather than
  // throwing: a failed share must leave the user looking at a reason, not an unhandled rejection —
  // and the repository's optimistic writes have already rolled the cache back by the time we get
  // here, so what is on screen is true either way.
  async function handleStartSharing() {
    setShareConfirmVisible(false);
    setBusy(true);
    setMessage(null);
    try {
      await createShareLink();
      setMessage('Your list is shared. Copy the link below to send it to someone.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t start sharing. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveShareName() {
    setBusy(true);
    setMessage(null);
    try {
      await renameShareLink(shareName);
      setMessage('Saved.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t save that name. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStopSharing() {
    setRevokeConfirmVisible(false);
    setBusy(true);
    setMessage(null);
    try {
      await revokeShareLink();
      setMessage('Sharing stopped. That link no longer works.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t stop sharing. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  // Copies the whole URL, never the bare slug: a code on its own is not something the recipient
  // can do anything with, and silently copying one would look identical to copying a link.
  async function handleCopyShareUrl() {
    const url = shareLink ? shareUrlFor(shareLink.slug) : null;
    if (!url) return;
    setMessage(null);
    try {
      await Clipboard.setStringAsync(url);
      setMessage('Link copied.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t copy the link — select it above and copy it by hand.'));
    }
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

  // Signed out is not a state this screen can be reached in normally — the Library's menu is behind
  // the same session gate every other screen is — but a direct URL on web can land here, and a
  // blank screen would read as broken.
  if (!sessionLoading && !session) {
    return (
      <View style={styles.flex}>
        <View style={styles.container}>
          <Text variant="bodyLarge" style={styles.centerText}>
            Sign in to share your list.
          </Text>
        </View>
      </View>
    );
  }

  const url = shareLink ? shareUrlFor(shareLink.slug) : null;
  // What "Save name" exists for. Compared through normalizeShareName so trailing spaces, or
  // clearing a blank field, don't present themselves as an unsaved change.
  const nameChanged = shareLink !== null && normalizeShareName(shareName) !== shareLink.displayName;

  return (
    // KeyboardAvoidingView for the same reason the account screen has one: a text field below the
    // fold on iOS, where nothing moves out of the keyboard's way on its own.
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Tri-state: while the row is still loading this renders neither state. Offering "Share
            your list" to someone who already has a live link is how a second press looks like
            nothing happened — or worse, like the link was lost. */}
        {(shareLoading || sessionLoading) && (
          <Text variant="bodySmall" style={styles.hint}>
            Checking…
          </Text>
        )}
        {!shareLoading && !sessionLoading && !shareLink && (
          <>
            <Text variant="bodyMedium" style={styles.lead}>
              Create a link that shows what you’ve watched. Anyone you send it to can open it in a
              browser — no account, no app and no MyAnimeList login needed.
            </Text>
            <Text variant="bodySmall" style={styles.hint}>
              Your email, your MyAnimeList username and everything else about you stay private. Only
              the list is published, and you can stop at any time.
            </Text>
            <Button
              mode="contained"
              onPress={() => setShareConfirmVisible(true)}
              disabled={busy}
              buttonColor={colors.primary}
              style={styles.button}
            >
              Share your list
            </Button>
          </>
        )}
        {!shareLoading && !sessionLoading && shareLink && (
          <>
            <Text variant="bodyMedium" style={styles.lead}>
              Your list is shared. Anyone with this link can see it, and it stays live until you
              stop sharing.
            </Text>
            {/* Selectable, so the link can still be copied by hand if the clipboard refuses — and
                so it is visible rather than hidden behind a button that claims to have copied
                something. Shows the slug alone when this build has no web address configured
                (src/repositories/ShareRepository.ts's siteOrigin), with the note below saying so;
                a half-built URL pasted into a chat is worse than none. */}
            <Text variant="bodyMedium" selectable style={styles.shareUrl}>
              {url ?? shareLink.slug}
            </Text>
            {url === null && (
              <Text variant="bodySmall" style={styles.hint}>
                This build doesn’t know the app’s web address, so only the link’s code is shown. Set
                EXPO_PUBLIC_SITE_URL to get a full URL to copy.
              </Text>
            )}
            <Button
              mode="contained"
              icon="content-copy"
              onPress={handleCopyShareUrl}
              disabled={busy || url === null}
              buttonColor={colors.primary}
              style={styles.button}
            >
              Copy link
            </Button>
            <TextInput
              mode="outlined"
              label="Name on the page (optional)"
              value={shareName}
              onChangeText={setShareName}
              maxLength={MAX_SHARE_NAME_LENGTH}
              style={styles.input}
            />
            <Text variant="bodySmall" style={styles.hint}>
              Shown as the page’s heading — leave it blank for “A shared anime list”. Anyone with
              the link sees it, so use whatever you’d be happy posting publicly rather than your
              real name.
            </Text>
            {nameChanged && (
              <Button mode="text" onPress={handleSaveShareName} disabled={busy} style={styles.button}>
                Save name
              </Button>
            )}
            <Button
              mode="outlined"
              onPress={() => setRevokeConfirmVisible(true)}
              disabled={busy}
              textColor={colors.red}
              style={styles.button}
            >
              Stop sharing
            </Button>
          </>
        )}
        {message && (
          <Text variant="bodyMedium" style={styles.message}>
            {message}
          </Text>
        )}
        <Portal>
          {/* The outward-facing confirmation: this is the press that makes a private library
              readable by anyone holding a URL, which is the one genuinely irreversible thing here
              (a link that has been sent cannot be un-sent, only killed). */}
          <Dialog visible={shareConfirmVisible} onDismiss={() => setShareConfirmVisible(false)} style={dialogStyle}>
            <Dialog.Title>Share your list?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                This creates a web link showing every show on your list and its status. Anyone who
                has the link can open it without an account, and could pass it on.
              </Text>
              <Text variant="bodyMedium" style={styles.dialogNote}>
                It never shows your email, your MyAnimeList username or anything else about you —
                only the list, and a name you choose yourself.
              </Text>
              <Text variant="bodyMedium" style={styles.dialogNote}>
                You can stop sharing at any time, which kills the link immediately.
              </Text>
              {/* The sentence that lets guests share at all (PRD, settled 2026-10-14). It has to be
                  read before the link exists: afterwards, a lost guest session is exactly the
                  situation it warns about and there is nothing left to act on. It points at the
                  account screen rather than "above" now that the two live apart. */}
              {isGuest && (
                <Text variant="bodyMedium" style={styles.dialogNote}>
                  You’re browsing as a guest, and a guest session can’t be signed into again. If you
                  lose it, the link keeps working and nobody will be able to stop it — set a password
                  or link MyAnimeList on the Account screen first if that matters to you.
                </Text>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setShareConfirmVisible(false)}>Cancel</Button>
              <Button onPress={handleStartSharing}>Share my list</Button>
            </Dialog.Actions>
          </Dialog>
          <Dialog visible={revokeConfirmVisible} onDismiss={() => setRevokeConfirmVisible(false)} style={dialogStyle}>
            <Dialog.Title>Stop sharing?</Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium">
                The link stops working straight away. Anyone you sent it to will see that the list
                isn’t being shared.
              </Text>
              <Text variant="bodyMedium" style={styles.dialogNote}>
                If you share again later you’ll get a different link, so the old one can never be
                used again.
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setRevokeConfirmVisible(false)}>Cancel</Button>
              <Button onPress={handleStopSharing} textColor={colors.red}>
                Stop sharing
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// The same column the onboarding screens use (layout.onboardingColumn), for the same reason: this
// is prose and a form, and a 1900px line of either is unreadable. See theme/colors.ts's note on
// why the background lives on the full-bleed parent rather than on the capped column.
const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: layout.onboardingColumn,
    alignSelf: 'center',
  },
  centerText: { textAlign: 'center', marginTop: spacing.xl },
  lead: { color: colors.textPrimary },
  hint: { color: colors.textMuted },
  message: { color: colors.textMuted },
  input: { backgroundColor: colors.surface },
  button: { borderRadius: radii.pill },
  dialogNote: { marginTop: spacing.sm },
  // The link itself. On its own surface because it is the one piece of text here meant to be
  // selected and copied, and because a long URL needs to look like data rather than prose.
  shareUrl: {
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
}));
