// The wide-web chrome (left sidebar + inset content) for routes that live *outside* the (tabs)
// group — Series Detail and the not-yet-tracked Preview.
//
// Those routes are Stack siblings of (tabs) at the root (see app/_layout.tsx), and the sidebar was
// rendered only inside TabsLayout. So opening a series on wide web destroyed the entire desktop
// layout: no sidebar, no way to reach Discover or For you, just a small "Back to library" text
// link on a full-width page. DESIGN.md commits to a fixed sidebar sitting *beside* the routed
// content as the wide-web register, and a desktop layout whose navigation disappears on the detail
// view isn't one.
//
// A shared shell rather than moving the routes into (tabs): the routing is fine as it is, and the
// only thing actually missing was the chrome. TabsLayout keeps its own copy of this arrangement
// because it has to work around what the bottom-tabs navigator does internally (see the comment
// there); this one is a plain layout with no navigator inside it.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebSidebar } from '@/components/web/WebSidebar';
import { colors } from '@/theme/colors';
import { WEB_SIDEBAR_WIDTH } from '@/hooks/useWebLayout';

export function WebShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Absolutely positioned (see WebSidebar's own styles), hence the matching marginLeft below
          rather than a flexDirection:'row' pair. */}
      <WebSidebar />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, marginLeft: WEB_SIDEBAR_WIDTH },
});
