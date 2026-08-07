// Recommendations screen (Phase 6) — CLAUDE.md §7. Two genuinely separate lists, not one blended
// feed, because they answer different questions:
//
//   "Catch up" — purely local. Unwatched TV seasons inside series that are already Watched /
//                Watched X/Y. No API calls, always instant. This is "finish what you started".
//   "For you"  — MAL-based tally + genre affinity over whole *series*. Needs the same multi-stage
//                fetch as Discover/Reconcile, so it gets the same progress-state treatment. This
//                is "try something new".
//
// They're split across a SegmentedButtons toggle rather than stacked as two sections in one
// scroll: with a large library the catch-up list runs long enough that the recommendations below
// it were effectively hidden, and conflating "seasons you skipped" with "shows you've never seen"
// blurs the distinction the two lists exist to draw in the first place.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, SectionList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Dialog,
  IconButton,
  Portal,
  RadioButton,
  SegmentedButtons,
  Text,
  useTheme,
} from 'react-native-paper';
import { MalAttribution } from '@/components/MalAttribution';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { fetchRecommendations, useCatchUp, type RecommendProgress } from '@/repositories/RecommendationRepository';
import { clearApiCache } from '@/repositories/apiCache';
import { splitCatchUpByKind, splitRecommendationsByType, type CatchUpItem } from '@/domain/recommendations';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { colors, spacing } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';

type ScreenState =
  | { kind: 'LOADING'; message: string }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'ERROR'; message: string };

type Tab = 'CATCH_UP' | 'FOR_YOU';

// "For you" only — Catch up has no MAL rating to sort by (its entries are already-tracked local
// seasons, never fetched with `mean`). RECOMMENDED keeps the repository's own MAL-tally/genre-
// affinity ranking (see RecommendationRepository), which is lost the instant a rating sort runs.
type SortMode = 'RECOMMENDED' | 'RATING';

// A stable empty array, so the "no recommendations yet" render path doesn't hand a fresh []
// to the genre-options memo on every render and defeat it.
const EMPTY_SERIES: ReconcileSeries[] = [];

/** Drops sections with nothing in them, so an all-seasons backlog shows no empty "Movies" header. */
function nonEmptySections<T>(sections: { title: string; data: T[] }[]): { title: string; data: T[] }[] {
  return sections.filter((section) => section.data.length > 0);
}

export default function RecommendScreen() {
  const router = useRouter();
  // The screen paints its own background so the sticky section headers below can match it exactly.
  // Left to the navigator's default, the header band reads as a lighter stripe over a greyer page.
  const theme = useTheme();
  const catchUp = useCatchUp();
  const [state, setState] = useState<ScreenState>({ kind: 'LOADING', message: 'Loading...' });
  const [tab, setTab] = useState<Tab>('CATCH_UP');
  // Empty selection means "no filter" (every genre matches) rather than "match nothing" — a
  // dedicated ALL_GENRES sentinel would need constant special-casing everywhere this is read.
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreDialogVisible, setGenreDialogVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('RECOMMENDED');
  const [sortDialogVisible, setSortDialogVisible] = useState(false);

  function load() {
    setState({ kind: 'LOADING', message: 'Loading...' });
    fetchRecommendations((progress: RecommendProgress) => {
      switch (progress.kind) {
        case 'FETCHING_SOURCES':
          setState({ kind: 'LOADING', message: `Checking your watched series (${progress.completed}/${progress.total})...` });
          break;
        case 'FETCHING_CANDIDATES':
          setState({ kind: 'LOADING', message: `Fetching candidate details (${progress.completed}/${progress.total})...` });
          break;
        case 'GROUPING':
          setState({ kind: 'LOADING', message: `Grouping results (${progress.completed}/${progress.total})...` });
          break;
        case 'READY':
          setState({ kind: 'READY', series: progress.series });
          break;
        case 'FAILED':
          setState({ kind: 'ERROR', message: progress.message });
          break;
      }
    });
  }

  useEffect(load, []);

  // Drops the cached MAL responses before reloading, so this genuinely re-asks MAL rather than
  // rebuilding the same answer from local data. Slow by design — it's the escape hatch for when
  // cached detail has gone stale.
  async function refreshFromMal() {
    await clearApiCache();
    load();
  }

  // "For you" cards open the not-yet-tracked preview screen (full profile + summary + status
  // picker) rather than the quick Add dialog Discover uses — see app/series/preview.tsx.
  function openPreview(series: ReconcileSeries) {
    router.push({ pathname: '/series/preview', params: { data: JSON.stringify(series) } });
  }

  const recommended = state.kind === 'READY' ? state.series : EMPTY_SERIES;

  // The genre chips are built from whatever is actually on screen rather than from MAL's full
  // genre vocabulary — offering a filter that matches nothing is worse than offering fewer.
  // Rebuilt per tab, since the two lists have quite different genre spreads.
  const genreOptions = useMemo(() => {
    const source = tab === 'CATCH_UP' ? catchUp.map((i) => i.series.genres) : recommended.map((s) => s.genres);
    return Array.from(new Set(source.flat())).sort();
  }, [tab, catchUp, recommended]);

  // Genres selected on one tab may not exist on the other; rather than silently showing an empty
  // list under checkboxes that aren't even rendered, drop any selection that's gone stale.
  //
  // `genreOptions` gets a new array identity on every render (useCatchUp's getCatchUpEntries isn't
  // memoized), so this effect re-runs constantly — returning `current` itself (not a same-content
  // copy) when nothing was actually pruned is what keeps setState a no-op then, via React's
  // Object.is bail-out. Without that guard, .filter() with no removals still returns a *new* array
  // every time, which is never Object.is-equal to the last one — setState → re-render → effect
  // fires again → setState, forever ("Maximum update depth exceeded").
  useEffect(() => {
    setSelectedGenres((current) => {
      const pruned = current.filter((g) => genreOptions.includes(g));
      return pruned.length === current.length ? current : pruned;
    });
  }, [genreOptions]);

  function toggleGenre(g: string) {
    setSelectedGenres((current) => (current.includes(g) ? current.filter((x) => x !== g) : [...current, g]));
  }

  // OR, not AND — a show tagged both Action and Comedy should show up whichever of those two the
  // user picked, not require both. Matches how the genre chips read ("Action" + "Comedy" selected
  // means "show me either").
  const matchesGenre = (genres: string[]) =>
    selectedGenres.length === 0 || genres.some((g) => selectedGenres.includes(g));
  const filteredCatchUp = catchUp.filter((item) => matchesGenre(item.series.genres));
  const filteredRecommended = recommended.filter((s) => matchesGenre(s.genres));
  // Rating sort only applies to "For you" — Catch up has no ranking to override in the first place.
  const sortedRecommended =
    sortMode === 'RATING'
      ? [...filteredRecommended].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
      : filteredRecommended;
  const genreButtonLabel =
    selectedGenres.length === 0
      ? 'All genres'
      : selectedGenres.length === 1
        ? selectedGenres[0]
        : `${selectedGenres.length} genres`;

  // Both tabs separate seasons/shows from movies, for the same reason the two tabs exist at all:
  // a long list of one kind otherwise buries a couple of the other at the bottom, unseen.
  const catchUpSplit = splitCatchUpByKind(filteredCatchUp);
  const catchUpSections = nonEmptySections([
    { title: 'Seasons', data: catchUpSplit.seasons },
    { title: 'Movies', data: catchUpSplit.movies },
  ]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Tabs.Screen (see app/(tabs)/_layout.tsx) has headerShown:false, so — unlike the old
          Stack-nested version of this screen — there's no native header to hang the refresh
          action on anymore; this row replaces it. */}
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.headerTitle}>
          For you
        </Text>
        {state.kind === 'LOADING' ? (
          <ActivityIndicator style={styles.headerSpinner} />
        ) : (
          <IconButton icon="refresh" onPress={refreshFromMal} />
        )}
      </View>

      <SegmentedButtons
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        style={styles.tabs}
        buttons={[
          { value: 'CATCH_UP', label: `Catch up${catchUp.length > 0 ? ` (${catchUp.length})` : ''}`, icon: 'play-circle-outline' },
          { value: 'FOR_YOU', label: 'For you', icon: 'star-outline' },
        ]}
      />

      {/* A horizontal scroll of genre chips could run to a dozen-plus entries and had no
          affordance that there was more off-screen — this opens the same choices as a proper list
          in a dialog instead (Paper's anchored Menu measures its position wrong on this RN/Fabric
          version, landing the item list thousands of px off-screen — Dialog has no such anchor
          math, and "opens the list" is arguably the more literal fix anyway). */}
      {(genreOptions.length > 0 || tab === 'FOR_YOU') && (
        <View style={styles.filterButtonsRow}>
          {genreOptions.length > 0 && (
            <Button mode="outlined" icon="filter-variant" onPress={() => setGenreDialogVisible(true)}>
              {genreButtonLabel}
            </Button>
          )}
          {/* Sort has nothing to do with Catch up (it's not ranked, so there's nothing to reorder). */}
          {tab === 'FOR_YOU' && (
            <Button mode="outlined" icon="sort" onPress={() => setSortDialogVisible(true)}>
              {sortMode === 'RATING' ? 'Top rated' : 'Recommended'}
            </Button>
          )}
        </View>
      )}
      <Portal>
        {/* Multi-select — checkboxes rather than radio buttons, and the dialog stays open across
            taps so picking several genres in a row doesn't mean reopening it each time. */}
        <Dialog visible={genreDialogVisible} onDismiss={() => setGenreDialogVisible(false)}>
          <Dialog.Title>Filter by genre</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <FlatList
              data={genreOptions}
              keyExtractor={(g) => g}
              renderItem={({ item: g }) => (
                <Checkbox.Item
                  label={g}
                  status={selectedGenres.includes(g) ? 'checked' : 'unchecked'}
                  onPress={() => toggleGenre(g)}
                />
              )}
            />
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setSelectedGenres([])}>Clear all</Button>
            <Button onPress={() => setGenreDialogVisible(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal>
        <Dialog visible={sortDialogVisible} onDismiss={() => setSortDialogVisible(false)}>
          <Dialog.Title>Sort by</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              value={sortMode}
              onValueChange={(v) => {
                setSortMode(v as SortMode);
                setSortDialogVisible(false);
              }}
            >
              <RadioButton.Item label="Recommended for you" value="RECOMMENDED" />
              <RadioButton.Item label="Highest rated" value="RATING" />
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>

      {tab === 'CATCH_UP' ? (
        <SectionList
          sections={catchUpSections}
          keyExtractor={(item) => String(item.entry.id)}
          contentContainerStyle={styles.list}
          // Not RN's default on Android. Without it the group heading scrolls away and a long
          // backlog gives no way to tell which section you're looking at — which would defeat the
          // point of splitting the list at all.
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
          renderItem={({ item }) => <CatchUpCard item={item} onPress={() => router.push(`/series/${item.series.id}`)} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyLarge">
                {catchUp.length === 0
                  ? "Nothing to catch up on — you're all caught up!"
                  : 'Nothing to catch up on in this genre'}
              </Text>
            </View>
          }
        />
      ) : (
        <ForYouList
          state={state}
          series={sortedRecommended}
          genreFiltered={recommended.length > 0 && filteredRecommended.length === 0}
          onRetry={load}
          onPressCard={openPreview}
        />
      )}

      <MalAttribution />
    </View>
  );
}

/**
 * Sticky group heading for the Seasons/Movies (Catch up) and Series/Movies (For you) splits.
 * The background is taken from the theme rather than hardcoded because it *must* be opaque —
 * a sticky header over a transparent background lets the cards scroll visibly through the text.
 */
function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
      <Text variant="titleSmall">{title}</Text>
    </View>
  );
}

/** One skipped season or film, shown under its parent series' cover so it's clear which show it
 * belongs to — a movie's own title ("Mugen Train") often doesn't name the series at all. */
function CatchUpCard({ item, onPress }: { item: CatchUpItem; onPress: () => void }) {
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content style={styles.cardContent}>
        <Image source={item.series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.cardText}>
          <SeriesTitleText variant="titleMedium" numberOfLines={2}>
            {item.series.title}
          </SeriesTitleText>
          <Text variant="bodyMedium" numberOfLines={2} style={styles.muted}>
            {item.entry.title}
          </Text>
          {item.series.genres.length > 0 && (
            <Text variant="bodySmall" numberOfLines={1} style={styles.muted}>
              {item.series.genres.join(' · ')}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

/**
 * One recommended *series* (or standalone movie) — never an individual season. The subtitle spells
 * out which it is, since "3 seasons" vs "Movie" is the main thing that tells them apart at a glance
 * once the grouping has collapsed a whole sequel chain into a single row.
 */
function RecommendationCard({ series, onPress }: { series: ReconcileSeries; onPress: () => void }) {
  const seasonCount = series.entries.filter((e) => e.kind === 'TV_SEASON').length;
  const subtitle = [
    series.type === 'STANDALONE_MOVIE' ? 'Movie' : 'TV',
    series.seasonLabel,
    seasonCount > 1 ? `${seasonCount} seasons` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content style={styles.cardContent}>
        <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.cardText}>
          <View style={styles.titleRow}>
            <SeriesTitleText variant="titleMedium" numberOfLines={2} style={styles.titleText}>
              {series.title}
            </SeriesTitleText>
            {/* MAL omits `mean` outright for anime with too few scores — shown only when it published one. */}
            {series.rating != null && (
              <View style={styles.ratingBadge}>
                <Text variant="labelMedium" style={styles.ratingText}>
                  ★ {series.rating.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
          <Text variant="bodySmall" style={styles.muted}>
            {subtitle}
          </Text>
          {series.genres.length > 0 && (
            <Text variant="bodySmall" numberOfLines={2} style={styles.muted}>
              {series.genres.join(' · ')}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );
}

function ForYouList({
  state,
  series,
  genreFiltered,
  onRetry,
  onPressCard,
}: {
  state: ScreenState;
  series: ReconcileSeries[];
  genreFiltered: boolean;
  onRetry: () => void;
  onPressCard: (s: ReconcileSeries) => void;
}) {
  if (state.kind === 'LOADING') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge">{state.message}</Text>
      </View>
    );
  }
  if (state.kind === 'ERROR') {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.error}>
          {state.message}
        </Text>
        <Button mode="contained" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }
  const split = splitRecommendationsByType(series);
  const sections = nonEmptySections([
    { title: 'Series', data: split.shows },
    { title: 'Movies', data: split.movies },
  ]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(s) => String(s.rootMalId)}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      renderItem={({ item }) => <RecommendationCard series={item} onPress={() => onPressCard(item)} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text variant="bodyLarge" style={styles.error}>
            {genreFiltered
              ? 'No recommendations in this genre'
              : 'Watch (and like) a few more shows to get recommendations'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { flex: 1, fontFamily: fontFamilies.displayBold, color: colors.textPrimary },
  tabs: { marginHorizontal: 12, marginTop: 12 },
  filterButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingHorizontal: 12 },
  dialogScrollArea: { maxHeight: 400, paddingHorizontal: 0 },
  list: { padding: 12, gap: 8 },
  sectionHeader: { paddingTop: 8, paddingBottom: 4 },
  card: { marginBottom: 4, borderRadius: 16 },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 64, height: 90, borderRadius: 8, backgroundColor: colors.border },
  cardText: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1 },
  ratingBadge: { backgroundColor: colors.amberTint, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { color: colors.amber },
  muted: { color: colors.textMuted },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  headerSpinner: { marginHorizontal: 12 },
  error: { textAlign: 'center' },
});
