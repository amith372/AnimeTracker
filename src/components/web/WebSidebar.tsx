// The left nav column of the wide-web layout (see useWebLayout.ts) — logo + wordmark, the three
// primary routes (Library/Discover/For you), and the MAL attribution line, matching the
// "AnimeTracker Web" design doc's sidebar. Deliberately just route nav: the design doc's sidebar
// also has a STATUS quick-filter section, but that's Library-screen-local state (searchQuery/
// statusFilter live in app/(tabs)/index.tsx), so it's rendered there instead of lifted up into this
// shared, cross-route component — see the plan this was built from for the reasoning.
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { AtLogoMark } from '@/components/AtLogoMark';
import { MalAttribution } from '@/components/MalAttribution';
import { colors, radii, spacing } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { WEB_SIDEBAR_WIDTH } from '@/hooks/useWebLayout';

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
        <Text style={styles.wordmark}>AnimeTracker</Text>
      </View>
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Pressable key={item.href} onPress={() => router.push(item.href)} style={[styles.navRow, active && styles.navRowActive]}>
              <View style={[styles.navDot, { backgroundColor: active ? colors.primary : colors.checkboxUnchecked }]} />
              <Text style={[styles.navLabel, { color: active ? colors.textPrimary : colors.textMuted }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.footer}>
        <MalAttribution />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: WEB_SIDEBAR_WIDTH,
    flex: 0,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: '100%',
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
  navRowActive: { backgroundColor: '#EEF3F8' },
  navDot: { width: 7, height: 7, borderRadius: 2, flexShrink: 0 },
  navLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: 14 },
  footer: { marginTop: 'auto', paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
});
