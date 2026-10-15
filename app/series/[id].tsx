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
import { ActivityIndicator, Button, Chip, Dialog, IconButton, Portal, Snackbar, Text } from 'react-native-paper';
import {
  useSeries,
  deleteSeries,
  refetchLibrary,
  setEntryWatchState,
  setArcWatched,
  setSeriesLiked,
  setSeriesManualStatus,
  clearNewSeasonAvailable,
} from '@/repositories/AnimeRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { LoadFailure } from '@/components/LoadFailure';
import { MANUAL_STATUS_CHOICES, progressPhrase, statusLabel } from '@/domain/statusLabel';
import { entryProgress, hasVisibleNewSeasonAlert, numberEntriesByKind, type Series, type SeriesEntry } from '@/domain/series';
import { arcsForMalId, type Arc } from '@/domain/arcs';
import { getSynopsis } from '@/repositories/SynopsisRepository';
import { AiringBadge } from '@/components/AiringBadge';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import { EntryImageDialog } from '@/components/EntryImageDialog';
import { MalAttribution } from '@/components/MalAttribution';
import { DetailHeroCard } from '@/components/web/DetailHeroCard';
import { WebShell } from '@/components/web/WebShell';
import { radii, spacing } from '@/theme/colors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';
import { dialogStyle } from '@/theme/dialog';
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
  const styles = useStyles();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { series, isLoading: libraryLoading, error: libraryError } = useSeries(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWideWeb = useIsWideWeb();
  const [imagePopupEntry, setImagePopupEntry] = useState<SeriesEntry | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [synopsis, setSynopsis] = useState<string | null>(null);
  // Collapsed to a few lines by default and expandable on tap: a MAL synopsis regularly runs to
  // several paragraphs, which would push the season list — the thing this screen is actually for —
  // off the bottom of the phone screen.
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);

  // The show's own summary, matching the one the preview screen shows before you add it (a tracked
  // show shouldn't be the version with *less* information). Same cached detail response the rest of
  // the app reads, keyed on the series' root MAL id, so this is normally a cache hit rather than a
  // MAL request. A null result renders nothing at all — a missing summary is not worth an empty box.
  const rootMalId = series?.rootMalId ?? null;
  useEffect(() => {
    if (rootMalId === null) return;
    let cancelled = false;
    getSynopsis(rootMalId).then((text) => {
      if (!cancelled) setSynopsis(text?.trim() || null);
    });
    return () => {
      cancelled = true;
    };
  }, [rootMalId]);

  // Every write here is now a network call that can fail (optimistic — see AnimeRepository.ts —
  // so it rolls back on its own, but the user still needs to be told why their tap didn't stick).
  // Wraps the fire-and-forget writes below rather than making every onPress an async handler.
  function runWrite(write: () => Promise<void>) {
    write().catch((e) => setErrorMessage(userFacingMessage(e, "That didn't save — your change was undone.")));
  }

  // "New season!" is a nudge to come look, not a persistent status — opening the series it's
  // about is the natural point to dismiss it, same as reading a notification.
  useEffect(() => {
    // Passive/background dismissal, not a user-initiated write — a failure here just means the
    // badge reappears next visit, not worth a snackbar. Explicit catch to avoid an unhandled
    // rejection warning.
    if (series?.newSeasonAvailable) clearNewSeasonAvailable(series.id).catch(() => {});
  }, [series?.id, series?.newSeasonAvailable]);

  // Three genuinely different reasons there's no series to show, which all used to render the same
  // "Not found" dead end — with no back button, on a screen that has no tab bar of its own.
  if (libraryLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (libraryError) {
    return (
      <LoadFailure
        message={userFacingMessage(libraryError, "Couldn't load this show.")}
        onRetry={() => refetchLibrary()}
        secondaryLabel="Back to library"
        onSecondary={() => router.back()}
      />
    );
  }
  if (!series) {
    return (
      <View style={styles.empty}>
        <Text variant="bodyLarge" style={styles.emptyText}>
          This show isn&apos;t in your library.
        </Text>
        <Button mode="contained" buttonColor={colors.primary} onPress={() => router.back()}>
          Back to library
        </Button>
      </View>
    );
  }

  const canLike = LIKEABLE_STATUS_KINDS.includes(series.status.kind);
  // "3/5 seasons, 2/3 movies" — the same phrase the status pill above the list is built from, so
  // the two can be read against each other at a glance. Empty only for a series with no entries,
  // which grouping can't produce; both registers below render no count rather than a blank one.
  const progressText = progressPhrase(entryProgress(series.entries));

  // Navigates away first, then commits: the delete is optimistic, so staying here would leave the
  // screen rendering a series that's already gone from the cache ("Not found") for a beat. Errors
  // still surface — the Library screen this returns to shows its own snackbar path... which it
  // doesn't for this, so the alert is kept simple: a failed delete rolls the row back into the
  // list, which is itself the visible feedback.
  function confirmRemove() {
    setRemoveConfirmVisible(false);
    router.back();
    deleteSeries(series!.id).catch(() => {});
  }

  // Shared by both layouts — same text, same tap-to-expand, just placed differently.
  const synopsisBlock = synopsis && (
    <Pressable onPress={() => setSynopsisExpanded((current) => !current)}>
      <Text
        variant="bodyMedium"
        numberOfLines={synopsisExpanded ? undefined : 3}
        style={styles.synopsis}
      >
        {synopsis}
      </Text>
      <Text variant="labelSmall" style={styles.synopsisToggle}>
        {synopsisExpanded ? 'Show less' : 'Read more'}
      </Text>
    </Pressable>
  );

  const removeConfirmDialog = (
    <Portal>
      <Dialog visible={removeConfirmVisible} onDismiss={() => setRemoveConfirmVisible(false)} style={dialogStyle}>
        <Dialog.Title>Remove from library?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            &quot;{series.title}&quot; and everything you&apos;ve marked watched on it will be removed from your
            library. Your MyAnimeList account isn&apos;t touched, and you can add the show again from Discover.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setRemoveConfirmVisible(false)}>Cancel</Button>
          <Button textColor={colors.red} onPress={confirmRemove}>
            Remove
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  if (isWideWeb) {
    return (
      <WebShell>
      <DetailHeroCard
        coverUrl={series.coverUrl}
        title={series.title}
        statusText={statusLabel(series.status)}
        statusColor={statusDotColor(series.status.kind)}
        genres={series.genres.join(' · ')}
        onBack={() => router.back()}
        // Both buttons say what they do on hover (and on long-press, which is what Paper's
        // Tooltip does on a phone). They are icon-only and one is destructive — the critique
        // flagged unlabeled IconButtons, and the heart had no accessibilityLabel at all, so it
        // was unreadable to a screen reader as well as ambiguous to everyone else.
        topRight={
          <View style={styles.heroActions}>
            {canLike && (
              <HeroActionButton
                icon={series.liked ? 'heart' : 'heart-outline'}
                // Red only when filled. The outline stays white so it reads as an available
                // action against the gradient rather than a permanently-on state.
                iconColor={series.liked ? colors.red : '#fff'}
                caption={series.liked ? 'Remove from liked' : 'Like to improve recommendations'}
                accessibilityLabel={series.liked ? 'Remove from liked' : 'Mark as liked'}
                onPress={() => runWrite(() => setSeriesLiked(series.id, !series.liked))}
              />
            )}
            <HeroActionButton
              icon="trash-can-outline"
              iconColor="#fff"
              caption="Remove from library"
              accessibilityLabel="Remove from library"
              onPress={() => setRemoveConfirmVisible(true)}
            />
          </View>
        }
      >
        <View style={styles.webEntriesColumn}>
          {synopsisBlock && <View style={styles.webSynopsisBlock}>{synopsisBlock}</View>}
          <View style={styles.webSectionLabelRow}>
            <Text style={styles.webSectionLabel}>SEASONS &amp; MOVIES</Text>
            {progressText.length > 0 && <Text style={styles.webSectionCount}>{progressText}</Text>}
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
      {removeConfirmDialog}
      <Snackbar visible={errorMessage !== null} onDismiss={() => setErrorMessage(null)} duration={4000} style={styles.webToast}>
        {errorMessage}
      </Snackbar>
      </WebShell>
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
          {/* Same pair as the wide-web hero above, same tooltips and same red fill — see there. */}
          <View style={styles.heroActions}>
            {canLike && (
              <HeroActionButton
                icon={series.liked ? 'heart' : 'heart-outline'}
                iconColor={series.liked ? colors.red : 'rgba(255,255,255,0.85)'}
                caption={series.liked ? 'Remove from liked' : 'Like to improve recommendations'}
                accessibilityLabel={series.liked ? 'Remove from liked' : 'Mark as liked'}
                onPress={() => runWrite(() => setSeriesLiked(series.id, !series.liked))}
              />
            )}
            <HeroActionButton
              icon="trash-can-outline"
              iconColor="rgba(255,255,255,0.85)"
              caption="Remove from library"
              accessibilityLabel="Remove from library"
              onPress={() => setRemoveConfirmVisible(true)}
            />
          </View>
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

      {synopsisBlock && <View style={styles.synopsisRow}>{synopsisBlock}</View>}

      {/* Gated on there being entries at all, not on there being *seasons*: the old
          `seasons > 0` gate meant a standalone movie's Detail screen got no header and no count,
          so the one thing it has to track was the one thing with no number attached to it. */}
      {series.entries.length > 0 && (
        <View style={styles.sectionLabelRow}>
          <Text variant="labelLarge" style={styles.sectionLabel}>
            SEASONS &amp; MOVIES
          </Text>
          <Text variant="labelLarge" style={styles.sectionCount}>
            {progressText}
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
      {removeConfirmDialog}
      {/* This screen displays MAL data (cover art, episode counts, synopsis) and was the only one
          in the app carrying no attribution line — guardrail #4 asks for it wherever that data is
          shown, not just on the list screens. The wide-web branch above says the same thing in its
          status column footnote. */}
      <MalAttribution />
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
/**
 * A hero icon button that names itself on hover.
 *
 * Paper's own `Tooltip` was tried first and removed: it waits 1500ms before hiding, draws a 32px
 * near-black Material pill that belongs to a different design language than this gradient header,
 * and its press container sets `cursor: 'default'`, which silently removed the pointer cursor from
 * the two buttons it wrapped.
 *
 * This is small white text on the gradient instead. It is absolutely positioned so appearing and
 * disappearing never reflows the row, and `useHover` is a no-op off-web (touch has no hover), so
 * on a phone this renders exactly as a plain IconButton. The caption therefore cannot be the only
 * place something important is said — `accessibilityLabel` carries the same meaning and is what
 * both platforms surface to a screen reader. The caption says what the button is *for* rather than
 * what it is ("Like to improve recommendations"), because nothing else in the app mentions that
 * liking a show changes what it suggests.
 */
function HeroActionButton({
  icon,
  iconColor,
  caption,
  accessibilityLabel,
  onPress,
}: {
  icon: string;
  iconColor: string;
  caption: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const [hovered, hoverHandlers] = useHover();
  return (
    <View style={styles.heroAction}>
      <IconButton
        icon={icon}
        iconColor={iconColor}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        {...hoverHandlers}
      />
      {hovered && (
        <Text variant="labelSmall" style={styles.heroActionCaption} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

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
  const styles = useStyles();
  const colors = useThemeColors();
  const watched = entry.watchState === 'WATCHED';
  const wontWatch = entry.watchState === 'WONT_WATCH';
  const toggleWatched = () => runWrite(() => setEntryWatchState(entry.id, watched ? 'UNWATCHED' : 'WATCHED'));
  const toggleWontWatch = () => runWrite(() => setEntryWatchState(entry.id, wontWatch ? 'UNWATCHED' : 'WONT_WATCH'));

  // "Season 2" / "Movie 1" rather than a generic "TV Season" — with a long show title truncated
  // to one line, that generic label was the only thing that could tell two same-named seasons
  // apart, and it couldn't.
  const kindLabel = entry.kind === 'MOVIE' ? `Movie ${kindNumber}` : `Season ${kindNumber}`;
  // A season adds its episode count; a movie adds nothing. It used to add "doesn't count toward
  // X/Y", which stopped being true when the dual count landed — a film is its own half of the
  // rollup now (seriesStatus.ts's watchedMovies/totalMovies, and WATCHED needs both halves
  // resolved), so the row was flatly contradicting the counter above it. There's no runtime or
  // release year on a SeriesEntry to put there instead, so "Movie 1" alone is what's left, and it
  // is the part that was carrying the meaning anyway.
  const detail = entry.kind === 'MOVIE' ? null : `${entry.episodeCount} episode${entry.episodeCount === 1 ? '' : 's'}`;
  const trailing = wontWatch ? "Won't watch" : detail;
  const subtitle = trailing === null ? kindLabel : `${kindLabel} · ${trailing}`;

  // The row is a plain View with three sibling controls, not a Pressable wrapping two more.
  // react-native-web turns accessibilityRole="button" into a real <button> (see
  // propsToAccessibilityComponent's roleComponents map), and Paper's IconButton below renders
  // another — HTML forbids interactive content inside a button, so the nested version logged a
  // validateDOMNesting error on every Detail screen. Siblings are also what a screen reader and
  // the tab key want here: three independent actions, not one button hiding two.
  //
  // The press target is the text block rather than the whole row. It is already flex: 1, so it
  // fills everything between the checkbox and the skip button; what is given up is the row's
  // horizontal padding and the gaps, which you would have to aim at to hit. Decided 2026-10-14.
  return (
    <View style={styles.entryRow}>
      <SquareCheckbox checked={watched} onPress={toggleWatched} accessibilityLabel={`Mark ${entry.title} as watched`} />
      <Pressable
        style={styles.entryText}
        onPress={onOpenInfo}
        accessibilityRole="button"
        accessibilityLabel={`${entry.title}, ${subtitle}`}
        accessibilityHint="Opens the full title, cover art and summary"
      >
        <Text variant="bodyLarge" style={wontWatch ? styles.wontWatchTitle : styles.entryTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text variant="bodySmall" style={styles.entrySubtitle}>
          {subtitle}
        </Text>
      </Pressable>
      {entry.airingStatus === 'AIRING' && <AiringBadge />}
      <IconButton
        icon={wontWatch ? 'close-circle' : 'close-circle-outline'}
        iconColor={wontWatch ? colors.red : colors.textFaint}
        size={22}
        // Paper sizes an IconButton's container from its icon, which at 22 lands well under the
        // 44pt/48dp minimum. The glyph stays 22; the tappable area doesn't.
        style={styles.iconButtonTarget}
        onPress={toggleWontWatch}
        accessibilityLabel={wontWatch ? `Un-skip ${entry.title}` : `Mark ${entry.title} as won't watch`}
      />
    </View>
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
  const styles = useStyles();
  const watchedKeys = new Set(entry.watchedArcKeys ?? []);

  return (
    <View>
      {/* Same shape as EntryRow above, and for the same reason: the press target is the text
          block, the row itself is a plain container. This header holds no other control today, but
          keeping the two structurally identical is what stops one of them growing a nested button
          again the next time either is touched. */}
      <View style={styles.entryRow}>
        <Pressable
          style={styles.entryText}
          onPress={onOpenInfo}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title}, season ${kindNumber}, ${watchedKeys.size} of ${arcs.length} arcs watched`}
          accessibilityHint="Opens the full title, cover art and summary"
        >
          <Text variant="bodyLarge" style={styles.entryTitle} numberOfLines={1}>
            {entry.title}
          </Text>
          <Text variant="bodySmall" style={styles.entrySubtitle}>
            Season {kindNumber} · {watchedKeys.size} of {arcs.length} arcs
          </Text>
        </Pressable>
      </View>
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
  const styles = useStyles();
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverHandlers}
      accessibilityRole="radio"
      accessibilityState={{ selected: active, checked: active }}
      accessibilityLabel={label}
      style={[styles.webStatusChip, active && styles.webStatusChipActive, !active && hovered && styles.webStatusChipHovered]}
    >
      <Text style={[styles.webStatusChipText, active && styles.webStatusChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  banner: { paddingBottom: spacing.xl, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  bannerTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  heroActions: { flexDirection: 'row', alignItems: 'center' },
  heroAction: { alignItems: 'center' },
  // Absolute so showing it never shifts the buttons beside it. `top` clears the 40px IconButton
  // container (36px icon box + its 6px margin, less a couple to sit close).
  //
  // `right: 0` rather than centred: these buttons sit at the right edge of the header, and a
  // caption long enough to be useful ("Like to improve recommendations") would run off the card,
  // which clips it — the card sets overflow: hidden. Anchored right, it grows inward over the
  // gradient instead. Only one is ever visible at a time, so the two cannot collide.
  heroActionCaption: {
    position: 'absolute',
    top: 40,
    right: 0,
    color: '#fff',
    opacity: 0.92,
    fontSize: 11,
  },
  bannerContent: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.lg },
  cover: { width: 104, height: 148, borderRadius: radii.lg, backgroundColor: 'rgba(255,255,255,0.15)' },
  bannerText: { flex: 1, gap: spacing.sm, paddingTop: spacing.xs },
  bannerTitle: { color: '#fff' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { color: '#fff', fontFamily: fontFamilies.bodyBold },
  genres: { color: colors.heroMutedText },
  // 44 rather than 34 — these chips are the status editor, and were below both platforms' minimum
  // touch target. The row grows with them so nothing clips at larger text sizes.
  statusChipRow: { marginTop: spacing.lg, flexGrow: 0, flexShrink: 0, minHeight: 44 },
  entryList: { flex: 1 },
  statusChipRowContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  statusChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontFamily: fontFamilies.bodySemiBold, color: colors.textMuted },
  statusChipTextActive: { fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
  synopsisRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  synopsis: { color: colors.textMuted, lineHeight: 21 },
  // Bold for the same reason as AddSeriesDialog's — see there.
  synopsisToggle: { color: colors.primary, fontFamily: fontFamilies.bodyBold, marginTop: spacing.xs },
  sectionLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  sectionLabel: { color: colors.textFaint, letterSpacing: 1 },
  sectionCount: { color: colors.textFaint },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconButtonTarget: { width: 48, height: 48, margin: 0 },
  arcRow: { paddingLeft: spacing.xl },
  entryText: { flex: 1 },
  entryTitle: { color: colors.textPrimary },
  entrySubtitle: { color: colors.textFaint, marginTop: 2 },
  // Struck through rather than hidden — a skipped season still belongs in the list, it just
  // shouldn't read as something outstanding.
  wontWatchTitle: { textDecorationLine: 'line-through', color: colors.textFaint },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl, backgroundColor: colors.background },
  emptyText: { textAlign: 'center', color: colors.textPrimary },

  // --- Wide web ---
  webEntriesColumn: { flex: 1, minWidth: 0 },
  webSynopsisBlock: { marginBottom: 20 },
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
}));
