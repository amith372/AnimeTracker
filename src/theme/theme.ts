import { MD3DarkTheme, MD3LightTheme, configureFonts } from 'react-native-paper';
import { colors } from './colors';
import { darkColors, useIsDark, type Palette } from './useTheme';
import { paperFontConfig } from './fonts';

/** Maps our palette onto the Paper theme Paper's own components read. Both appearances go through
 * the same mapping so a Paper Button and a hand-rolled Pressable can't drift apart. */
function buildTheme(base: typeof MD3LightTheme, palette: Palette) {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      surface: palette.surface,
      // Paper draws menus, dialogs and elevated cards from these rather than `surface`; left at the
      // MD3 defaults they stayed near-white and a dialog opened as a white slab in a dark app.
      elevation: {
        ...base.colors.elevation,
        level1: palette.surface,
        level2: palette.surface,
        level3: palette.surface,
      },
      onPrimary: '#FFFFFF',
      outline: palette.border,
      outlineVariant: palette.border,
      onSurface: palette.textPrimary,
      onSurfaceVariant: palette.textMuted,
      error: palette.red,
    },
    fonts: configureFonts({ config: paperFontConfig }),
  };
}

export const paperTheme = buildTheme(MD3LightTheme, colors);
export const paperDarkTheme = buildTheme(MD3DarkTheme, darkColors);

/** The Paper theme for the current appearance — see app/_layout.tsx. */
export function usePaperTheme() {
  return useIsDark() ? paperDarkTheme : paperTheme;
}
