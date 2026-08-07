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
