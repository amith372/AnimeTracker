// Wide-web Series Detail / Preview hero — the "AnimeTracker Web" design doc's single rounded card
// (gradient cover/title/status header on top, a two-column body below) instead of the mobile
// edge-to-edge gradient banner. Shared by app/series/[id].tsx and app/series/preview.tsx, which
// both already have this exact shape (cover + title + status pill + genres + a right-side action
// button) on mobile — this is a pure layout/visual wrapper, it owns no data or write logic itself.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { radii, shadows, spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';
import { fontFamilies } from '@/theme/fonts';
import { useHover } from '@/hooks/useHover';

export function DetailHeroCard({
  coverUrl,
  title,
  statusText,
  statusColor,
  genres,
  topRight,
  onBack,
  children,
}: {
  coverUrl: string | null | undefined;
  title: string;
  /** Status pill text — omitted entirely for the not-yet-tracked preview screen. */
  statusText?: string;
  /** The status's own hue, from statusDotColor. Omitted by the preview screen, whose pill shows a
   * MAL rating rather than a watch-status, so there is no status for a dot to mean. */
  statusColor?: string;
  genres: string;
  /** Heart (Detail) or info (Preview) button, rendered top-right of the gradient header. */
  topRight?: ReactNode;
  onBack: () => void;
  /** The two-column body (entries list + status/action column) rendered below the header. */
  children: ReactNode;
}) {
  const styles = useStyles();
  const colors = useThemeColors();
  const [backHovered, backHoverHandlers] = useHover();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <Pressable
        onPress={onBack}
        {...backHoverHandlers}
        accessibilityRole="button"
        accessibilityLabel="Back to library"
        style={styles.backLink}
      >
        <Text style={[styles.backLinkText, backHovered && styles.backLinkTextHovered]}>‹ Back to library</Text>
      </Pressable>
      <View style={styles.card}>
        <LinearGradient colors={[colors.primary, colors.heroGradientEnd]} style={styles.header}>
          <View style={styles.headerTopRow}>{topRight}</View>
          <View style={styles.headerContent}>
            <Image source={coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={3}>
                {title}
              </Text>
              {statusText != null && (
                <View style={styles.statusPill}>
                  {/* The dot only renders when it can carry a real status hue. A fixed pale blue
                      stood here for every one of the six statuses, which made the system's
                      signature component say nothing on the one screen that is entirely about
                      status — and sat close enough to Sky Blue (Watched X/Y) to actively mislead. */}
                  {statusColor != null && <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  }
                  <Text style={styles.statusPillText}>{statusText}</Text>
                </View>
              )}
              {genres.length > 0 && <Text style={styles.genres}>{genres}</Text>}
            </View>
          </View>
        </LinearGradient>
        <View style={styles.body}>{children}</View>
      </View>
    </ScrollView>
  );
}

const CARD_MAX_WIDTH = 1040;

const useStyles = makeStyles((colors) => ({
  page: { flex: 1, backgroundColor: colors.background },
  pageContent: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 24 },
  backLink: { alignSelf: 'flex-start', width: '100%', maxWidth: CARD_MAX_WIDTH, marginBottom: spacing.md },
  backLinkText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: colors.primary },
  backLinkTextHovered: { color: colors.heroGradientEnd },
  card: { width: '100%', maxWidth: CARD_MAX_WIDTH, borderRadius: radii.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, ...shadows.lg },
  header: { flexDirection: 'row', gap: 26, padding: 30 },
  headerTopRow: { position: 'absolute', top: 14, right: 14, flexDirection: 'row' },
  headerContent: { flexDirection: 'row', gap: 26, flex: 1 },
  cover: { width: 150, height: 214, borderRadius: radii.lg, backgroundColor: 'rgba(255,255,255,0.15)' },
  headerText: { flex: 1, minWidth: 0, paddingTop: 6, gap: 12 },
  title: { fontFamily: fontFamilies.webSerifBold, fontSize: 28, lineHeight: 34, color: '#fff' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radii.sm, paddingHorizontal: 14, paddingVertical: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontFamily: fontFamilies.bodyBold, fontSize: 13, color: '#fff' },
  genres: { fontFamily: fontFamilies.bodyRegular, fontSize: 13.5, lineHeight: 22, color: colors.heroMutedText },
  body: { flexDirection: 'row', gap: 36, padding: 34, alignItems: 'flex-start' },
}));
