// Preview screen for a show that isn't in the library yet — reached by tapping a "For you"
// recommendation. Same gradient-banner/status-chip/season-list shape as the real Series Detail
// screen (app/series/[id].tsx), so a show reads the same whether you're already tracking it or
// not, but two things differ because there's nothing tracked yet: an info button shows the MAL
// synopsis (the real Detail screen has no need for that — you already know the show once you're
// tracking it), and picking a status *adds* the show rather than editing an existing one, then
// hands off to the real Detail screen for that new local id.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, Chip, Dialog, IconButton, Portal, Snackbar, Text } from 'react-native-paper';
import { addDiscoveredSeries } from '@/repositories/DiscoverRepository';
import { getSynopsis } from '@/repositories/SynopsisRepository';
import { ADD_STATUS_CHOICES, type AddChoice } from '@/domain/statusLabel';
import { numberEntriesByKind } from '@/domain/series';
import { AiringBadge } from '@/components/AiringBadge';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { EntryImageDialog, type EntryImageTarget } from '@/components/EntryImageDialog';
import { DetailHeroCard } from '@/components/web/DetailHeroCard';
import { colors, radii, spacing } from '@/theme/colors';
import { ADD_CHOICE_CHIP_LABELS } from '@/theme/statusChipLabels';
import { dialogStyle } from '@/theme/dialog';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import type { ReconcileEntry, ReconcileSeries } from '@/domain/reconcileSeries';

export default function SeriesPreviewScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideWeb = useIsWideWeb();
  // Handed the whole already-fetched ReconcileSeries as a route param rather than re-fetching by
  // id — the caller (Recommendations) already has it in memory from building the "For you" list.
  const series: ReconcileSeries = useMemo(() => JSON.parse(data), [data]);

  const [imagePopupEntry, setImagePopupEntry] = useState<EntryImageTarget | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [synopsisLoading, setSynopsisLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function openInfo() {
    setInfoVisible(true);
    if (synopsis === null && !synopsisLoading) {
      setSynopsisLoading(true);
      getSynopsis(series.rootMalId).then((text) => {
        setSynopsis(text ?? 'No summary available.');
        setSynopsisLoading(false);
      });
    }
  }

  // Picking a status here doesn't edit anything — it's the moment this show actually joins the
  // library. Once it does, this preview no longer applies (there's a real, trackable series now),
  // so replace (not push) hands off straight to its real Detail screen.
  async function pickStatus(choice: AddChoice) {
    if (adding) return;
    setAdding(true);
    try {
      const newId = await addDiscoveredSeries(series, choice);
      router.replace(`/series/${newId}`);
    } catch (e) {
      setAdding(false);
      setAddError(e instanceof Error ? e.message : 'Could not add this show. Please try again.');
    }
  }

  if (isWideWeb) {
    return (
      <>
      <DetailHeroCard
        coverUrl={series.coverUrl}
        title={series.title}
        statusText={series.rating != null ? `★ ${series.rating.toFixed(2)}` : undefined}
        genres={series.genres.join(' · ')}
        onBack={() => router.back()}
        topRight={<IconButton icon="information-outline" iconColor="#fff" accessibilityLabel="Show summary" onPress={openInfo} />}
      >
        <View style={styles.webEntriesColumn}>
          {series.entries.length > 0 && <Text style={styles.webSectionLabel}>SEASONS &amp; MOVIES</Text>}
          <View style={styles.webEntriesList}>
            {numberEntriesByKind(series.entries).map((item) => (
              <PreviewEntryRow
                key={item.entry.malId}
                entry={item.entry}
                kindNumber={item.kindNumber}
                onOpenInfo={() => setImagePopupEntry(item.entry)}
              />
            ))}
          </View>
        </View>
        <View style={styles.webStatusColumn}>
          <Text style={styles.webSectionLabel}>ADD AS</Text>
          <View style={styles.webStatusChipList}>
            {ADD_STATUS_CHOICES.map((choice) => (
              <Pressable key={choice} disabled={adding} onPress={() => pickStatus(choice)} style={styles.webStatusChip}>
                <Text style={styles.webStatusChipText}>{ADD_CHOICE_CHIP_LABELS[choice]}</Text>
              </Pressable>
            ))}
          </View>
          {adding && <ActivityIndicator style={styles.webAddingSpinner} />}
        </View>
      </DetailHeroCard>
      <EntryImageDialog entry={imagePopupEntry} onDismiss={() => setImagePopupEntry(null)} />
      <Portal>
        <Dialog visible={infoVisible} onDismiss={() => setInfoVisible(false)} style={dialogStyle}>
          <Dialog.Title>
            <SeriesTitleText variant="titleLarge">{series.title}</SeriesTitleText>
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.synopsisScrollArea}>
            <ScrollView contentContainerStyle={styles.synopsisContent}>
              {synopsisLoading ? <ActivityIndicator /> : <Text variant="bodyMedium">{synopsis}</Text>}
            </ScrollView>
          </Dialog.ScrollArea>
        </Dialog>
      </Portal>
      <Snackbar visible={addError !== null} onDismiss={() => setAddError(null)} duration={4000} style={styles.webToast}>
        {addError}
      </Snackbar>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={[colors.primary, colors.heroGradientEnd]} style={[styles.banner, { paddingTop: insets.top }]}>
        <View style={styles.bannerTopRow}>
          <IconButton icon="arrow-left" iconColor="#fff" onPress={() => router.back()} />
          <IconButton icon="information-outline" iconColor="#fff" accessibilityLabel="Show summary" onPress={openInfo} />
        </View>
        <View style={styles.bannerContent}>
          <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
          <View style={styles.bannerText}>
            <SeriesTitleText variant="headlineSmall" style={styles.bannerTitle} numberOfLines={3}>
              {series.title}
            </SeriesTitleText>
            {series.rating != null && (
              <View style={styles.ratingPill}>
                <Text variant="labelLarge" style={styles.ratingPillText}>
                  ★ {series.rating.toFixed(2)}
                </Text>
              </View>
            )}
            {series.genres.length > 0 && (
              <Text variant="bodyMedium" style={styles.genres}>
                {series.genres.join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

      <Text variant="labelLarge" style={styles.addPrompt}>
        Not in your library — add it as:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusChipRow} contentContainerStyle={styles.statusChipRowContent}>
        {ADD_STATUS_CHOICES.map((choice) => (
          <Chip
            key={choice}
            disabled={adding}
            onPress={() => pickStatus(choice)}
            style={styles.statusChip}
            textStyle={styles.statusChipText}
          >
            {ADD_CHOICE_CHIP_LABELS[choice]}
          </Chip>
        ))}
        {adding && <ActivityIndicator style={styles.addingSpinner} />}
      </ScrollView>

      {series.entries.length > 0 && (
        <View style={styles.sectionLabelRow}>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            SEASONS &amp; MOVIES
          </Text>
        </View>
      )}
      <FlatList
        style={styles.entryList}
        data={numberEntriesByKind(series.entries)}
        keyExtractor={({ entry }) => String(entry.malId)}
        renderItem={({ item }) => (
          <PreviewEntryRow entry={item.entry} kindNumber={item.kindNumber} onOpenInfo={() => setImagePopupEntry(item.entry)} />
        )}
      />
      <EntryImageDialog entry={imagePopupEntry} onDismiss={() => setImagePopupEntry(null)} />

      <Portal>
        <Dialog visible={infoVisible} onDismiss={() => setInfoVisible(false)} style={dialogStyle}>
          <Dialog.Title>
            <SeriesTitleText variant="titleLarge">{series.title}</SeriesTitleText>
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.synopsisScrollArea}>
            <ScrollView contentContainerStyle={styles.synopsisContent}>
              {synopsisLoading ? (
                <ActivityIndicator />
              ) : (
                <Text variant="bodyMedium">{synopsis}</Text>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
        </Dialog>
      </Portal>
      <Snackbar visible={addError !== null} onDismiss={() => setAddError(null)} duration={4000}>
        {addError}
      </Snackbar>
    </View>
  );
}

/** Read-only version of the Detail screen's EntryRow — nothing here is trackable yet, so there's
 * no checkbox or won't-watch control, just what the season/movie is. Tapping the title still opens
 * the info popup, same as the real Detail screen. */
function PreviewEntryRow({ entry, kindNumber, onOpenInfo }: { entry: ReconcileEntry; kindNumber: number; onOpenInfo: () => void }) {
  const kindLabel = entry.kind === 'MOVIE' ? `Movie ${kindNumber}` : `Season ${kindNumber}`;
  const detail =
    entry.kind === 'MOVIE' ? "doesn't count toward X/Y" : `${entry.episodeCount} episode${entry.episodeCount === 1 ? '' : 's'}`;

  return (
    <Pressable style={styles.entryRow} onPress={onOpenInfo}>
      <View style={styles.entryText}>
        <Text variant="bodyLarge" style={styles.entryTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text variant="bodySmall" style={styles.entrySubtitle}>
          {kindLabel} · {detail}
        </Text>
      </View>
      {entry.airingStatus === 'AIRING' && <AiringBadge />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  banner: { paddingBottom: spacing.xl, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  bannerTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bannerContent: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg },
  cover: { width: 104, height: 148, borderRadius: radii.lg, backgroundColor: 'rgba(255,255,255,0.15)' },
  bannerText: { flex: 1, gap: spacing.sm, paddingTop: spacing.xs },
  bannerTitle: { color: '#fff' },
  ratingPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  ratingPillText: { color: '#fff', fontFamily: fontFamilies.bodyBold },
  genres: { color: '#D3E3F3' },
  addPrompt: { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  statusChipRow: { marginTop: spacing.sm, flexGrow: 0, flexShrink: 0, minHeight: 34 },
  entryList: { flex: 1 },
  statusChipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  statusChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusChipText: { fontFamily: fontFamilies.bodySemiBold, color: colors.textMuted },
  addingSpinner: { marginLeft: spacing.sm },
  sectionLabelRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  sectionLabel: { color: colors.textFaint, letterSpacing: 1 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  entryText: { flex: 1 },
  entryTitle: { color: colors.textPrimary },
  entrySubtitle: { color: colors.textFaint, marginTop: 2 },
  synopsisScrollArea: { maxHeight: 360 },
  synopsisContent: { paddingVertical: spacing.sm },

  // --- Wide web ---
  webEntriesColumn: { flex: 1, minWidth: 0 },
  webSectionLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11.5, letterSpacing: 1.4, color: colors.textFaint, marginBottom: 12 },
  webEntriesList: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden' },
  webStatusColumn: { width: 240, flexShrink: 0 },
  webStatusChipList: { gap: 7, marginTop: 12 },
  webStatusChip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radii.md - 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  webStatusChipText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: colors.textMuted },
  webAddingSpinner: { marginTop: 12 },
  webToast: { alignSelf: 'center', borderRadius: radii.lg, backgroundColor: colors.primaryDark },
});
