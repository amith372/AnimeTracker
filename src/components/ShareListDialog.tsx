// "Share your list" — plan 4 step 1 / prd/2-public-share.md. Create a public link, name it, copy
// it, stop sharing.
//
// A dialog off the Library's three-dot menu, not a screen and not a block on the account screen
// (both were built first, 2026-10-15, and replaced at the user's request). Sharing is something
// you do with your library rather than a setting on your account, and it is a handful of controls
// you dip into and leave — which is a popup's shape, not a route's.
//
// **One dialog with three states, not a dialog that opens another dialog.** The states are: not
// sharing (which *is* the confirmation — see below), sharing, and confirming a stop. Paper will
// stack Portals happily enough, but a confirmation floating over the thing it confirms is hard to
// read and harder to dismiss correctly, and the "not sharing" state has nothing to show anyway
// beyond the copy asking whether you are sure.
//
// That the first state doubles as the confirmation is the point rather than a shortcut: creating
// the link is the outward-facing, hard-to-reverse press (a link that has been sent cannot be
// un-sent, only killed), so the copy saying what it exposes has to be read *before* it exists.
// The guest sentence especially — once an anonymous session is lost there is nothing left to act
// on.
//
// Nothing here is public on its own: it writes a row. The function that serves a viewer is step 2,
// and the page a stranger sees is step 3.
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { View } from 'react-native';
import { Button, Dialog, Portal, Text, TextInput } from 'react-native-paper';
import { useIsGuest } from '@/account/guestMode';
import { MAX_SHARE_NAME_LENGTH, normalizeShareName } from '@/domain/shareLink';
import {
  createShareLink,
  renameShareLink,
  revokeShareLink,
  shareUrlFor,
  useShareLink,
} from '@/repositories/ShareRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { radii, spacing } from '@/theme/colors';
import { dialogStyle } from '@/theme/dialog';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

export function ShareListDialog({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const isGuest = useIsGuest();
  const { link, isLoading } = useShareLink();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The third state. Not a second dialog — see the header.
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [name, setName] = useState('');

  // Seeds the nickname field from the stored row, keyed on the slug rather than the name: the slug
  // changes exactly when the link is created or re-created, so this fills the field once when the
  // row arrives and never fights the user mid-type. Keying it on displayName would reset the draft
  // on every save and discard an in-progress edit the moment a rename landed.
  useEffect(() => {
    setName(link?.displayName ?? '');
  }, [link?.slug]);

  // This component stays mounted while `visible` toggles, so without this a message from last time
  // ("Sharing stopped") would be sitting there when the dialog is reopened, describing something
  // that happened minutes ago. Same reason AddSeriesDialog resets on its own prop.
  useEffect(() => {
    if (!visible) {
      setMessage(null);
      setConfirmingStop(false);
    }
  }, [visible]);

  // The three writes. Each reports through the same `message` line and catches rather than
  // throwing: a failed share must leave the user looking at a reason, not an unhandled rejection —
  // and the repository's optimistic writes have already rolled the cache back by the time we get
  // here, so what is on screen is true either way.
  async function handleStartSharing() {
    setBusy(true);
    setMessage(null);
    try {
      await createShareLink();
      setMessage('Your list is shared. Copy the link to send it to someone.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t start sharing. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveName() {
    setBusy(true);
    setMessage(null);
    try {
      await renameShareLink(name);
      setMessage('Saved.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t save that name. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStopSharing() {
    setBusy(true);
    setMessage(null);
    try {
      await revokeShareLink();
      setConfirmingStop(false);
      setMessage('Sharing stopped. That link no longer works.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t stop sharing. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  // Copies the whole URL, never the bare slug: a code on its own is not something the recipient
  // can do anything with, and silently copying one would look identical to copying a link.
  async function handleCopy() {
    const url = link ? shareUrlFor(link.slug) : null;
    if (!url) return;
    setMessage(null);
    try {
      await Clipboard.setStringAsync(url);
      setMessage('Link copied.');
    } catch (e) {
      setMessage(userFacingMessage(e, 'Couldn’t copy — select the link above and copy it by hand.'));
    }
  }

  const url = link ? shareUrlFor(link.slug) : null;
  // What "Save name" exists for. Compared through normalizeShareName so trailing spaces, or
  // clearing a blank field, don't present themselves as an unsaved change.
  const nameChanged = link !== null && normalizeShareName(name) !== link.displayName;

  // The title moves with the state, because it is the one line that says which of the three the
  // user is looking at — "Share your list?" with a question mark is a question being asked, and
  // the same words without one are a heading over a link that already exists.
  const title = isLoading ? 'Share your list' : confirmingStop ? 'Stop sharing?' : link ? 'Share your list' : 'Share your list?';

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={dialogStyle}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          {/* Tri-state: while the row is still loading this renders neither of the two real
              states. Offering to share to someone who already has a live link is how a press looks
              like nothing happened — or worse, like the link was lost. */}
          {isLoading && <Text variant="bodyMedium">Checking…</Text>}

          {!isLoading && !link && !confirmingStop && (
            <>
              <Text variant="bodyMedium">
                This creates a web link showing every show on your list and its status. Anyone who
                has the link can open it without an account, and could pass it on.
              </Text>
              <Text variant="bodyMedium" style={styles.note}>
                It never shows your email, your MyAnimeList username or anything else about you —
                only the list, and a name you choose yourself.
              </Text>
              <Text variant="bodyMedium" style={styles.note}>
                You can stop sharing at any time, which kills the link immediately.
              </Text>
              {/* The sentence that lets guests share at all (PRD, settled 2026-10-14). */}
              {isGuest && (
                <Text variant="bodyMedium" style={styles.note}>
                  You’re browsing as a guest, and a guest session can’t be signed into again. If you
                  lose it, the link keeps working and nobody will be able to stop it — set a password
                  or link MyAnimeList on the Account screen first if that matters to you.
                </Text>
              )}
            </>
          )}

          {!isLoading && link && !confirmingStop && (
            <>
              <Text variant="bodyMedium">
                Anyone with this link can see your list. It stays live until you stop sharing.
              </Text>
              {/* Selectable, so the link can still be copied by hand if the clipboard refuses — and
                  so it is visible rather than hidden behind a button that claims to have copied
                  something. Shows the slug alone when this build has no web address configured
                  (src/repositories/ShareRepository.ts's siteOrigin), with the note below saying so;
                  a half-built URL pasted into a chat is worse than none. */}
              <Text variant="bodyMedium" selectable style={styles.url}>
                {url ?? link.slug}
              </Text>
              {url === null && (
                <Text variant="bodySmall" style={styles.hint}>
                  This build doesn’t know the app’s web address, so only the link’s code is shown.
                  Set EXPO_PUBLIC_SITE_URL to get a full URL to copy.
                </Text>
              )}
              <Button
                mode="contained"
                icon="content-copy"
                onPress={handleCopy}
                disabled={busy || url === null}
                buttonColor={colors.primary}
                style={styles.button}
              >
                Copy link
              </Button>
              <TextInput
                mode="outlined"
                dense
                label="Name on the page (optional)"
                value={name}
                onChangeText={setName}
                maxLength={MAX_SHARE_NAME_LENGTH}
                style={styles.input}
              />
              <Text variant="bodySmall" style={styles.hint}>
                The page’s heading — blank reads “A shared anime list”. Anyone with the link sees
                it, so use something you’d be happy posting publicly.
              </Text>
              {nameChanged && (
                <Button mode="text" onPress={handleSaveName} disabled={busy} style={styles.button}>
                  Save name
                </Button>
              )}
            </>
          )}

          {confirmingStop && (
            <>
              <Text variant="bodyMedium">
                The link stops working straight away. Anyone you sent it to will see that the list
                isn’t being shared.
              </Text>
              <Text variant="bodyMedium" style={styles.note}>
                If you share again later you’ll get a different link, so the old one can never be
                used again.
              </Text>
            </>
          )}

          {message && (
            <Text variant="bodySmall" style={styles.message}>
              {message}
            </Text>
          )}
        </Dialog.Content>
        {/* One row of actions per state. "Stop sharing" sits on the left of its own row rather
            than in the content, so the destructive action is where every other dialog in the app
            puts one. */}
        <Dialog.Actions>
          {confirmingStop ? (
            <>
              <Button onPress={() => setConfirmingStop(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onPress={handleStopSharing} disabled={busy} textColor={colors.red}>
                Stop sharing
              </Button>
            </>
          ) : link ? (
            <>
              <Button onPress={() => setConfirmingStop(true)} disabled={busy} textColor={colors.red}>
                Stop sharing
              </Button>
              <View style={styles.spacer} />
              <Button onPress={onDismiss} disabled={busy}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button onPress={onDismiss} disabled={busy}>
                Cancel
              </Button>
              <Button onPress={handleStartSharing} disabled={busy || isLoading} loading={busy}>
                Share my list
              </Button>
            </>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const useStyles = makeStyles((colors) => ({
  note: { marginTop: spacing.sm },
  hint: { color: colors.textMuted, marginTop: spacing.xs },
  message: { color: colors.textMuted, marginTop: spacing.md },
  button: { marginTop: spacing.sm, borderRadius: radii.pill },
  input: { backgroundColor: colors.surface, marginTop: spacing.md },
  // Pushes "Done" to the right so the destructive action isn't sitting next to it — Paper's
  // Actions row is a flex row, and without this the two read as a pair.
  spacer: { flex: 1 },
  // The link itself. On its own surface because it is the one piece of text here meant to be
  // selected and copied, and because a long URL needs to look like data rather than prose.
  url: {
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
    marginTop: spacing.md,
  },
}));
