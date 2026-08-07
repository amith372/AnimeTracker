// Two Google Fonts: Zen Kaku Gothic New for display/headline text and anime/show titles (via
// SeriesTitleText, src/components/SeriesTitleText.tsx), Plus Jakarta Sans for body/label/UI text.
// A third font, Shippori Mincho (a Japanese mincho serif), was tried for titles per the original
// design doc but its thin Latin companion glyphs read as hard to read on English titles, so it was
// dropped in favor of a bolder Zen Kaku Gothic New weight instead — see SeriesTitleText.
import {
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold,
  ZenKakuGothicNew_900Black,
} from '@expo-google-fonts/zen-kaku-gothic-new';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

/** Passed straight to expo-font's useFonts() in app/_layout.tsx. */
export const fontsToLoad = {
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold,
  ZenKakuGothicNew_900Black,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
};

// Once loaded, a Google Font's family name (usable in a fontFamily style) is exactly its export
// key above — expo-font registers it under that name.
export const fontFamilies = {
  displayBlack: 'ZenKakuGothicNew_900Black',
  displayBold: 'ZenKakuGothicNew_700Bold',
  displayMedium: 'ZenKakuGothicNew_500Medium',
  bodyRegular: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemiBold: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

/** react-native-paper's configureFonts({ config }) shape — one entry per MD3 typescale variant. */
export const paperFontConfig = {
  displayLarge: { fontFamily: fontFamilies.displayBlack },
  displayMedium: { fontFamily: fontFamilies.displayBold },
  displaySmall: { fontFamily: fontFamilies.displayBold },
  headlineLarge: { fontFamily: fontFamilies.displayBold },
  headlineMedium: { fontFamily: fontFamilies.displayBold },
  headlineSmall: { fontFamily: fontFamilies.displayBold },
  titleLarge: { fontFamily: fontFamilies.bodyBold },
  titleMedium: { fontFamily: fontFamilies.bodyBold },
  titleSmall: { fontFamily: fontFamilies.bodySemiBold },
  labelLarge: { fontFamily: fontFamilies.bodySemiBold },
  labelMedium: { fontFamily: fontFamilies.bodySemiBold },
  labelSmall: { fontFamily: fontFamilies.bodyMedium },
  bodyLarge: { fontFamily: fontFamilies.bodyRegular },
  bodyMedium: { fontFamily: fontFamilies.bodyRegular },
  bodySmall: { fontFamily: fontFamilies.bodyRegular },
};
