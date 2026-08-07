// Wraps Paper's Text with a bolder display weight for anime/show titles, to give them a bit more
// presence than the surrounding body text. The design doc originally called for "Shippori Mincho"
// (a Japanese mincho serif) here, but its thin, unusual-looking Latin companion glyphs read as
// hard to read on English titles — Zen Kaku Gothic New's bold weight keeps the visual emphasis
// without the legibility cost. Use this anywhere an actual show or season title renders (Library
// rows, Series Detail, poster tiles, recommendation cards, the entry-image popup) — not for
// section headers, buttons, or other chrome.
import type { ComponentProps } from 'react';
import { Text } from 'react-native-paper';
import { fontFamilies } from '@/theme/fonts';

type Props = ComponentProps<typeof Text> & { semiBold?: boolean };

export function SeriesTitleText({ style, semiBold, ...rest }: Props) {
  const fontFamily = semiBold ? fontFamilies.displayMedium : fontFamilies.displayBold;
  return <Text {...rest} style={[{ fontFamily }, style]} />;
}
