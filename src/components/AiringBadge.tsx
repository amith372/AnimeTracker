// "Currently airing" marker for one season/movie — a live-status dot plus the words, shown on the
// Series Detail rows, the not-yet-tracked preview rows, and Catch up.
//
// Replaces a bare "AIRING" chip: a five-letter all-caps chip in the same blue as the rest of the
// row's chrome read as another badge among many, and didn't say what it meant. A green dot is the
// conventional "live right now" signal (and matches the green used for watched ticks elsewhere in
// the design), with the label spelling it out rather than leaving the color to carry it alone —
// color is never the only channel.
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { radii } from '@/theme/colors';
import { makeStyles } from '@/theme/useTheme';
import { fontFamilies } from '@/theme/fonts';

export function AiringBadge({ compact }: { compact?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <View style={styles.dot} />
      {/* Capped rather than uncapped: this badge sits inline at the end of an entry row beside a
          title and a button, so unbounded growth pushes the row's real content out. 1.4 keeps it
          legible without letting it take the row over. */}
      {!compact && (
        <Text style={styles.label} maxFontSizeMultiplier={1.4}>
          Currently airing
        </Text>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  label: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11, lineHeight: 14, color: colors.green },
}));
