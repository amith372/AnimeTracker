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
//
// Wide web (see useWebLayout.ts) reshapes both lists from vertical rows into horizontal card rows
// (Catch up inside a tinted band) to match the "AnimeTracker Web" design doc — same
// catchUpSections/ForYouList data and handlers as the mobile branch, just a different scroll
// direction and card shape. See the isWideWeb branches below.
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
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
import { LoadFailure } from '@/components/LoadFailure';
import { refetchLibrary, useTrackedMalIds } from '@/repositories/AnimeRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { useHover } from '@/hooks/useHover';
import { fetchRecommendations, useCatchUp, type RecommendProgress } from '@/repositories/RecommendationRepository';
import { splitCatchUpByKind, splitRecommendationsByType, type CatchUpItem } from '@/domain/recommendations';
import type { ReconcileSeries } from '@/domain/reconcileSeries';
import { LinearGradient } from 'expo-linear-gradient';
import { logoGradient, radii, shadows, spacing } from '@/theme/colors';
import { makeStyles } from '@/theme/useTheme';
import { dialogStyle } from '@/theme/dialog';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';

type ScreenState =
  | { kind: 'LOADING'; message: string }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'ERROR'; message: string };

type Tab = 'CATCH_UP' | 'FOR_YOU';

// "For you" only — Catch up has no MAL rating to sort by (its entries are already-tracked local
// seasons, never fetched with `mean`). RECOMMENDED keeps the repository's own MAL-tally/genre-
// affinity ranking (see RecommendationRepository), which is lost the instant a rating sort runs.
type SortMode = 'RECOMMENDED' | 'RATING';

// "Recommended" only — Catch up's own Seasons/Movies split is already the same distinction, and it
// splits by *entry* kind rather than by what the whole series is.
type TypeFilter = 'ALL' | 'SERIES' | 'MOVIES';

const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  ALL: 'Series & movies',
  SERIES: 'Series only',
  MOVIES: 'Movies only',
};

// A stable empty array, so the "no recommendations yet" render path doesn't hand a fresh []
// to the genre-options memo on every render and defeat it.
const EMPTY_SERIES: ReconcileSeries[] = [];

/** Drops sections with nothing in them, so an all-seasons backlog shows no empty "Movies" header. */
function nonEmptySections<T>(sections: { title: string; data: T[] }[]): { title: string; data: T[] }[] {
  return sections.filter((section) => section.data.length > 0);
}

export default function RecommendScreen() {
  const styles = useStyles();
  const router = useRouter();
  // The screen paints its own background so the sticky section headers below can match it exactly.
  // Left to the navigator's default, the header band reads as a lighter stripe over a greyer page.
  const theme = useTheme();
  const isWideWeb = useIsWideWeb();
  const { items: catchUp, isLoading: catchUpLoading, error: catchUpError } = useCatchUp();
  const [state, setState] = useState<ScreenState>({ kind: 'LOADING', message: 'Loading...' });
  const [tab, setTab] = useState<Tab>('CATCH_UP');
  // Which Catch up kind is showing — Seasons / Movies / Future releases. Held by title rather than
  // an enum because the tab list is built from the sections themselves, so there's one source of
  // truth for what the three are called.
  const [catchUpKind, setCatchUpKind] = useState('Seasons');
  // Empty selection means "no filter" (every genre matches) rather than "match nothing" — a
  // dedicated ALL_GENRES sentinel would need constant special-casing everywhere this is read.
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [genreDialogVisible, setGenreDialogVisible] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('RECOMMENDED');
  const [sortDialogVisible, setSortDialogVisible] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [typeDialogVisible, setTypeDialogVisible] = useState(false);

  function load(opts?: { bypassCache?: boolean }) {
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
    }, opts);
  }

  useEffect(() => load(), []);

  // Skips reading the shared api_cache table (never skips writing it) so this genuinely re-asks
  // MAL rather than rebuilding the same answer from cached data — the escape hatch for when a
  // cached detail has gone stale. Doesn't clear the cache itself: it's shared across every
  // account, so wiping it here would cost everyone else's warm cache too (see apiCache.ts).
  function refreshFromMal() {
    load({ bypassCache: true });
  }

  // "For you" cards open the not-yet-tracked preview screen (full profile + summary + status
  // picker) rather than the quick Add dialog Discover uses — see app/series/preview.tsx.
  function openPreview(series: ReconcileSeries) {
    router.push({ pathname: '/series/preview', params: { data: JSON.stringify(series) } });
  }

  // Recommendations are computed once per load (they cost a pile of MAL calls), but the library
  // they're filtered against is live — so a show added from here, or removed from the Library,
  // re-filters this list on the spot instead of leaving a stale row that's already tracked. Same
  // guard Discover applies via useDiscoverResults; a *fresh* ranking (which a removal could change)
  // still needs the refresh button.
  const trackedMalIds = useTrackedMalIds();
  const loaded = state.kind === 'READY' ? state.series : EMPTY_SERIES;
  const recommended = useMemo(
    () => (trackedMalIds.size === 0 ? loaded : loaded.filter((s) => s.entries.every((e) => !trackedMalIds.has(e.malId)))),
    [loaded, trackedMalIds],
  );

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
  const matchesType = (s: ReconcileSeries) =>
    typeFilter === 'ALL' ||
    (typeFilter === 'MOVIES' ? s.type === 'STANDALONE_MOVIE' : s.type !== 'STANDALONE_MOVIE');
  const filteredRecommended = recommended.filter((s) => matchesGenre(s.genres) && matchesType(s));
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
  // Future releases last, deliberately: it's the section with nothing to actually do, so it sits
  // below the two that are a backlog rather than competing with them for the top of the screen.
  const catchUpSections = nonEmptySections([
    { title: 'Seasons', data: catchUpSplit.seasons },
    { title: 'Movies', data: catchUpSplit.movies },
    { title: 'Future releases', data: catchUpSplit.futureReleases },
  ]);
  // Which of the three the user is looking at. Stacked sections meant a long Seasons backlog buried
  // Movies and Future releases below the fold entirely — the same burying that split Catch up from
  // Recommended in the first place, one level down. Only non-empty kinds get a tab (same rule as
  // the sections had), so this collapses to a single tab, or none, without special-casing.
  const activeCatchUpSection =
    catchUpSections.find((s) => s.title === catchUpKind) ?? catchUpSections[0];
  // The selected kind can vanish under you — tick the last unwatched movie, or pick a genre no
  // film has — so fall back to whatever's left rather than rendering a tab that no longer exists.
  // Guarded so the no-op case doesn't loop: catchUpSections is a fresh array every render.
  useEffect(() => {
    if (activeCatchUpSection && activeCatchUpSection.title !== catchUpKind) {
      setCatchUpKind(activeCatchUpSection.title);
    }
  }, [activeCatchUpSection, catchUpKind]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }, isWideWeb && styles.webContainer]}>
      {/* Tabs.Screen (see app/(tabs)/_layout.tsx) has headerShown:false, so — unlike the old
          Stack-nested version of this screen — there's no native header to hang the refresh
          action on anymore; this row replaces it. */}
      {/* A header band, not a hero — the same idiom the Library's own header uses (a surface strip
          closed by one hairline), so the two screens agree on what a header is. Discover keeps the
          gradient because it's a different kind of arrival: it opens on a question you're about to
          ask, while this opens onto a list you already own. The subtitle is what stops this reading
          as a bare title, and it earns its line by naming the two tabs directly below it. */}
      <View style={[styles.header, isWideWeb && styles.webHeader]}>
        <View style={styles.headerText}>
          <Text variant="headlineSmall" style={[styles.headerTitle, isWideWeb && styles.webHeaderTitle]}>
            For you
          </Text>
          <Text style={styles.headerSubtitle}>Finish what you started, or start something new.</Text>
        </View>
        {state.kind === 'LOADING' ? (
          <ActivityIndicator style={styles.headerSpinner} />
        ) : (
          <IconButton icon="refresh" accessibilityLabel="Refresh recommendations" onPress={refreshFromMal} />
        )}
      </View>

      {/* Filters sit on their own row *below* the toggle, not beside it: they filter whichever tab
          the toggle selected, so reading order should match — pick the list, then narrow it. Two
          of the three only exist on Recommended, so a shared row also meant the toggle's width
          jumped every time you switched tabs. The stack-collapse this came from kept its real win
          (the Catch up band no longer repeats a title the toggle already said). */}
      <SegmentedButtons
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        style={styles.tabs}
        buttons={[
          { value: 'CATCH_UP', label: `Catch up${catchUp.length > 0 ? ` (${catchUp.length})` : ''}`, icon: 'play-circle-outline' },
          // "Recommended", not "For you" — the screen itself is already titled "For you", and the
          // same words twice read as a breadcrumb to nowhere rather than a choice between two lists.
          { value: 'FOR_YOU', label: 'Recommended', icon: 'star-outline' },
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
          {/* Sort and the series/movie filter both apply to Recommended only — Catch up isn't
              ranked (nothing to reorder) and already splits its two kinds into their own sections. */}
          {tab === 'FOR_YOU' && (
            <Button mode="outlined" icon="sort" onPress={() => setSortDialogVisible(true)}>
              {sortMode === 'RATING' ? 'Top rated' : 'Recommended'}
            </Button>
          )}
          {tab === 'FOR_YOU' && (
            <Button mode="outlined" icon="movie-open-outline" onPress={() => setTypeDialogVisible(true)}>
              {TYPE_FILTER_LABELS[typeFilter]}
            </Button>
          )}
        </View>
      )}
      <Portal>
        {/* Multi-select — checkboxes rather than radio buttons, and the dialog stays open across
            taps so picking several genres in a row doesn't mean reopening it each time. */}
        <Dialog visible={genreDialogVisible} onDismiss={() => setGenreDialogVisible(false)} style={dialogStyle}>
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
        <Dialog visible={sortDialogVisible} onDismiss={() => setSortDialogVisible(false)} style={dialogStyle}>
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
      <Portal>
        <Dialog visible={typeDialogVisible} onDismiss={() => setTypeDialogVisible(false)} style={dialogStyle}>
          <Dialog.Title>Show</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as TypeFilter);
                setTypeDialogVisible(false);
              }}
            >
              {(Object.keys(TYPE_FILTER_LABELS) as TypeFilter[]).map((value) => (
                <RadioButton.Item key={value} label={TYPE_FILTER_LABELS[value]} value={value} />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
        </Dialog>
      </Portal>

      {/* Catch up is derived entirely from the library query, so it inherits that read's failure —
          and an empty derived list would otherwise render as "you're all caught up!", which is a
          cheerful lie about the user's own data when the real answer is a dropped connection. */}
      {tab === 'CATCH_UP' && catchUpError ? (
        <LoadFailure
          message={userFacingMessage(catchUpError, "Couldn't load your library.")}
          onRetry={() => refetchLibrary()}
        />
      ) : tab === 'CATCH_UP' && catchUpLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : tab === 'CATCH_UP' ? (
        isWideWeb ? (
          <WebCatchUpSections
            sections={catchUpSections}
            active={activeCatchUpSection?.title}
            onSelectKind={setCatchUpKind}
            empty={catchUp.length === 0}
            onPress={(item) => router.push(`/series/${item.series.id}`)}
          />
        ) : (
          <>
            <CatchUpKindTabs
              sections={catchUpSections}
              active={activeCatchUpSection?.title}
              onSelect={setCatchUpKind}
            />
            {/* One flat list of the selected kind — the section headers went with the sections, so
                there's nothing left to stick to the top. */}
            <FlatList
              data={activeCatchUpSection?.data ?? []}
              keyExtractor={(item) => String(item.entry.id)}
              contentContainerStyle={styles.list}
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
          </>
        )
      ) : (
        <ForYouList
          state={state}
          series={sortedRecommended}
          genreFiltered={recommended.length > 0 && filteredRecommended.length === 0}
          onRetry={load}
          onPressCard={openPreview}
          isWideWeb={isWideWeb}
        />
      )}

      {/* WebSidebar already shows this line on wide web (it's the "left bar" the sidebar owns) —
          rendering it here too would duplicate it on every wide-web screen. */}
      {!isWideWeb && <MalAttribution />}
    </View>
  );
}

/**
 * The Seasons / Movies / Future releases selector inside Catch up — one tab per non-empty kind,
 * scrolling sideways when the three don't fit.
 *
 * Tabs rather than the stacked sections these replaced: a real backlog is mostly seasons, so Movies
 * and Future releases sat below a long grid where they were never seen. That's the same burying
 * that justified splitting Catch up from Recommended, one level down.
 *
 * Chips, matching the Library's status filters, rather than a second SegmentedButtons — a segmented
 * control directly under another segmented control reads as one broken two-row control. Counts are
 * carried on the tab because "is there anything in there" is the question the tab has to answer
 * before you'd think to open it.
 */
function CatchUpKindTabs({
  sections,
  active,
  onSelect,
}: {
  sections: { title: string; data: CatchUpItem[] }[];
  active: string | undefined;
  onSelect: (title: string) => void;
}) {
  const styles = useStyles();
  // One kind is not a choice — a lone tab would just be a label wearing a border.
  if (sections.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexGrow/flexShrink/minHeight are load-bearing next to a long list: RN's horizontal
      // ScrollView defaults to flexShrink:1, so a tall sibling list squeezes it to a sliver and
      // clips the chips. Same guard, same reason, as the Library's filter row.
      style={styles.kindTabs}
      contentContainerStyle={styles.kindTabsContent}
    >
      {sections.map((section) => {
        const isActive = section.title === active;
        return (
          <Pressable
            key={section.title}
            onPress={() => onSelect(section.title)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={[styles.kindTab, isActive && styles.kindTabActive]}
          >
            <Text style={[styles.kindTabText, isActive && styles.kindTabTextActive]}>
              {section.title} ({section.data.length})
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * Sticky group heading for the Seasons/Movies (Catch up) and Series/Movies (For you) splits.
 * The background is taken from the theme rather than hardcoded because it *must* be opaque —
 * a sticky header over a transparent background lets the cards scroll visibly through the text.
 */
function SectionHeader({ title }: { title: string }) {
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content style={styles.cardContent}>
        <Image source={item.series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.cardText}>
          {/* titleText (flex:1 + minWidth:0) is load-bearing, not cosmetic: without it a long
              series title measured at its full intrinsic width and ran past the card's right edge
              instead of wrapping to the second line numberOfLines allows. Same guard
              RecommendationCard's title already carried. */}
          <SeriesTitleText variant="titleMedium" numberOfLines={2} style={styles.titleText}>
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
  const styles = useStyles();
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

/**
 * Wide-web Catch up band — same catchUpSections data as the mobile SectionList, reshaped into the
 * design doc's tinted band, one wrapping card grid per non-empty Seasons/Movies section.
 *
 * These were horizontal rows on the theory that Catch up is always short enough to fit on one
 * screen (at most two entries per series). A real library disproves that: the Movies row ran well
 * past the window, cutting the last visible card in half and hiding the rest behind a sideways
 * scroll gesture nobody makes on a desktop page — and react-native-web gives a horizontal FlatList
 * no visible scrollbar to hint otherwise. Same reasoning, and now the same shape, as
 * WebForYouSections below; the band scrolls vertically instead, which is the gesture the page
 * already uses.
 */
function WebCatchUpSections({
  sections,
  active,
  onSelectKind,
  empty,
  onPress,
}: {
  sections: { title: string; data: CatchUpItem[] }[];
  active: string | undefined;
  onSelectKind: (title: string) => void;
  empty: boolean;
  onPress: (item: CatchUpItem) => void;
}) {
  const styles = useStyles();
  const activeSection = sections.find((s) => s.title === active) ?? sections[0];
  if (sections.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge">{empty ? "Nothing to catch up on — you're all caught up!" : 'Nothing to catch up on in this genre'}</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.webCatchUpScroll} contentContainerStyle={styles.webCatchUpScrollContent}>
      <View style={styles.webCatchUpBand}>
        <LinearGradient
          colors={[...logoGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.webBandGradientEdge}
        />
        {/* No "Catch up" title here: the segmented button directly above already says it, and its
            16px repeat sat *below* that control while claiming to head the section — the inverted
            step the whole stack-collapse was about. The tinted band is what marks the grouping now,
            which is the job a band is actually good at. */}
        <CatchUpKindTabs sections={sections} active={activeSection?.title} onSelect={onSelectKind} />
        <View style={styles.webCardGrid}>
          {(activeSection?.data ?? []).map((item) => (
            <WebRecCard
              key={String(item.entry.id)}
              coverUrl={item.series.coverUrl}
              title={item.series.title}
              meta={item.entry.title}
              onPress={() => onPress(item)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

/**
 * Wide-web "Recommended" sections — same Series/Movies split as ForYouList's SectionList.
 *
 * A wrapping grid inside one vertical scroll, not the horizontal card rows this used to be (and
 * that Catch up still uses). Two reasons they diverged: this list is long (dozens of results, vs.
 * Catch up's at-most-two-per-series), and a horizontal row hides everything past the window edge
 * behind a scroll gesture nobody makes on a desktop page — so most of the recommendations were
 * effectively invisible. Catch up keeps its rows precisely because it's short enough to fit.
 */
function WebForYouSections({ series, onPress }: { series: ReconcileSeries[]; onPress: (s: ReconcileSeries) => void }) {
  const styles = useStyles();
  const split = splitRecommendationsByType(series);
  const sections = nonEmptySections([
    { title: 'Series', data: split.shows },
    { title: 'Movies', data: split.movies },
  ]);
  return (
    <ScrollView style={styles.webForYouScroll} contentContainerStyle={styles.webForYouSections}>
      {sections.map((section) => (
        <View key={section.title} style={styles.webBandSection}>
          <Text style={styles.webBandSectionLabel}>
            {section.title} ({section.data.length})
          </Text>
          <View style={styles.webCardGrid}>
            {section.data.map((item) => (
              <WebRecCard
                key={item.rootMalId}
                coverUrl={item.coverUrl}
                title={item.title}
                meta={item.rating != null ? `★ ${item.rating.toFixed(2)}` : undefined}
                onPress={() => onPress(item)}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * Shared wide-web poster card for both Catch up and For you — cover, title, one meta line.
 *
 * A plain Pressable, not Paper's Card. It was a Card with its own surface cancelled out
 * (`backgroundColor:'transparent', elevation:0, shadowOpacity:0`) — a component used as a View with
 * its defining features switched off — and padding set on it never reached the text, because Paper
 * nests the children in its own ripple container. That's what left every show name flush against
 * the card edge through two attempted fixes.
 *
 * Owning the container outright makes the surface deliberate (Pure White on Fog White, one hairline
 * border, no shadow — DESIGN.md's Borders-Not-Shadows rule satisfied by construction rather than by
 * cancellation) and the padding real. Hover is the same 0.92 opacity dip every other poster card in
 * the system uses.
 */
function WebRecCard({ coverUrl, title, meta, onPress }: { coverUrl: string | null; title: string; meta?: string; onPress: () => void }) {
  const styles = useStyles();
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[styles.webCard, hovered && styles.webCardHovered]}
      {...hoverHandlers}
    >
      <Image source={coverUrl ?? undefined} style={styles.webCardCover} contentFit="cover" />
      <SeriesTitleText numberOfLines={2} style={styles.webCardTitle}>
        {title}
      </SeriesTitleText>
      {meta != null && (
        <Text numberOfLines={1} style={styles.webCardMeta}>
          {meta}
        </Text>
      )}
    </Pressable>
  );
}

function ForYouList({
  state,
  series,
  genreFiltered,
  onRetry,
  onPressCard,
  isWideWeb,
}: {
  state: ScreenState;
  series: ReconcileSeries[];
  genreFiltered: boolean;
  onRetry: () => void;
  onPressCard: (s: ReconcileSeries) => void;
  isWideWeb: boolean;
}) {
  const styles = useStyles();
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
  if (isWideWeb) {
    if (series.length === 0) {
      return (
        <View style={styles.center}>
          <Text variant="bodyLarge" style={styles.error}>
            {genreFiltered ? 'No recommendations in this genre' : 'Watch (and like) a few more shows to get recommendations'}
          </Text>
        </View>
      );
    }
    return <WebForYouSections series={series} onPress={onPressCard} />;
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

const useStyles = makeStyles((colors) => ({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    // No background of its own — it inherits the page, so the hairline is the only thing marking
    // where the header ends. A white band was doing the separating twice over and made the header
    // read as a separate surface floating above the content rather than the top of one page.
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: fontFamilies.displayBold, color: colors.textPrimary },
  headerSubtitle: { fontFamily: fontFamilies.bodyRegular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tabs: { marginHorizontal: 12, marginTop: 12 },
  // See CatchUpKindTabs for why the three flex properties are load-bearing rather than decorative.
  kindTabs: { flexGrow: 0, flexShrink: 0, minHeight: 52, marginTop: spacing.sm },
  kindTabsContent: { paddingHorizontal: 12, gap: spacing.sm, alignItems: 'center' },
  kindTab: {
    // 44, not 34 — these are the primary control for Catch up and were under both platforms'
    // minimum. minHeight so they grow rather than clip when system text scales.
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kindTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindTabText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13, color: colors.textMuted },
  kindTabTextActive: { color: '#fff' },
  filterButtonsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingHorizontal: 12 },
  dialogScrollArea: { maxHeight: 400, paddingHorizontal: 0 },
  list: { padding: 12, gap: 8 },
  sectionHeader: { paddingTop: 8, paddingBottom: 4 },
  card: { marginBottom: 4, borderRadius: radii.lg, backgroundColor: colors.surface, ...shadows.sm },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 64, height: 90, borderRadius: 8, backgroundColor: colors.coverPlaceholder },
  // minWidth:0 lets these columns actually shrink below their content's intrinsic width — a flex
  // child's min-size defaults to its content, which is what lets a long title push a row wider than
  // its card rather than wrapping inside it.
  cardText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleText: { flex: 1, minWidth: 0 },
  ratingBadge: { backgroundColor: colors.amberTint, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { color: colors.amber },
  muted: { color: colors.textMuted },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  headerSpinner: { marginHorizontal: 12 },
  error: { textAlign: 'center' },

  // --- Wide web ---
  webContainer: { paddingHorizontal: 24 },
  // Negative margin cancels webContainer's 24px gutter so the band spans the full content width,
  // the way a header should — matching the Library's wide-web header, which is full-bleed because
  // its own container carries no horizontal padding.
  webHeader: { marginHorizontal: -24, paddingHorizontal: 32, paddingVertical: 18 },
  webHeaderTitle: { fontFamily: fontFamilies.webSerifBold, fontSize: 26, color: colors.textPrimary },
  webCatchUpScroll: { flex: 1 },
  // The band used to sit flush against the bottom of the window with its last row half-cut. The
  // padding is the same 24px breathing room webForYouSections already leaves below its own grid.
  webCatchUpScrollContent: { paddingBottom: 24 },
  // EXPERIMENT — axis 3. The band keeps a tinted fill but takes a gradient top edge, so the brand
  // gradient appears somewhere other than the Discover hero and reads as a system rather than one
  // screen's flourish. A 3px rule, not a gradient fill: the cards on top of it need a calm ground.
  webCatchUpBand: {
    marginTop: 20,
    gap: 14,
    padding: 22,
    paddingTop: 25,
    borderRadius: radii.xl,
    backgroundColor: 'rgba(87,66,45,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.sm,
  },
  webBandGradientEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  // Spacing lives on the two parents (gap) rather than here, so the first section doesn't carry a
  // leading margin now that the band's own title is gone.
  webBandSection: {},
  webBandSectionLabel: { fontFamily: fontFamilies.bodySemiBold, fontSize: 12, letterSpacing: 1, color: colors.textFaint, marginBottom: 8 },
  webForYouScroll: { flex: 1, marginTop: 8 },
  webForYouSections: { paddingBottom: 24, gap: 14 },
  // Wraps to as many 158px cards as the window fits, rather than running off the right edge — see
  // WebForYouSections for why this list scrolls down and Catch up's still scrolls sideways.
  webCardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  // overflow:hidden + a self-width on the title keep a long show name inside the column instead of
  // spilling into the next card in the row.
  //
  // The 10px padding is what gives the title the same gutter the cover already had: the cover was
  // inset by the card surface while the title sat flush against its left and right edges, so every
  // show name read as clipped by the card it was in. Card width is the 158px cover column plus that
  // gutter on both sides, so the cover keeps its exact size.
  webCard: {
    // The 158px cover column plus a 10px gutter on each side — cover and text share one inset, so
    // neither sits flush against the card edge.
    width: 158 + 20,
    padding: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.md,
  },
  webCardHovered: { opacity: 0.92 },
  webCardCover: { width: '100%', height: 222, borderRadius: radii.md, backgroundColor: colors.coverPlaceholder },
  webCardTitle: { fontSize: 14, marginTop: 10, width: '100%' },
  webCardMeta: { fontFamily: fontFamilies.bodyRegular, fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
}));
