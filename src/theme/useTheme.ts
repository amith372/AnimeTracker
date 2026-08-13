// Runtime theming — the light/dark switch, and the one helper every screen's StyleSheet goes
// through.
//
// The problem this solves: a module-level `StyleSheet.create({ ... colors.background ... })` reads
// its token values *at import time*, so the palette is frozen before React ever renders and no
// amount of re-rendering can change it. `makeStyles` below moves that call behind a hook while
// keeping the style bodies byte-identical — the factory's parameter is named `colors`, so it
// shadows the module import and nothing inside the braces has to change.
//
// Palettes are built once per appearance and cached, not rebuilt per render: there are exactly two,
// and a fresh StyleSheet on every render would defeat RN's style registry.
import { useMemo } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { colors as lightColors } from './colors';

// Same keys as the light palette, but each value widened to `string`. `colors` is declared
// `as const`, so a bare `typeof lightColors` would type every entry as its own literal hex and the
// dark palette could only ever repeat the light one.
export type Palette = { [K in keyof typeof lightColors]: string };

/**
 * The dark appearance — the same warm register with its values inverted, not a different design.
 *
 * What moves and what doesn't:
 *   - The NEUTRALS invert: warm paper becomes warm near-black, warm ink becomes warm off-white.
 *     They stay *warm* (browns, not blue-greys), because a cool-grey dark theme under a warm light
 *     one reads as two different apps rather than one app at two times of day.
 *   - `primary` lightens. Control Blue at #3B6EA5 is tuned for contrast against near-white; on a
 *     dark ground it falls under 4.5:1 for text and reads muddy for fills. Lightening it is what
 *     keeps it the same *role*, and it moves further from MyAnimeList's navy rather than toward it,
 *     so the Borrowed-Blue Ban is satisfied more comfortably here than in light.
 *   - The six STATUS hues do not change at all. One Status, One Color is about meaning, and a
 *     status that shifts hue between appearances would be a different status. They were picked at
 *     mid-saturation and all clear 3:1 against the dark surface as 7-8px dots beside a text label.
 *   - `heroGradientEnd`, `heroMutedText` and the brand gradient don't change either: they sit on
 *     saturated colour, which is the same in both appearances.
 */
export const darkColors: Palette = {
  ...lightColors,
  primary: '#7BA6D6',
  // The inverted-surface token. In light it's a near-black used *behind* white text; in dark that
  // job is done by a raised warm surface instead, or the inversion would vanish into the page.
  primaryDark: '#3B322A',
  background: '#17130F',
  surface: '#221C16',
  border: '#3A3128',
  textPrimary: '#F3EDE4',
  textMuted: '#B4A798',
  textFaint: '#8D8071',
  checkboxUnchecked: '#544A3E',
  // Selection wash: a desaturated blue lifted off the warm ground, same "this one is chosen" role
  // the light wash has.
  hoverWash: '#2A3541',
  coverPlaceholder: 'rgba(255,255,255,0.07)',
};

/** The palette matching the system appearance. Defaults to light when the OS reports nothing. */
export function useThemeColors(): Palette {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}

/** True when the dark appearance is active — for the handful of places that need a boolean rather
 * than a colour (status-bar style, gradient stops, image placeholders). */
export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

// Mirrors the (unexported) shape StyleSheet.create constrains against. Typing the values as a bare
// `object` instead widens every literal — `flexDirection` infers as `string` rather than its union
// — and every style prop then fails to assign.
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Turns a stylesheet into a hook. Usage:
 *
 *   const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));
 *   // inside a component:
 *   const styles = useStyles();
 *
 * The factory parameter is deliberately named `colors` at every call site so the existing style
 * bodies compile untouched — converting a screen is a two-line change around its stylesheet, not a
 * rewrite of every value inside it.
 */
export function makeStyles<T extends NamedStyles<T> | NamedStyles<Record<string, unknown>>>(
  factory: (colors: Palette) => T & NamedStyles<T>,
) {
  // Built lazily and kept: two appearances, two stylesheets, for the life of the process.
  let light: T | undefined;
  let dark: T | undefined;
  return function useStyles(): T {
    const scheme = useColorScheme();
    return useMemo(() => {
      if (scheme === 'dark') {
        dark ??= StyleSheet.create(factory(darkColors));
        return dark;
      }
      light ??= StyleSheet.create(factory(lightColors));
      return light;
    }, [scheme]);
  };
}
