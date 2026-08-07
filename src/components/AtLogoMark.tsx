// The app's own icon gradient (coral → pink → blue), reused as a small "AT" mark wherever the
// design calls for it — the login screen's centerpiece and the Library header's leading icon.
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'react-native-paper';
import { logoGradient, radii } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';

export function AtLogoMark({ size = 40 }: { size?: number }) {
  return (
    <LinearGradient
      colors={logoGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size * (radii.md / 40),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: fontFamilies.displayBlack,
          fontSize: size * 0.34,
          color: '#fff',
          letterSpacing: -0.5,
        }}
      >
        AT
      </Text>
    </LinearGradient>
  );
}
