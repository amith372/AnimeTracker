// The blue→green gradient progress bar from the Reconcile screen's fetch-in-progress state.
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';
import { radii } from '@/theme/colors';
import { useThemeColors } from '@/theme/useTheme';

export function GradientProgressBar({ progress }: { progress: number }) {
  const colors = useThemeColors();
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height: 5, borderRadius: radii.sm, backgroundColor: colors.border, overflow: 'hidden' }}>
      <LinearGradient
        colors={[colors.primary, colors.green]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: '100%', width: `${clamped * 100}%` }}
      />
    </View>
  );
}
