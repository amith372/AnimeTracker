// Bottom tab bar icons for the 3 tabs. Library and Discover map directly onto existing
// MaterialCommunityIcons glyphs; "For you" uses the design's rotated-square/diamond mark, which
// has no single matching glyph, so it's built from a plain outline icon rotated 45°.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { View } from 'react-native';

type TabIconProps = { color: ColorValue; size: number };

export function LibraryTabIcon({ color, size }: TabIconProps) {
  return <MaterialCommunityIcons name="view-headline" size={size} color={color as string} />;
}

export function DiscoverTabIcon({ color, size }: TabIconProps) {
  return <MaterialCommunityIcons name="magnify" size={size} color={color as string} />;
}

export function ForYouTabIcon({ color, size }: TabIconProps) {
  return (
    <View style={{ transform: [{ rotate: '45deg' }] }}>
      <MaterialCommunityIcons name="square-outline" size={size * 0.8} color={color as string} />
    </View>
  );
}
