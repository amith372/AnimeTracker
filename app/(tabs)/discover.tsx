// Discover screen — search MAL and browse sectioned rows (AniList-inspired layout, see CLAUDE.md
// §4) to add anime not yet tracked. Three states share one screen rather than three routes:
// sectioned home view, a single expanded "View All" grid, or search results — switching between
// them is just local state, so the poster tile and Add dialog only need to exist once.
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, IconButton, Searchbar, Text } from 'react-native-paper';
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
import { colors, spacing } from '@/theme/colors';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import type { ManualStatus } from '@/domain/types';
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
    return [
      { key: 'season-current', label: 'Popular This Season', query: { kind: 'SEASON', year: thisSeason.year, season: thisSeason.season } },
      { key: 'season-next', label: 'Upcoming Next Season', query: { kind: 'SEASON', year: upcoming.year, season: upcoming.season } },
      { key: 'ranking-all', label: 'All Time Popular', query: { kind: 'RANKING', rankingType: 'all' } },
    ];
  }, []);

  const [searchState, retrySearch] = useDiscoverResults(submittedQuery ? { kind: 'SEARCH', query: submittedQuery } : null);
  // Always called (never conditionally) so the Rules of Hooks hold — `expanded` only changes
  // which query is active, not whether this hook itself runs. The expanded grid is the one place
  // that pages through the whole category, so it gets the paginated hook.
  const expandedResults = usePaginatedDiscover(expanded?.query ?? null);

  async function handleAdd(manualStatus: ManualStatus) {
    if (!pendingAdd) return;
    await addDiscoveredSeries(pendingAdd, manualStatus);
    setPendingAdd(null);
  }

  const showingSearch = submittedQuery.length > 0;

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
      />

      {showingSearch ? (
        <ResultsGrid
          state={searchState}
          onAdd={setPendingAdd}
          onRetry={retrySearch}
          emptyMessage="Nothing new here — everything's already in your library"
        />
      ) : expanded ? (
        <>
          <View style={styles.expandedHeader}>
            <IconButton icon="arrow-left" onPress={() => setExpanded(null)} />
            <Text variant="titleMedium">{expanded.label}</Text>
          </View>
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

      <MalAttribution />
      <AddSeriesDialog series={pendingAdd} onConfirm={handleAdd} onCancel={() => setPendingAdd(null)} />
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
        <Text variant="titleMedium" style={[isWideWeb && styles.webSectionTitle]}>
          {section.label}
        </Text>
        <Pressable onPress={onViewAll}>
          <Text variant="labelLarge" style={styles.viewAll}>
            View All
          </Text>
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
  searchbar: { margin: 12, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  error: { textAlign: 'center' },
  expandedHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  section: { paddingBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  sectionList: { paddingHorizontal: 12, gap: 12 },
  sectionLoading: { paddingVertical: 24 },
  sectionError: { alignItems: 'center', paddingVertical: 12, gap: 4 },
  viewAll: { color: colors.primary },
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
