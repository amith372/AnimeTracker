// The "we couldn't read your data" state, shared by every screen backed by the library query.
//
// Exists because those screens previously had no way to say this at all: a failed Postgres read
// left the library as an empty array, so the Library rendered "Nothing here yet", Series Detail
// rendered "Not found", and Catch up rendered "you're all caught up!" — three different screens
// telling the user their data was gone when the real answer was "the network dropped". With no
// offline support (deliberate, see CLAUDE.md), that's the most common failure the app has, so it
// needs one honest, retryable state rather than three cheerful lies.
//
// Deliberately the same shape Discover/Recommendations already use for their MAL failures (message
// + a contained Retry button) so a failure reads the same wherever the user hits one.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

export function LoadFailure({
  message,
  onRetry,
  /** Rendered under the Retry button — the escape hatch for a screen the user can get stuck on
   * (Series Detail, which has no tab bar of its own to fall back to). */
  secondaryLabel,
  onSecondary,
}: {
  message: string;
  onRetry: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      {/* Muted rather than red: this is a transient "try again", not a destructive error, and the
          status palette's clay red is reserved for the Dropped watch-status (DESIGN.md's One
          Status, One Color rule). */}
      <MaterialCommunityIcons name="cloud-off-outline" size={40} color={colors.textMuted} />
      <Text variant="bodyLarge" style={styles.message}>
        {message}
      </Text>
      <Button mode="contained" onPress={onRetry} buttonColor={colors.primary}>
        Try again
      </Button>
      {secondaryLabel && onSecondary && (
        <Button mode="text" onPress={onSecondary}>
          {secondaryLabel}
        </Button>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  // textPrimary, not textFaint: this is the only thing on screen and has to be readable — textFaint
  // on the page background is well under the 4.5:1 contrast floor.
  message: { textAlign: 'center', color: colors.textPrimary, maxWidth: 340 },
}));
