// Two Google Fonts: Zen Kaku Gothic New for display/headline text and anime/show titles (via
// SeriesTitleText, src/components/SeriesTitleText.tsx), Plus Jakarta Sans for body/label/UI text.
// A third font, Shippori Mincho (a Japanese mincho serif), was tried for titles per the original
// design doc but its thin Latin companion glyphs read as hard to read on English titles, so it was
// dropped in favor of a bolder Zen Kaku Gothic New weight instead — see SeriesTitleText. It's back
// as of the web-only design-doc reskin (see useWebLayout.ts), but only for web chrome-level
// headlines (sidebar wordmark, page titles, Series Detail hero title on wide web) — never for
// SeriesTitleText or anything native, so the legibility call above still stands there.
import { Platform } from 'react-native';
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
import { ShipporiMincho_700Bold, ShipporiMincho_800ExtraBold } from '@expo-google-fonts/shippori-mincho';

/** Passed straight to expo-font's useFonts() in app/_layout.tsx. */
export const fontsToLoad = {
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold,
  ZenKakuGothicNew_900Black,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  // Web-only — keeps this out of the native bundle, matching "reskin web, don't touch the phone
  // app" (see useWebLayout.ts).
  ...(Platform.OS === 'web' ? { ShipporiMincho_700Bold, ShipporiMincho_800ExtraBold } : {}),
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
  // Web-only chrome headlines (see the import comment above) — do not use on native.
  webSerifBold: 'ShipporiMincho_700Bold',
  webSerifExtraBold: 'ShipporiMincho_800ExtraBold',
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
