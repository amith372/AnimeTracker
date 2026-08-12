// Series Detail screen — cover art, status, genres, and every season/movie in the series.
// Tapping an entry's checkbox toggles its watched flag; tapping its title opens a popup with the
// full name and that entry's own cover art. Tapping a status chip applies it immediately. All
// writes go straight to SQLite, which useSeries() picks back up reactively — no local component
// state holds the "source of truth," same principle as the old Compose screen watching Room's Flow.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, IconButton, Snackbar, Text } from 'react-native-paper';
import {
  useSeries,
  setEntryWatchState,
  setArcWatched,
  setSeriesLiked,
  setSeriesManualStatus,
  clearNewSeasonAvailable,
} from '@/repositories/AnimeRepository';
import { MANUAL_STATUS_CHOICES, statusLabel } from '@/domain/statusLabel';
import { hasVisibleNewSeasonAlert, numberEntriesByKind, seasonProgress, type Series, type SeriesEntry } from '@/domain/series';
import { arcsForMalId, type Arc } from '@/domain/arcs';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import { EntryImageDialog } from '@/components/EntryImageDialog';
import { DetailHeroCard } from '@/components/web/DetailHeroCard';
import { colors, radii, spacing } from '@/theme/colors';
import { statusDotColor } from '@/theme/statusColors';
import { MANUAL_STATUS_CHIP_LABELS } from '@/theme/statusChipLabels';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import { useHover } from '@/hooks/useHover';
import type { ManualStatus } from '@/domain/types';

// "Liked" only makes sense once there's something to have an opinion on — shown for any status
// that means the user has actually watched some of the series (fully, partially, or "forgot to
// mark"), not for Plan/Currently watching/Dropped.
const LIKEABLE_STATUS_KINDS: Series['status']['kind'][] = ['WATCHED', 'WATCHED_PARTIAL', 'WATCHED_FORGOT'];

// The editor offers NONE on top of the four deliberate statuses — without it there'd be no way
// back from a manual override to the derived Watched / Watched X/Y, making any manual pick a
// one-way door. (The Add dialogs deliberately omit NONE; you'd never *add* a show as auto-derived.)
const EDITABLE_STATUS_CHOICES: ManualStatus[] = [...MANUAL_STATUS_CHOICES, 'NONE'];

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const series = useSeries(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideWeb = useIsWideWeb();
  const [imagePopupEntry, setImagePopupEntry] = useState<SeriesEntry | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Every write here is now a network call that can fail (optimistic — see AnimeRepository.ts —
  // so it rolls back on its own, but the user still needs to be told why their tap didn't stick).
  // Wraps the fire-and-forget writes below rather than making every onPress an async handler.
  function runWrite(write: () => Promise<void>) {
    write().catch((e) => setErrorMessage(e instanceof Error ? e.message : 'Something went wrong'));
  }

  // "New season!" is a nudge to come look, not a persistent status — opening the series it's
  // about is the natural point to dismiss it, same as reading a notification.
  useEffect(() => {
    // Passive/background dismissal, not a user-initiated write — a failure here just means the
    // badge reappears next visit, not worth a snackbar. Explicit catch to avoid an unhandled
    // rejection warning.
    if (series?.newSeasonAvailable) clearNewSeasonAvailable(series.id).catch(() => {});
  }, [series?.id, series?.newSeasonAvailable]);

  if (!series) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyLarge">Not found</Text>
      </View>
    );
  }

  const canLike = LIKEABLE_STATUS_KINDS.includes(series.status.kind);
  const progress = seasonProgress(series.entries);

  if (isWideWeb) {
    return (
      <>
      <DetailHeroCard
        coverUrl={series.coverUrl}
        title={series.title}
        statusText={statusLabel(series.status)}
        genres={series.genres.join(' · ')}
        onBack={() => router.back()}
        topRight={
          canLike ? (
            <IconButton
              icon={series.liked ? 'heart' : 'heart-outline'}
              iconColor="#fff"
              onPress={() => runWrite(() => setSeriesLiked(series.id, !series.liked))}
            />
          ) : undefined
        }
      >
        <View style={styles.webEntriesColumn}>
          <View style={styles.webSectionLabelRow}>
            <Text style={styles.webSectionLabel}>SEASONS &amp; MOVIES</Text>
            {progress.total > 0 && (
              <Text style={styles.webSectionCount}>
                {progress.watched} of {progress.total} {progress.total === 1 ? 'season' : 'seasons'}
              </Text>
            )}
          </View>
          <View style={styles.webEntriesList}>
            {numberEntriesByKind(series.entries).map((item) => {
              const arcs = arcsForMalId(item.entry.malId);
              return arcs ? (
                <ArcListRow
                  key={item.entry.id}
                  entry={item.entry}
                  arcs={arcs}
                  kindNumber={item.kindNumber}
                  onOpenInfo={() => setImagePopupEntry(item.entry)}
                  runWrite={runWrite}
                />
              ) : (
                <EntryRow
                  key={item.entry.id}
                  entry={item.entry}
                  kindNumber={item.kindNumber}
                  onOpenInfo={() => setImagePopupEntry(item.entry)}
                  runWrite={runWrite}
                />
              );
            })}
          </View>
        </View>
        <View style={styles.webStatusColumn}>
          <Text style={styles.webSectionLabel}>STATUS</Text>
          <View style={styles.webStatusChipList}>
            {EDITABLE_STATUS_CHOICES.map((choice) => (
              <WebStatusChip
                key={choice}
                label={MANUAL_STATUS_CHIP_LABELS[choice]}
                active={series.manualStatus === choice}
                onPress={() => runWrite(() => setSeriesManualStatus(series.id, choice))}
              />
            ))}
          </View>
          <Text style={styles.webStatusFootnote}>Data from MyAnimeList · watch marks stay in your account</Text>
        </View>
      </DetailHeroCard>
      <EntryImageDialog entry={imagePopupEntry} onDismiss={() => setImagePopupEntry(null)} />
      <Snackbar visible={errorMessage !== null} onDismiss={() => setErrorMessage(null)} duration={4000} style={styles.webToast}>
        {errorMessage}
      </Snackbar>
      </>
    );
  }

  return (
    <View style={styles.container}>
      {/* The gradient banner draws its own back button — see app/_layout.tsx, which sets
          headerShown:false for this route so there's no native header underneath it. */}
      <StatusBar style="light" />
      {/* The gradient itself extends behind the status bar (an intentional edge-to-edge look),
          but the back/heart buttons need to sit below it — paddingTop: insets.top pushes just the
          interactive content down without adding a visible seam in the gradient. */}
      <LinearGradient colors={[colors.primary, colors.heroGradientEnd]} style={[styles.banner, { paddingTop: insets.top }]}>
        <View style={styles.bannerTopRow}>
          <IconButton icon="arrow-left" iconColor="#fff" onPress={() => router.back()} />
          {canLike && (
            <IconButton
              icon={series.liked ? 'heart' : 'heart-outline'}
              iconColor={series.liked ? '#fff' : 'rgba(255,255,255,0.85)'}
              onPress={() => runWrite(() => setSeriesLiked(series.id, !series.liked))}
            />
          )}
        </View>
        <View style={styles.bannerContent}>
          <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
          <View style={styles.bannerText}>
            <SeriesTitleText variant="headlineSmall" style={styles.bannerTitle} numberOfLines={3}>
              {series.title}
            </SeriesTitleText>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: statusDotColor(series.status.kind) }]} />
              <Text variant="labelLarge" style={styles.statusPillText}>
                {statusLabel(series.status)}
              </Text>
            </View>
            {series.genres.length > 0 && (
              <Text variant="bodyMedium" style={styles.genres}>
                {series.genres.join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusChipRow} contentContainerStyle={styles.statusChipRowContent}>
        {EDITABLE_STATUS_CHOICES.map((choice) => {
          const active = series.manualStatus === choice;
          return (
            <Chip
              key={choice}
              selected={active}
              onPress={() => runWrite(() => setSeriesManualStatus(series.id, choice))}
              style={[styles.statusChip, active && styles.statusChipActive]}
              textStyle={active ? styles.statusChipTextActive : styles.statusChipText}
            >
              {MANUAL_STATUS_CHIP_LABELS[choice]}
            </Chip>
          );
        })}
      </ScrollView>

      {progress.total > 0 && (
        <View style={styles.sectionLabelRow}>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            SEASONS &amp; MOVIES
          </Text>
          <Text variant="labelLarge" style={styles.sectionCount}>
            {progress.watched} of {progress.total} {progress.total === 1 ? 'season' : 'seasons'}
          </Text>
        </View>
      )}

      <FlatList
        style={styles.entryList}
        data={numberEntriesByKind(series.entries)}
        keyExtractor={({ entry }) => String(entry.id)}
        renderItem={({ item }) => {
          const arcs = arcsForMalId(item.entry.malId);
          return arcs ? (
            <ArcListRow entry={item.entry} arcs={arcs} kindNumber={item.kindNumber} onOpenInfo={() => setImagePopupEntry(item.entry)} runWrite={runWrite} />
          ) : (
            <EntryRow entry={item.entry} kindNumber={item.kindNumber} onOpenInfo={() => setImagePopupEntry(item.entry)} runWrite={runWrite} />
          );
        }}
      />
      <EntryImageDialog entry={imagePopupEntry} onDismiss={() => setImagePopupEntry(null)} />
      <Snackbar visible={errorMessage !== null} onDismiss={() => setErrorMessage(null)} duration={4000}>
        {errorMessage}
      </Snackbar>
    </View>
  );
}

/**
 * One season/movie, with each decision kept as its own control: the checkbox toggles watched, the
 * X button toggles "won't watch", and — new — tapping the title opens the full-title/cover-art
 * popup instead of toggling anything. Three separate gestures rather than one that cycles through
 * or conflates them.
 */
function EntryRow({
  entry,
  kindNumber,
  onOpenInfo,
  runWrite,
}: {
  entry: SeriesEntry;
  kindNumber: number;
  onOpenInfo: () => void;
  runWrite: (write: () => Promise<void>) => void;
}) {
  const watched = entry.watchState === 'WATCHED';
  const wontWatch = entry.watchState === 'WONT_WATCH';
  const toggleWatched = () => runWrite(() => setEntryWatchState(entry.id, watched ? 'UNWATCHED' : 'WATCHED'));
  const toggleWontWatch = () => runWrite(() => setEntryWatchState(entry.id, wontWatch ? 'UNWATCHED' : 'WONT_WATCH'));

  // "Season 2" / "Movie 1" rather than a generic "TV Season" — with a long show title truncated
  // to one line, that generic label was the only thing that could tell two same-named seasons
  // apart, and it couldn't.
  const kindLabel = entry.kind === 'MOVIE' ? `Movie ${kindNumber}` : `Season ${kindNumber}`;
  const detail =
    entry.kind === 'MOVIE' ? "doesn't count toward X/Y" : `${entry.episodeCount} episode${entry.episodeCount === 1 ? '' : 's'}`;
  const subtitle = wontWatch ? `${kindLabel} · Won't watch` : `${kindLabel} · ${detail}`;

  return (
    <Pressable style={styles.entryRow} onPress={onOpenInfo}>
      <SquareCheckbox checked={watched} onPress={toggleWatched} accessibilityLabel={`Mark ${entry.title} as watched`} />
      <View style={styles.entryText}>
        <Text variant="bodyLarge" style={wontWatch ? styles.wontWatchTitle : styles.entryTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text variant="bodySmall" style={styles.entrySubtitle}>
          {subtitle}
        </Text>
      </View>
      {entry.airingStatus === 'AIRING' && (
        <Chip compact style={styles.airingBadge} textStyle={styles.airingBadgeText}>
          AIRING
        </Chip>
      )}
      <IconButton
        icon={wontWatch ? 'close-circle' : 'close-circle-outline'}
        iconColor={wontWatch ? colors.red : colors.textFaint}
        size={22}
        onPress={toggleWontWatch}
        accessibilityLabel={wontWatch ? `Un-skip ${entry.title}` : `Mark ${entry.title} as won't watch`}
      />
    </Pressable>
  );
}

/**
 * Arc-level version of EntryRow, used for the one entry that has arcs defined (see domain/arcs.ts
 * — currently only One Piece). Same header shape (title, tap-for-info) as EntryRow, followed by
 * one plain watched checkbox per arc — no won't-watch control here, an arc is either watched or
 * not. The header's own watched/won't-watch controls are dropped: this entry's watchState is
 * derived entirely from the arc checkboxes (see setArcWatched), not set directly.
 */
function ArcListRow({
  entry,
  arcs,
  kindNumber,
  onOpenInfo,
  runWrite,
}: {
  entry: SeriesEntry;
  arcs: Arc[];
  kindNumber: number;
  onOpenInfo: () => void;
  runWrite: (write: () => Promise<void>) => void;
}) {
  const watchedKeys = new Set(entry.watchedArcKeys ?? []);

  return (
    <View>
      <Pressable style={styles.entryRow} onPress={onOpenInfo}>
        <View style={styles.entryText}>
          <Text variant="bodyLarge" style={styles.entryTitle} numberOfLines={1}>
            {entry.title}
          </Text>
          <Text variant="bodySmall" style={styles.entrySubtitle}>
            Season {kindNumber} · {watchedKeys.size} of {arcs.length} arcs
          </Text>
        </View>
      </Pressable>
      {arcs.map((arc) => {
        const watched = watchedKeys.has(arc.key);
        return (
          <View key={arc.key} style={[styles.entryRow, styles.arcRow]}>
            <SquareCheckbox
              checked={watched}
              onPress={() => runWrite(() => setArcWatched(entry.id, arc.key, !watched))}
              accessibilityLabel={`Mark ${arc.title} as watched`}
            />
            <View style={styles.entryText}>
              <Text variant="bodyMedium" style={styles.entryTitle}>
                {arc.title}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One pressable status choice in the wide-web status column — active/onPress logic identical to
 * the mobile status chip row, with hover feedback added (see colors.hoverWash). */
function WebStatusChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable onPress={onPress} {...hoverHandlers} style={[styles.webStatusChip, active && styles.webStatusChipActive, !active && hovered && styles.webStatusChipHovered]}>
      <Text style={[styles.webStatusChipText, active && styles.webStatusChipTextActive]}>{label}</Text>
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
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { color: '#fff', fontFamily: fontFamilies.bodyBold },
  genres: { color: '#D3E3F3' },
  statusChipRow: { marginTop: spacing.lg, flexGrow: 0, flexShrink: 0, minHeight: 34 },
  entryList: { flex: 1 },
  statusChipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  statusChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontFamily: fontFamilies.bodySemiBold, color: colors.textMuted },
  statusChipTextActive: { fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  sectionLabel: { color: colors.textFaint, letterSpacing: 1 },
  sectionCount: { color: colors.textFaint },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  arcRow: { paddingLeft: spacing.xl },
  entryText: { flex: 1 },
  entryTitle: { color: colors.textPrimary },
  entrySubtitle: { color: colors.textFaint, marginTop: 2 },
  // Struck through rather than hidden — a skipped season still belongs in the list, it just
  // shouldn't read as something outstanding.
  wontWatchTitle: { textDecorationLine: 'line-through', color: colors.textFaint },
  airingBadge: { backgroundColor: 'rgba(59,110,165,0.12)', height: 24 },
  airingBadgeText: { fontFamily: fontFamilies.bodyBold, color: colors.primary, fontSize: 9.5, letterSpacing: 0.5, lineHeight: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // --- Wide web ---
  webEntriesColumn: { flex: 1, minWidth: 0 },
  webSectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 },
  webSectionLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11.5, letterSpacing: 1.4, color: colors.textFaint },
  webSectionCount: { fontFamily: fontFamilies.bodyMedium, fontSize: 12.5, color: colors.textFaint },
  webEntriesList: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, overflow: 'hidden' },
  webStatusColumn: { width: 240, flexShrink: 0 },
  webStatusChipList: { gap: 7, marginTop: 12 },
  webStatusChip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radii.md - 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  webStatusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  webStatusChipHovered: { backgroundColor: colors.hoverWash, borderColor: colors.hoverWash },
  webStatusChipText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: colors.textMuted },
  webStatusChipTextActive: { color: '#fff' },
  webStatusFootnote: { fontFamily: fontFamilies.bodyRegular, fontSize: 11, lineHeight: 17.6, color: colors.textFaint, marginTop: 20 },
  webToast: { alignSelf: 'center', borderRadius: radii.lg, backgroundColor: colors.primaryDark },
});
