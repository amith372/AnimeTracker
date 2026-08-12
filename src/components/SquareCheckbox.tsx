// The 24x24 rounded-square, green-filled checkmark from the Series Detail design — purpose-built
// for that screen's watched-mark look. Paper's own Checkbox component is untouched and still used
// everywhere else in the app (Library filters, Reconcile); this isn't a global Checkbox restyle.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { colors } from '@/theme/colors';

export function SquareCheckbox({
  checked,
  onPress,
  accessibilityLabel,
}: {
  checked: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      // The 24px box is a visual spec, not a target size: on its own it's about a quarter of the
      // area Material (48dp) and the HIG (44pt) require, for what is the app's primary verb — and
      // this is the control a reconcile pass taps hundreds of times. hitSlop grows the touch area
      // to 48x48 without touching the drawn box. It lives here rather than at each call site so
      // Series Detail, the arc rows, and Reconcile all inherit it.
      hitSlop={12}
      style={{
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: checked ? colors.green : colors.checkboxUnchecked,
        backgroundColor: checked ? colors.green : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && <MaterialCommunityIcons name="check-bold" size={14} color="#fff" />}
    </Pressable>
  );
}
