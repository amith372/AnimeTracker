// Web-only "is the pointer over this element" state, for the restrained hover/press feedback pass
// (see colors.hoverWash in src/theme/colors.ts). Pressable's onHoverIn/onHoverOut are real events on
// web (react-native-web) and silent no-ops on native, so this hook is safe to spread onto any
// Pressable regardless of platform — it just never flips true off-web, where touch has no hover.
import { useCallback, useState } from 'react';

export function useHover() {
  const [hovered, setHovered] = useState(false);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);
  return [hovered, { onHoverIn, onHoverOut }] as const;
}
