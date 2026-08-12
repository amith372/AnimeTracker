// Popup opened by tapping a season/movie's title on the Series Detail screen (or the not-yet-
// tracked show preview screen) — shows the full, untruncated title, that entry's own MAL cover art,
// and a short summary of it. Entries don't carry either locally; only the parent
// Series/ReconcileSeries has a coverUrl, so this fetches fresh via the entry's malId each time it
// opens (one cached detail call for both, see getEntryPreview). Typed to the minimal shape it
// actually needs (not the full SeriesEntry) so it works for both a tracked SeriesEntry and an
// untracked ReconcileEntry without either needing to be widened to match the other.
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ActivityIndicator, Dialog, Portal, Text } from 'react-native-paper';
import { SeriesTitleText } from './SeriesTitleText';
import { getEntryPreview } from '@/repositories/EntryImageRepository';
import { colors, radii, spacing } from '@/theme/colors';
import { dialogStyle } from '@/theme/dialog';

export interface EntryImageTarget {
  malId: number;
  title: string;
}

export function EntryImageDialog({ entry, onDismiss }: { entry: EntryImageTarget | null; onDismiss: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setLoading(true);
    setImageUrl(null);
    setSynopsis(null);
    getEntryPreview(entry.malId).then((preview) => {
      if (!cancelled) {
        setImageUrl(preview.imageUrl);
        setSynopsis(preview.synopsis);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  return (
    <Portal>
      <Dialog visible={entry !== null} onDismiss={onDismiss} style={dialogStyle}>
        {entry && (
          <>
            <Dialog.Title>
              <SeriesTitleText variant="titleLarge">{entry.title}</SeriesTitleText>
            </Dialog.Title>
            {/* ScrollArea rather than plain Content: a MAL synopsis runs to several paragraphs, and
                the dialog is height-capped — without this the summary would simply be cut off with
                no way to read the rest. */}
            <Dialog.ScrollArea style={styles.scrollArea}>
              <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.imageBox}>
                  {loading ? (
                    <ActivityIndicator />
                  ) : imageUrl ? (
                    <Image source={imageUrl} style={styles.image} contentFit="cover" />
                  ) : (
                    <View style={styles.image} />
                  )}
                </View>
                {!loading && (
                  <Text variant="bodyMedium" style={styles.synopsis}>
                    {/* MAL has no synopsis at all for plenty of individual seasons — saying so beats
                        an unexplained empty gap under the cover. */}
                    {synopsis ?? 'No summary available for this one.'}
                  </Text>
                )}
              </ScrollView>
            </Dialog.ScrollArea>
          </>
        )}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  scrollArea: { maxHeight: 460, paddingHorizontal: spacing.lg },
  scrollContent: { paddingVertical: spacing.sm, gap: spacing.lg },
  imageBox: { alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  image: { width: 200, height: 280, borderRadius: radii.md, backgroundColor: colors.border },
  synopsis: { color: colors.textMuted, lineHeight: 21 },
});
