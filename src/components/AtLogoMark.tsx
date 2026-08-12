// The app's own icon artwork, reused as a small mark wherever the design calls for it — the
// login screen's centerpiece and the Library header/sidebar's leading icon. Same source image as
// the real app icon (assets/icon.png), so this mark and the installed app icon always match.
import { Image } from 'expo-image';
import { radii } from '@/theme/colors';

export function AtLogoMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/icon.png')}
      style={{
        width: size,
        height: size,
        borderRadius: size * (radii.md / 40),
      }}
      contentFit="cover"
    />
  );
}
