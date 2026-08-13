// The app's one search input. Wraps Paper's Searchbar so its configuration lives in a single place.
//
// It was configured from scratch in each of the three screens that has one — Library mobile, Library
// wide-web, Discover — with three different sets of values, which is how Discover ended up with an
// off-centre icon and the system font while the Library's rendered correctly in Plus Jakarta Sans:
// the fix had been written once and simply wasn't in the third copy.
//
// `minHeight: 0` on the input is load-bearing rather than cosmetic. Paper sizes the inner TextInput
// for its own default 56px bar, so any shorter height leaves the input taller than its container
// and the icon and placeholder sit above centre.
import { Searchbar } from 'react-native-paper';
import type { StyleProp, ViewStyle } from 'react-native';
import { radii } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

export function AppSearchbar({
  placeholder,
  value,
  onChangeText,
  onSubmitEditing,
  onClearIconPress,
  /** Per-screen overrides — width caps, margins, the height a given layout wants. */
  style,
  /** Fog White instead of Pure White, for the wide-web Library header where the bar sits on a
   * surface rather than on the page. */
  onSurface = false,
}: {
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  onClearIconPress?: () => void;
  style?: StyleProp<ViewStyle>;
  onSurface?: boolean;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  return (
    <Searchbar
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmitEditing}
      onClearIconPress={onClearIconPress}
      style={[styles.searchbar, onSurface && { backgroundColor: colors.background }, style]}
      inputStyle={styles.input}
    />
  );
}

const useStyles = makeStyles((colors) => ({
  searchbar: {
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 0,
  },
  input: { fontFamily: fontFamilies.bodyRegular, minHeight: 0 },
}));
