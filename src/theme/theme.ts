import { MD3LightTheme, configureFonts } from 'react-native-paper';
import { colors } from './colors';
import { paperFontConfig } from './fonts';

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    background: colors.background,
    surface: colors.surface,
    outline: colors.border,
    onSurface: colors.textPrimary,
    onSurfaceVariant: colors.textMuted,
    error: colors.red,
  },
  fonts: configureFonts({ config: paperFontConfig }),
};
