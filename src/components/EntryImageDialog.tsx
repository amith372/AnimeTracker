// Popup opened by tapping a season/movie's title on the Series Detail screen (or the not-yet-
// tracked show preview screen) — shows the full, untruncated title plus that entry's own MAL
// cover art (fetched on demand, cached like any other per-anime detail fetch). Entries don't
// carry their own image locally; only the parent Series/ReconcileSeries does (coverUrl), so this
// fetches fresh via the entry's malId each time it opens. Typed to the minimal shape it actually
// needs (not the full SeriesEntry) so it works for both a tracked SeriesEntry and an untracked
// ReconcileEntry without either needing to be widened to match the other.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ActivityIndicator, Dialog, Portal } from 'react-native-paper';
import { SeriesTitleText } from './SeriesTitleText';
import { getEntryImageUrl } from '@/repositories/EntryImageRepository';
import { colors, radii } from '@/theme/colors';

export interface EntryImageTarget {
  malId: number;
  title: string;
}

export function EntryImageDialog({ entry, onDismiss }: { entry: EntryImageTarget | null; onDismiss: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setLoading(true);
    setImageUrl(null);
    getEntryImageUrl(entry.malId).then((url) => {
      if (!cancelled) {
        setImageUrl(url);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Portal>
      <Dialog visible={entry !== null} onDismiss={onDismiss}>
        {entry && (
          <>
            <Dialog.Title>
              <SeriesTitleText variant="titleLarge">{entry.title}</SeriesTitleText>
            </Dialog.Title>
            <Dialog.Content>
              <View style={styles.imageBox}>
                {loading ? (
                  <ActivityIndicator />
                ) : imageUrl ? (
                  <Image source={imageUrl} style={styles.image} contentFit="cover" />
                ) : (
                  <View style={styles.image} />
                )}
              </View>
            </Dialog.Content>
          </>
        )}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  imageBox: { alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  image: { width: 200, height: 280, borderRadius: radii.md, backgroundColor: colors.border },
});
