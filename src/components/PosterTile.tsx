// Shared poster tile — cover art + title + a short "3 seasons · 2 films · Fall 2024" subtitle.
// Used by both Discover (Phase 4) and Recommendations (Phase 6), which both show grids/rows of
// prospective ReconcileSeries the user can tap to add.
//
// The subtitle leads with the series' shape rather than its media type: "TV" was the least
// informative thing on the tile (a season count already implies it), while how many seasons and
// films the show actually is — the thing the grouping worked out and MAL's own list can't tell you
// — wasn't shown at all. See seriesShapeLabel.
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { seriesShapeLabel } from '@/domain/seriesShape';
import { SeriesTitleText } from './SeriesTitleText';
import { colors, radii, shadows } from '@/theme/colors';
import { useHover } from '@/hooks/useHover';

export function PosterTile({ series, onPress }: { series: ReconcileSeries; onPress: () => void }) {
  const subtitle = [seriesShapeLabel(series), series.seasonLabel].filter(Boolean).join(' · ');
  const [hovered, hoverHandlers] = useHover();

  return (
    <Pressable
      style={[styles.tile, hovered && styles.tileHovered]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${series.title}, ${subtitle}` : series.title}
      accessibilityHint="Add this show to your library"
      {...hoverHandlers}
    >
      <Image source={series.coverUrl ?? undefined} style={styles.tileCover} contentFit="cover" />
      <SeriesTitleText variant="bodyMedium" numberOfLines={2} style={styles.tileTitle}>
        {series.title}
      </SeriesTitleText>
      <Text variant="bodySmall" numberOfLines={1} style={styles.tileSubtitle}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { width: 110, margin: 4 },
  // Same opacity-dip precedent as Library's grid card (see index.tsx) — a hover wash would mean
  // padding the tile, which shifts the cover off its exact 110px spec.
  tileHovered: { opacity: 0.92 },
  tileCover: { width: 110, height: 156, borderRadius: radii.sm, backgroundColor: colors.coverPlaceholder, ...shadows.md },
  tileTitle: { marginTop: 4 },
  tileSubtitle: { color: colors.textMuted },
});
