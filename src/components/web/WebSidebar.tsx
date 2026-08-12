// The left nav column of the wide-web layout (see useWebLayout.ts) — logo + wordmark, the three
// primary routes (Library/Discover/For you), and the MAL attribution line, matching the
// "AnimeTracker Web" design doc's sidebar. Deliberately just route nav: the design doc's sidebar
// also has a STATUS quick-filter section, but that's Library-screen-local state (searchQuery/
// statusFilter live in app/(tabs)/index.tsx), so it's rendered there instead of lifted up into this
// shared, cross-route component — see the plan this was built from for the reasoning.
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as NativeText, View } from 'react-native';
import { Text } from 'react-native-paper';
import { AtLogoMark } from '@/components/AtLogoMark';
import { MalAttribution } from '@/components/MalAttribution';
import { colors, logoGradient, radii, spacing } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { WEB_SIDEBAR_WIDTH } from '@/hooks/useWebLayout';
import { useHover } from '@/hooks/useHover';

// Gradient-clipped text — a web-only CSS trick (background-clip:text) with no RN Paper/StyleSheet
// equivalent, so it bypasses the typed style system with a plain object. Only ever rendered here,
// which only ever mounts on web (see useIsWideWeb), so there's no native fallback to maintain.
const gradientWordmarkStyle = {
  backgroundImage: `linear-gradient(92deg, ${logoGradient[0]}, ${logoGradient[1]} 52%, ${logoGradient[2]})`,
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
} as Record<string, string>;

const NAV_ITEMS = [
  { href: '/', label: 'Library' },
  { href: '/discover', label: 'Discover' },
  { href: '/recommend', label: 'For you' },
] as const;

export function WebSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={styles.sidebar}>
      <View style={styles.brandRow}>
        <AtLogoMark size={36} />
        <NativeText style={[styles.wordmark, gradientWordmarkStyle]}>AnimeTracker</NativeText>
      </View>
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <NavRow key={item.href} label={item.label} active={pathname === item.href} onPress={() => router.push(item.href)} />
        ))}
      </View>
      <View style={styles.footer}>
        <MalAttribution />
      </View>
    </View>
  );
}

function NavRow({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable onPress={onPress} {...hoverHandlers} style={[styles.navRow, (active || hovered) && styles.navRowActive]}>
      <View style={[styles.navDot, { backgroundColor: active ? colors.primary : colors.checkboxUnchecked }]} />
      <Text style={[styles.navLabel, { color: active ? colors.textPrimary : colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: WEB_SIDEBAR_WIDTH,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    zIndex: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: spacing.lg, paddingBottom: spacing.lg + 2 },
  wordmark: { fontFamily: fontFamilies.webSerifBold, fontSize: 17, letterSpacing: -0.2, color: colors.textPrimary },
  navList: { gap: 2, paddingHorizontal: spacing.md },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.sm + 2,
  },
  navRowActive: { backgroundColor: colors.hoverWash },
  navDot: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  navLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  footer: { marginTop: 'auto', paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
});
