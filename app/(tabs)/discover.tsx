// Discover screen — search MAL and browse sectioned rows (AniList-inspired layout, see CLAUDE.md
// §4) to add anime not yet tracked. Three states share one screen rather than three routes:
// sectioned home view, a single expanded "View All" grid, or search results — switching between
// them is just local state, so the poster tile and Add dialog only need to exist once.
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Button, Searchbar, Text } from 'react-native-paper';
import { useHover } from '@/hooks/useHover';
import { AddSeriesDialog } from '@/components/AddSeriesDialog';
import { MalAttribution } from '@/components/MalAttribution';
import { PosterTile } from '@/components/PosterTile';
import {
  addDiscoveredSeries,
  useDiscoverResults,
  usePaginatedDiscover,
  type DiscoverQuery,
  type DiscoverState,
} from '@/repositories/DiscoverRepository';
import { currentSeason, nextSeason } from '@/domain/seasonTiming';
import { colors, radii, spacing } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import type { AddChoice } from '@/domain/statusLabel';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

const PREVIEW_COUNT = 10;
// How many list results a preview row fetches detail for. Slightly more than it displays, because
// grouping collapses sequel chains into one row and already-tracked shows get filtered out, so a
// flat 10 would often render noticeably fewer than 10 tiles. Still far below the 25 the list
// endpoint returns — see limitNodes in DiscoverRepository for why that matters.
const PREVIEW_FETCH_COUNT = 14;

type Section = { key: string; label: string; query: DiscoverQuery };

export default function DiscoverScreen() {
  const router = useRouter();
  const isWideWeb = useIsWideWeb();
  const [searchText, setSearchText] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [expanded, setExpanded] = useState<Section | null>(null);
  const [pendingAdd, setPendingAdd] = useState<ReconcileSeries | null>(null);

  const sections = useMemo<Section[]>(() => {
    const thisSeason = currentSeason();
    const upcoming = nextSeason(thisSeason);
    // Named in the app's own voice rather than after the MAL endpoint each one calls ("All Time
    // Popular" was literally ranking_type=all). The rows are half of what this screen is for, and
    // an endpoint name tells the user nothing about why they'd read that row.
    return [
      { key: 'season-current', label: 'Airing this season', query: { kind: 'SEASON', year: thisSeason.year, season: thisSeason.season } },
      { key: 'season-next', label: 'Coming next season', query: { kind: 'SEASON', year: upcoming.year, season: upcoming.season } },
      { key: 'ranking-all', label: 'All-time greats', query: { kind: 'RANKING', rankingType: 'all' } },
    ];
  }, []);

  const [searchState, retrySearch] = useDiscoverResults(submittedQuery ? { kind: 'SEARCH', query: submittedQuery } : null);
  // Always called (never conditionally) so the Rules of Hooks hold — `expanded` only changes
  // which query is active, not whether this hook itself runs. The expanded grid is the one place
  // that pages through the whole category, so it gets the paginated hook.
  const expandedResults = usePaginatedDiscover(expanded?.query ?? null);

  async function handleAdd(choice: AddChoice) {
    if (!pendingAdd) return;
    await addDiscoveredSeries(pendingAdd, choice);
    setPendingAdd(null);
  }

  const showingSearch = submittedQuery.length > 0;

  // Search results and the expanded "View All" grid are local state, not routes (see this file's
  // header comment) — so Android's system Back had nothing to pop and exited the whole tab from
  // what looks and behaves like a sub-screen. This makes Back mean what the on-screen back
  // affordance means, one layer at a time, and only while there's a layer to leave: returning
  // false lets the event fall through to the navigator as usual.
  useEffect(() => {
    if (!showingSearch && !expanded) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showingSearch) {
        setSubmittedQuery('');
        setSearchText('');
        return true;
      }
      setExpanded(null);
      return true;
    });
    return () => subscription.remove();
  }, [showingSearch, expanded]);

  return (
    <View style={[styles.container, isWideWeb && styles.webContainer]}>
      {/* Tabs.Screen (see app/(tabs)/_layout.tsx) has headerShown:false, so — unlike the old
          Stack-nested version of this screen — there's no native header to set a title on
          anymore; this row replaces it. */}
      <View style={[styles.header, isWideWeb && styles.webHeader]}>
        <Text variant="headlineSmall" style={[styles.headerTitle, isWideWeb && styles.webHeaderTitle]}>
          Discover
        </Text>
      </View>
      <Searchbar
        placeholder="Search anime"
        value={searchText}
        onChangeText={setSearchText}
        onSubmitEditing={() => setSubmittedQuery(searchText.trim())}
        onClearIconPress={() => setSubmittedQuery('')}
        style={[styles.searchbar, isWideWeb && styles.webSearchbar]}
        inputStyle={styles.searchbarInput}
      />

      {showingSearch ? (
        <>
          {/* Searching used to replace the browse rows with no labelled way back — the only exit
              was the Searchbar's own clear icon, which doesn't read as "return to browsing". Both
              sub-states now announce themselves and carry the same explicit exit. */}
          <SubHeader
            label={`Results for "${submittedQuery}"`}
            onBack={() => {
              setSubmittedQuery('');
              setSearchText('');
            }}
          />
          <ResultsGrid
            state={searchState}
            onAdd={setPendingAdd}
            onRetry={retrySearch}
            emptyMessage="Nothing new here — everything's already in your library"
          />
        </>
      ) : expanded ? (
        <>
          <SubHeader label={expanded.label} onBack={() => setExpanded(null)} />
          <ResultsGrid
            state={expandedResults.state}
            onAdd={setPendingAdd}
            onRetry={expandedResults.retry}
            emptyMessage="Nothing new here"
            onEndReached={expandedResults.loadMore}
            loadingMore={expandedResults.loadingMore}
          />
        </>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.key}
          contentContainerStyle={isWideWeb ? styles.webSectionList : undefined}
          renderItem={({ item }) => <SectionRow section={item} onViewAll={() => setExpanded(item)} onAdd={setPendingAdd} />}
        />
      )}

      {/* WebSidebar already shows this line on wide web (it's the "left bar" the sidebar owns) —
          rendering it here too would duplicate it on every wide-web screen. */}
      {!isWideWeb && <MalAttribution />}
      <AddSeriesDialog series={pendingAdd} onConfirm={handleAdd} onCancel={() => setPendingAdd(null)} />
    </View>
  );
}

/**
 * The row that names Discover's current sub-state and gets you out of it — shared by search results
 * and the expanded "View All" grid, which are the same shape of thing: a full-screen list that
 * replaced the browse rows.
 *
 * A labelled text exit, not a bare arrow icon: the icon alone (at paddingHorizontal 4) was the only
 * affordance, and on the expanded grid it sat beside a heading with no visual relationship to the
 * row it had replaced. This is also what the Android back handler above mirrors.
 */
function SubHeader({ label, onBack }: { label: string; onBack: () => void }) {
  const [hovered, hoverHandlers] = useHover();
  return (
    <View style={styles.subHeader}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back to browsing"
        style={[styles.subHeaderBack, hovered && styles.subHeaderBackHovered]}
        {...hoverHandlers}
      >
        <MaterialCommunityIcons name="chevron-left" size={18} color={colors.primary} />
        <Text style={styles.subHeaderBackText}>Browse</Text>
      </Pressable>
      <Text numberOfLines={1} style={styles.subHeaderLabel}>
        {label}
      </Text>
    </View>
  );
}

function SectionRow({ section, onViewAll, onAdd }: { section: Section; onViewAll: () => void; onAdd: (s: ReconcileSeries) => void }) {
  const isWideWeb = useIsWideWeb();
  const [state, retry] = useDiscoverResults(section.query, PREVIEW_FETCH_COUNT);
  const preview = state.kind === 'READY' ? state.series.slice(0, PREVIEW_COUNT) : [];

  return (
    <View style={[styles.section, isWideWeb && styles.webSection]}>
      <View style={[styles.sectionHeader, isWideWeb && styles.webSectionHeader]}>
        {/* One section-heading treatment, not Paper's variant on mobile and a custom style on web
            — same role, same voice, only the size steps up on the wider canvas. */}
        <Text style={[styles.sectionTitle, isWideWeb && styles.webSectionTitle]}>{section.label}</Text>
        <Pressable onPress={onViewAll} accessibilityRole="button" accessibilityLabel={`View all ${section.label}`}>
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      {state.kind === 'LOADING' ? (
        <ActivityIndicator style={styles.sectionLoading} />
      ) : state.kind === 'ERROR' ? (
        <View style={styles.sectionError}>
          <Text style={styles.error}>{state.message}</Text>
          <Button onPress={retry}>Retry</Button>
        </View>
      ) : (
        <FlatList
          data={preview}
          horizontal
          keyExtractor={(s) => String(s.rootMalId)}
          contentContainerStyle={[styles.sectionList, isWideWeb && styles.webSectionList2]}
          renderItem={({ item }) => <PosterTile series={item} onPress={() => onAdd(item)} />}
        />
      )}
    </View>
  );
}

function ResultsGrid({
  state,
  onAdd,
  onRetry,
  emptyMessage,
  onEndReached,
  loadingMore = false,
}: {
  state: DiscoverState;
  onAdd: (s: ReconcileSeries) => void;
  onRetry: () => void;
  emptyMessage: string;
  /** Only the paginated "View All" grid passes these; search renders a single page. */
  onEndReached?: () => void;
  loadingMore?: boolean;
}) {
  const isWideWeb = useIsWideWeb();
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
  if (state.series.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge">{emptyMessage}</Text>
      </View>
    );
  }
  // Wide web gets a denser grid to match the design doc's bigger canvas — same data/paging, just
  // more columns. numColumns must stay a fixed number (FlatList requirement), so this is a coarse
  // step rather than true CSS auto-fill, but it tracks the isWideWeb breakpoint closely enough.
  const numColumns = isWideWeb ? 6 : 3;
  return (
    <FlatList
      data={state.series}
      numColumns={numColumns}
      key={numColumns}
      keyExtractor={(s) => String(s.rootMalId)}
      contentContainerStyle={[styles.grid, isWideWeb && styles.webGrid]}
      renderItem={({ item }) => <PosterTile series={item} onPress={() => onAdd(item)} />}
      onEndReached={onEndReached}
      // Default is 2 screens ahead, which fires almost immediately on a short grid and pulls
      // pages the user may never scroll to. Half a screen keeps the fetch close to the intent.
      onEndReachedThreshold={0.5}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerLoading} /> : null}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontFamily: fontFamilies.displayBold, color: colors.textPrimary },
  searchbar: { margin: 12, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 0 },
  // minHeight:0 is load-bearing, not cosmetic — the same guard the Library screen's searchbar
  // already carries. Paper sizes the inner TextInput's minHeight for its default 56px bar, so
  // forcing a shorter height on the container leaves the input taller than its own box and the
  // icon and placeholder sit above centre instead of in it.
  searchbarInput: { fontFamily: fontFamilies.bodyRegular, minHeight: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { textAlign: 'center' },
  subHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  subHeaderBack: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36, paddingRight: spacing.sm, paddingLeft: 2, borderRadius: 8 },
  subHeaderBackHovered: { backgroundColor: colors.hoverWash },
  subHeaderBackText: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: colors.primary },
  // flexShrink lets a long search query truncate rather than push the Browse exit off-screen.
  subHeaderLabel: { flex: 1, minWidth: 0, fontFamily: fontFamilies.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  section: { paddingBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  sectionList: { paddingHorizontal: 12, gap: 12 },
  sectionLoading: { paddingVertical: 24 },
  sectionError: { alignItems: 'center', paddingVertical: 12, gap: 4 },
  sectionTitle: { fontFamily: fontFamilies.bodyBold, fontSize: 15, color: colors.textPrimary },
  viewAll: { fontFamily: fontFamilies.bodySemiBold, fontSize: 13.5, color: colors.primary },
  grid: { padding: 8 },
  footerLoading: { paddingVertical: 16 },

  // --- Wide web ---
  webContainer: { paddingHorizontal: 24 },
  webHeader: { paddingTop: 22 },
  webHeaderTitle: { fontFamily: fontFamilies.webSerifBold, fontSize: 26, color: colors.textPrimary },
  webSearchbar: { maxWidth: 480, marginLeft: 0, height: 44 },
  webSectionList: { paddingTop: 8 },
  webSection: { paddingBottom: 22 },
  webSectionHeader: { paddingHorizontal: 4 },
  webSectionTitle: { fontFamily: fontFamilies.bodyBold, fontSize: 17 },
  webSectionList2: { paddingHorizontal: 4, gap: 18 },
  webGrid: { padding: 4, gap: 18 },
});
