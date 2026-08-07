// Shared poster tile — cover art + title + a short "TV · Season Year · N seasons" subtitle.
// Used by both Discover (Phase 4) and Recommendations (Phase 6), which both show grids/rows of
// prospective ReconcileSeries the user can tap to add.
import { Image } from 'expo-image';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { SeriesTitleText } from './SeriesTitleText';
import { colors, radii } from '@/theme/colors';

export function PosterTile({ series, onPress }: { series: ReconcileSeries; onPress: () => void }) {
  const seasonCount = series.entries.filter((e) => e.kind === 'TV_SEASON').length;
  const subtitle = [series.type === 'STANDALONE_MOVIE' ? 'Movie' : 'TV', series.seasonLabel, seasonCount > 1 ? `${seasonCount} seasons` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable style={styles.tile} onPress={onPress}>
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
  tileCover: { width: 110, height: 156, borderRadius: radii.sm, backgroundColor: colors.border },
  tileTitle: { marginTop: 4 },
  tileSubtitle: { color: colors.textMuted },
});
