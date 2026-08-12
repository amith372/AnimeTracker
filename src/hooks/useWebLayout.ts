// Gates the web-only "AnimeTracker Web" design-doc layout (sidebar nav, poster-card grids, wide
// Series Detail) — see CLAUDE.md and the design doc at claude.ai/design project "Anime tracker app
// design". Native is never affected (Platform.OS check), and a narrow browser window/web view
// falls back to the existing mobile layout (width check) rather than cramming the sidebar design
// into a phone-sized viewport.
import { Platform, useWindowDimensions } from 'react-native';

/** Below this width, web gets the same bottom-tab mobile layout native uses. */
const WEB_WIDE_BREAKPOINT = 900;

/** Fixed width of the left nav column in the wide-web layout (matches the design doc). */
export const WEB_SIDEBAR_WIDTH = 232;

/** True only on web, at or above the wide-layout breakpoint. Reactive to window resize. */
export function useIsWideWeb(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WEB_WIDE_BREAKPOINT;
}
