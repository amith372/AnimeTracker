// The taste profile, on screen — plan 1 step 6's visible half.
//
// It lives in components/ rather than inside app/(tabs)/recommend.tsx despite having exactly one
// caller: that screen is already past a thousand lines, and this is a self-contained card with
// four render states. CLAUDE.md's "shared by 2+ screens" rule is about not making this directory a
// junk drawer, and a file that would otherwise make a long screen longer is not what that rule is
// guarding against.
//
// Why the profile is shown at all, rather than being a hidden input to step 7's generator: it is
// the only part of the model's work the user can check. A generated recommendation list can only
// be judged by whether it feels right; a sentence describing your taste can be read and disagreed
// with, and the regenerate button is what that disagreement does. Making the model's reasoning
// inspectable before it starts picking shows is the whole reason step 6 lands before step 7.
//
// This card holds the only model-authored text anywhere in the app. Success criterion 5 bars it
// from recommendation cards, where a sentence would read as a fact about a show; here it is
// plainly a description of the reader, which is what it is.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Button, Card, Text } from 'react-native-paper';
import { radii, spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';
import { userFacingMessage } from '@/repositories/errorMessage';
import { generateTasteProfile, type TasteProfileView } from '@/repositories/TasteProfileRepository';
import { MIN_TASTE_VERDICTS } from '@/domain/tasteProfile';

export function TasteProfileCard({ view }: { view: TasteProfileView }) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Collapsed by default once a profile exists: this sits above a list the user came to the screen
  // to read, and a four-field card permanently occupying the top of it would push the
  // recommendations below the fold on a phone. The summary line stays visible either way, so
  // collapsing hides the detail, not the point.
  const [expanded, setExpanded] = useState(false);

  async function regenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateTasteProfile();
      setExpanded(true);
    } catch (e) {
      setError(userFacingMessage(e, 'Couldn’t describe your taste just now.'));
    } finally {
      setGenerating(false);
    }
  }

  // Nothing at all while the library is still loading. A card that said "not enough to go on" and
  // then changed its mind a moment later would be the most misleading of the four states.
  if (view.isLoading) return null;

  // The PRD's small-library edge case. Said plainly rather than by disabling a button with no
  // explanation — and with no generate button at all, since pressing it could only fail.
  if (!view.hasEnoughSignal) {
    return (
      <Card style={styles.card} mode="outlined">
        <Card.Content style={styles.content}>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="account-heart-outline" size={20} color={colors.textMuted} />
            <Text variant="titleSmall" style={styles.heading}>
              Your taste
            </Text>
          </View>
          <Text variant="bodySmall" style={styles.muted}>
            Once you’ve finished or dropped about {MIN_TASTE_VERDICTS} series, this will describe what you
            actually go for. Right now there isn’t enough to go on.
          </Text>
        </Card.Content>
      </Card>
    );
  }

  const stored = view.stored;

  return (
    <Card style={styles.card} mode="outlined">
      <Card.Content style={styles.content}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="account-heart-outline" size={20} color={colors.textMuted} />
          <Text variant="titleSmall" style={styles.heading}>
            Your taste
          </Text>
          {stored && (
            <Button
              mode="text"
              compact
              onPress={() => setExpanded((e) => !e)}
              accessibilityLabel={expanded ? 'Hide taste details' : 'Show taste details'}
            >
              {expanded ? 'Less' : 'More'}
            </Button>
          )}
        </View>

        {stored ? (
          <>
            <Text variant="bodyMedium" style={styles.summary}>
              {stored.profile.summary}
            </Text>
            {/* The staleness line, not an automatic regeneration. Deciding to spend a model call
                is the user's, and a card that silently re-ran itself whenever a drop landed would
                make the button pointless and the call count unpredictable. */}
            {view.isStale && (
              <Text variant="bodySmall" style={styles.stale}>
                Your library has changed since this was written.
              </Text>
            )}
            {expanded && (
              <View style={styles.axes}>
                <TasteAxis label="Seeks out" values={stored.profile.seeksOut} />
                <TasteAxis label="Will watch" values={stored.profile.tolerates} />
                <TasteAxis label="Avoids" values={stored.profile.avoids} />
              </View>
            )}
          </>
        ) : (
          <Text variant="bodySmall" style={styles.muted}>
            Read your watched, loved and dropped series and describe what you go for. Only the titles
            are sent — see the privacy notice.
          </Text>
        )}

        {error && (
          <Text variant="bodySmall" style={[styles.muted, { color: colors.red }]}>
            {error}
          </Text>
        )}

        <View style={styles.actions}>
          {generating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator size={16} />
              <Text variant="bodySmall" style={styles.muted}>
                Reading your library...
              </Text>
            </View>
          ) : (
            <Button mode={stored ? 'text' : 'contained'} compact onPress={regenerate} icon="refresh">
              {stored ? 'Regenerate' : 'Describe my taste'}
            </Button>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

/** One descriptor row. Rendered as text rather than chips: these are short phrases, not filters,
 * and nothing happens when you press one — a chip that isn't interactive reads as a broken chip. */
function TasteAxis({ label, values }: { label: string; values: string[] }) {
  const styles = useStyles();
  if (values.length === 0) return null;
  return (
    <View style={styles.axisRow}>
      <Text variant="labelMedium" style={styles.axisLabel}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.axisValues}>
        {values.join(' · ')}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  content: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // flex:1 on the heading, so the More/Less button sits hard right without a spacer view.
  heading: { color: colors.textPrimary, flex: 1 },
  summary: { color: colors.textPrimary },
  muted: { color: colors.textMuted },
  stale: { color: colors.textMuted, fontStyle: 'italic' },
  axes: { gap: spacing.xs, marginTop: spacing.xs },
  axisRow: { gap: 2 },
  axisLabel: { color: colors.textMuted },
  axisValues: { color: colors.textPrimary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
