// Library screen — Phase 1's home screen. Lists every tracked series with its derived/manual
// status; tapping one opens its Detail screen. Also has the search-by-name + filter-by-status bar
// from the original Kotlin LibraryScreen (both purely local — filtering the already-loaded list,
// no MAL calls — unlike Discover's search which hits the API).
//
// Also doubles as the auth + import gate: this is the app's initial route, so it's the natural
// place to check login state and redirect to onboarding/login if there's no stored token, and
// then check import state and redirect to onboarding/reconcile if the user hasn't imported their
// MAL list yet — mirroring how AnimeTrackerApp.kt's top-level `if (!isLoggedIn)` /
// `if (!hasCompletedInitialImport)` branches worked.
//
// Wide web (see useWebLayout.ts) swaps the row-list for the "AnimeTracker Web" design doc's
// poster-card grid + a vertical status-filter column, both driven by the exact same
// filteredList/filterCounts/statusFilter/searchQuery state and handlers as the mobile branch below
// — see LibraryScreen's isWideWeb branch near the bottom of the render.
import { Image } from 'expo-image';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Button, Chip, Dialog, IconButton, Portal, Searchbar, Snackbar, Text } from 'react-native-paper';
import { useIsGuest } from '@/account/guestMode';
import { useAccountSession } from '@/account/accountRepository';
import { useMalLinkStatus } from '@/account/malLinkRepository';
import { deleteSeries, refetchLibrary, useHasCompletedInitialImport, useLibrary } from '@/repositories/AnimeRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { LoadFailure } from '@/components/LoadFailure';
import { runMonthlySync } from '@/repositories/SyncRepository';
import { pushStatusesToMal } from '@/repositories/MalPushRepository';
import { MalAttribution } from '@/components/MalAttribution';
import { AtLogoMark } from '@/components/AtLogoMark';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { STATUS_FILTER_KINDS, statusKindLabel, statusLabel } from '@/domain/statusLabel';
import { hasVisibleNewSeasonAlert, type Series } from '@/domain/series';
import { buildPushTargets } from '@/domain/malPush';
import { statusDotColor } from '@/theme/statusColors';
import { colors, radii, spacing } from '@/theme/colors';
import { dialogStyle } from '@/theme/dialog';
import { fontFamilies } from '@/theme/fonts';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import { useHover } from '@/hooks/useHover';
import { deriveScopedSeriesStatus, type CountScope, type SeriesStatus } from '@/domain/seriesStatus';

type StatusFilter = SeriesStatus['kind'] | 'ALL';

// The Watched X/Y tab's "count what?" lens — see deriveScopedSeriesStatus for why this is a view
// toggle rather than a stored setting.
const COUNT_SCOPES: { value: CountScope; label: string }[] = [
  { value: 'ALL', label: 'Seasons & movies' },
  { value: 'SEASONS', label: 'Seasons only' },
  { value: 'MOVIES', label: 'Movies only' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  ...STATUS_FILTER_KINDS.map((kind) => ({ value: kind as StatusFilter, label: statusKindLabel(kind) })),
];

// Matches gridCard's width and webGridRow's gap below — kept as constants because the column-count
// math needs the same numbers the styles use.
const GRID_CARD_WIDTH = 184;
const GRID_GAP = 22;
const GRID_PADDING = 28;

export default function LibraryScreen() {
  const { session, loading: sessionLoading } = useAccountSession();
  const isGuest = useIsGuest();
  const [malLinked] = useMalLinkStatus();
  const hasImported = useHasCompletedInitialImport();
  const { series: seriesList, isLoading: libraryLoading, error: libraryError } = useLibrary();
  const router = useRouter();
  const isWideWeb = useIsWideWeb();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  // Which half of the backlog the "Watched X/Y" tab counts. A view lens only — see
  // deriveScopedSeriesStatus; nothing about the series is changed, so switching back to All puts
  // every hidden movie count straight back.
  const [countScope, setCountScope] = useState<CountScope>('ALL');
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  // Measured via onLayout on the grid's wrapping View — drives numColumns below so the wide-web
  // poster grid keeps growing to more columns on a wider window (the fluid "auto-fill" behavior
  // FlatList's fixed numColumns can't express on its own) while still getting real virtualization.
  const [gridWidth, setGridWidth] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [pushConfirmVisible, setPushConfirmVisible] = useState(false);
  // The series a long-press is offering to remove, or null. Long-press rather than a visible
  // per-row button: removal is rare next to the tapping this list exists for, and a delete affordance
  // on every row is one mis-tap away from losing a show's whole watch history.
  const [pendingRemoval, setPendingRemoval] = useState<Series | null>(null);

  // How many 184px cards fit across the measured grid width at the fixed 22px gap/28px padding —
  // same arithmetic a CSS repeat(auto-fill, minmax(184px,1fr)) grid would do, since FlatList only
  // takes a fixed numColumns rather than an auto-fill keyword.
  const gridColumns = useMemo(
    () => Math.max(1, Math.floor((gridWidth - GRID_PADDING * 2 + GRID_GAP) / (GRID_CARD_WIDTH + GRID_GAP))),
    [gridWidth],
  );

  const filteredList = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = seriesList.filter((s) => {
      if (statusFilter !== 'ALL' && s.status.kind !== statusFilter) return false;
      if (query && !s.title.toLowerCase().includes(query)) return false;
      return true;
    });
    if (statusFilter !== 'WATCHED_PARTIAL' || countScope === 'ALL') return matching;
    // Re-derive each row's status counting only the chosen half, then drop anything that's no
    // longer partial *through that lens* — a show with every season watched and an unfinished film
    // reads (and counts as) Watched under "Seasons only", so it leaves this tab. Purely a view:
    // nothing is written, and switching back to All restores every row and label untouched.
    return matching
      .map((s) => ({ ...s, status: deriveScopedSeriesStatus(s.manualStatus, s.entries, countScope) }))
      .filter((s) => s.status.kind === 'WATCHED_PARTIAL');
  }, [seriesList, searchQuery, statusFilter, countScope]);

  // Per-status counts for the filter chips ("Watching 3") — cheap, same list already loaded.
  const filterCounts = useMemo(() => {
    const counts: Partial<Record<StatusFilter, number>> = { ALL: seriesList.length };
    for (const s of seriesList) counts[s.status.kind] = (counts[s.status.kind] ?? 0) + 1;
    return counts;
  }, [seriesList]);

  // Purely local — computed straight from the already-loaded library, no MAL call — so the
  // confirmation dialog can tell the user exactly how many MAL entries a push will touch before
  // they commit to it. Same decision logic the push itself uses (CLAUDE.md §8), just previewed.
  const pushTargetCount = useMemo(() => seriesList.flatMap(buildPushTargets).length, [seriesList]);

  async function handleSync() {
    setMoreMenuVisible(false);
    setSyncing(true);
    try {
      const count = await runMonthlySync();
      setSyncMessage(count > 0 ? `${count} series have new seasons` : 'No new seasons found');
    } catch (e) {
      setSyncMessage(userFacingMessage(e, "Couldn't check for new seasons. Try again."));
    } finally {
      setSyncing(false);
    }
  }

  // The confirmation dialog is what makes this safe to expose as a single tap — see CLAUDE.md §8.
  // This is the only place in the app that writes to the user's real MAL account.
  async function handlePushToMal() {
    setPushConfirmVisible(false);
    setPushing(true);
    try {
      await pushStatusesToMal((progress) => {
        if (progress.kind !== 'DONE') return;
        setSyncMessage(
          progress.failed > 0
            ? `Updated ${progress.updated} on MyAnimeList, ${progress.failed} failed`
            : `Updated ${progress.updated} on MyAnimeList`,
        );
      });
    } catch (e) {
      setSyncMessage(userFacingMessage(e, "Couldn't update MyAnimeList. Your list wasn't changed."));
    } finally {
      setPushing(false);
    }
  }

  if (sessionLoading || isGuest === null || malLinked === null) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  // No session at all -> straight to login/account/guest choices. A guest is itself a session now
  // (anonymous auth, see guestMode.ts) — this only catches someone who hasn't made any choice yet.
  if (!session) {
    return <Redirect href="/onboarding/login" />;
  }
  // Neither a guest nor an account with no MAL linked ever has a MAL list to import, so both skip
  // straight to the (possibly empty) library instead of onboarding/reconcile — only a MAL-linked
  // account needs that gate.
  if (malLinked) {
    if (hasImported === null) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator size="large" />
        </View>
      );
    }
    if (!hasImported) {
      return <Redirect href="/onboarding/reconcile" />;
    }
  }
  // Avoids a flash of "Nothing here yet" while the library's first fetch is still in flight —
  // useAllSeries()/useLibrary() can genuinely be loading now (a network read), unlike the old
  // SQLite-backed version.
  if (libraryLoading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  // Before the empty state, not after it: a failed read leaves `seriesList` empty, so without this
  // branch the screen renders "Nothing here yet" to someone with a full library — the single most
  // alarming way to report a dropped connection (see the impeccable critique this came from).
  if (libraryError) {
    return (
      <View style={styles.container}>
        <LoadFailure
          message={userFacingMessage(libraryError, "Couldn't load your library.")}
          onRetry={() => refetchLibrary()}
        />
      </View>
    );
  }

  const moreMenu = (
    <Portal>
      <Dialog visible={moreMenuVisible} onDismiss={() => setMoreMenuVisible(false)} style={styles.moreMenuDialog}>
        <Dialog.Content style={styles.moreMenuContent}>
          {/* Distinct from "Sync now" below, which only re-walks series already in the library
              looking for new seasons and never re-reads the MyAnimeList list itself — so a show
              added on myanimelist.net after onboarding was invisible to the app entirely. This is
              the only thing besides onboarding that reads that list. No confirmation dialog: the
              additive sync only ever inserts whole new series (see runAdditiveSync), so unlike
              "Update MyAnimeList" there's nothing here to undo. */}
          {malLinked && (
            <Pressable
              style={styles.moreMenuRow}
              onPress={() => {
                setMoreMenuVisible(false);
                router.push('/onboarding/reconcile?mode=additive');
              }}
            >
              <MaterialCommunityIcons name="playlist-plus" size={22} color={colors.textPrimary} />
              <Text variant="bodyLarge">Check for new shows</Text>
            </Pressable>
          )}
          {/* Nothing to sync without MyAnimeList linked, so the refresh action is meaningless
              (and runMonthlySync itself is a no-op) otherwise — hidden rather than shown-but-dead. */}
          {malLinked && (
            <Pressable style={styles.moreMenuRow} onPress={handleSync}>
              <MaterialCommunityIcons name="refresh" size={22} color={colors.textPrimary} />
              {/* "Check for new seasons", not "Sync now" — it sat next to "Check MyAnimeList for
                  new shows" and the two were indistinguishable by name, even though one re-reads
                  the MAL list and this one only walks existing series for new seasons. */}
              <Text variant="bodyLarge">Check for new seasons</Text>
            </Pressable>
          )}
          {/* The one write path in the app (CLAUDE.md §8) — never shown without MyAnimeList
              linked, since there's nowhere to push to. Gated behind a confirm dialog, not a
              direct tap: this edits the user's real MyAnimeList list. */}
          {malLinked && (
            <Pressable
              style={styles.moreMenuRow}
              onPress={() => {
                setMoreMenuVisible(false);
                setPushConfirmVisible(true);
              }}
            >
              <MaterialCommunityIcons name="cloud-upload-outline" size={22} color={colors.textPrimary} />
              <Text variant="bodyLarge">Update MyAnimeList</Text>
            </Pressable>
          )}
          {/* Phase 7's app-account system — see app/onboarding/account.tsx, which is also where
              signing out, converting a guest session to a real account, and linking MyAnimeList
              (if not already linked) all live now. Reachable at every session state — a guest is
              always signed in now (anonymous auth, see guestMode.ts), so there's no separate
              "Log in" item to show only when signed out; Account itself branches on isGuest. */}
          <Pressable
            style={styles.moreMenuRow}
            onPress={() => {
              setMoreMenuVisible(false);
              router.push('/onboarding/account');
            }}
          >
            <MaterialCommunityIcons name="account-circle-outline" size={22} color={colors.textPrimary} />
            <Text variant="bodyLarge">{isGuest ? 'Create account' : 'Account'}</Text>
          </Pressable>
        </Dialog.Content>
      </Dialog>
    </Portal>
  );

  // Removal is optimistic (see AnimeRepository.deleteSeries), so the row disappears on confirm and
  // reappears if the write fails — the snackbar is what explains why it came back.
  async function handleRemove() {
    const target = pendingRemoval;
    setPendingRemoval(null);
    if (!target) return;
    try {
      await deleteSeries(target.id);
      setSyncMessage(`Removed "${target.title}"`);
    } catch (e) {
      setSyncMessage(userFacingMessage(e, `Couldn't remove "${target.title}". It's still in your library.`));
    }
  }

  const removeConfirmDialog = (
    <Portal>
      <Dialog visible={pendingRemoval !== null} onDismiss={() => setPendingRemoval(null)} style={dialogStyle}>
        <Dialog.Title>Remove from library?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            &quot;{pendingRemoval?.title}&quot; and everything you&apos;ve marked watched on it will be removed.
            Your MyAnimeList account isn&apos;t touched.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setPendingRemoval(null)}>Cancel</Button>
          <Button textColor={colors.red} onPress={handleRemove}>
            Remove
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  const pushConfirmDialog = (
    <Portal>
      <Dialog visible={pushConfirmVisible} onDismiss={() => setPushConfirmVisible(false)} style={dialogStyle}>
        <Dialog.Title>Update MyAnimeList?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {pushTargetCount === 0
              ? 'Nothing to update — no Plan to watch, Watched, or Currently watching shows to push.'
              : `This will update ${pushTargetCount} entr${pushTargetCount === 1 ? 'y' : 'ies'} on your real MyAnimeList account, to match your Plan to watch, Watched, and Currently watching shows here. Dropped and Watched-forgot shows are left alone.`}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setPushConfirmVisible(false)}>Cancel</Button>
          <Button onPress={handlePushToMal} disabled={pushTargetCount === 0}>
            Update
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  if (isWideWeb) {
    return (
      <View style={styles.webContainer}>
        <View style={styles.webHeader}>
          <AtLogoMark size={34} />
          <Text style={styles.webHeaderTitle}>Library</Text>
          <Searchbar
            placeholder="Search your library"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.webSearchbar}
            inputStyle={styles.searchbarInput}
          />
          {(syncing || pushing) && <ActivityIndicator style={styles.headerSpinner} />}
          <Text style={styles.webHeaderCount}>
            {seriesList.length} series · {seriesList.reduce((n, s) => n + s.entries.filter((e) => e.watchState === 'WATCHED').length, 0)} entries watched
          </Text>
          <IconButton icon="dots-vertical" onPress={() => setMoreMenuVisible(true)} />
        </View>
        <View style={styles.webBody}>
          <View style={styles.webFilterColumn}>
            <View style={styles.webFilterColumnContent}>
              <Text style={styles.webFilterHeading}>STATUS</Text>
              {STATUS_FILTERS.map((f) => (
                <WebFilterRow
                  key={f.value}
                  label={f.label}
                  count={filterCounts[f.value] ?? 0}
                  dotColor={f.value === 'ALL' ? colors.checkboxUnchecked : statusDotColor(f.value as SeriesStatus['kind'])}
                  active={statusFilter === f.value}
                  onPress={() => setStatusFilter(f.value)}
                />
              ))}
              {statusFilter === 'WATCHED_PARTIAL' && (
                <View style={styles.webScopeBlock}>
                  <Text style={styles.webFilterHeading}>COUNT</Text>
                  {COUNT_SCOPES.map((scope) => (
                    <WebFilterRow
                      key={scope.value}
                      label={scope.label}
                      dotColor={colors.checkboxUnchecked}
                      active={countScope === scope.value}
                      onPress={() => setCountScope(scope.value)}
                    />
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={styles.webGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {filteredList.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="bodyLarge">
                  {seriesList.length === 0 ? 'Nothing here yet' : 'No series match your search/filter'}
                </Text>
              </View>
            ) : gridWidth > 0 ? (
              <FlatList
                key={gridColumns}
                data={filteredList}
                numColumns={gridColumns}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.webGridContent}
                columnWrapperStyle={gridColumns > 1 ? styles.webGridRow : undefined}
                renderItem={({ item }) => (
                  <LibraryGridCard
                    series={item}
                    onPress={() => router.push(`/series/${item.id}`)}
                    onLongPress={() => setPendingRemoval(item)}
                  />
                )}
                // A library this size (a real user's had 200+ series) is exactly what virtualization
                // is for — only rows near the viewport ever mount an Image, instead of every cover
                // loading at once on first paint (see the impeccable `optimize` pass this came from).
                removeClippedSubviews
                initialNumToRender={gridColumns * 4}
              />
            ) : null}
          </View>
        </View>
        {moreMenu}
        {pushConfirmDialog}
        {removeConfirmDialog}
        <Snackbar visible={syncMessage !== null} onDismiss={() => setSyncMessage(null)} duration={4000} style={styles.webToast}>
          {syncMessage}
        </Snackbar>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <AtLogoMark size={36} />
        <Text variant="headlineSmall" style={styles.headerTitle}>
          Library
        </Text>
        {(syncing || pushing) && <ActivityIndicator style={styles.headerSpinner} />}
        <IconButton icon="dots-vertical" onPress={() => setMoreMenuVisible(true)} />
      </View>
      <Searchbar
        placeholder="Search your library"
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
        inputStyle={styles.searchbarInput}
      />
      {/* Chips, not a dropdown/menu — Paper's anchored Menu measures its position wrong on this
          RN/Fabric version, landing the item list thousands of px off-screen. A plain Chip row has
          no anchor math to get wrong. Horizontal-scrolling rather than wrapping — wrapping pushed
          the list down a full row per extra status, which added up to 4 rows for the 7 filters.
          The scrollbar is shown (and kept persistent on Android) rather than hidden — a chip
          half-visible at the screen edge with no scrollbar reads as clipped/broken text rather
          than "more to scroll".
          flexShrink:0 + minHeight on filterRow are load-bearing, not decorative: RN's horizontal
          ScrollView defaults to flexShrink:1 (ScrollView.js baseHorizontal), and the FlatList below
          has no `style` so its flexBasis is its full content height — with 50+ rows that dwarfs
          this row's ~42dp natural height, so Yoga squeezed this row down to a sliver and clipped
          every chip's text. Confirmed via uiautomator: row measured 30dp with a full list, jumped
          to the correct 42dp once the list was filtered empty. flex:1 on the FlatList (below) is
          the other half of the fix — it stops the list from reporting that huge flexBasis. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        persistentScrollbar
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.value}
            selected={statusFilter === f.value}
            onPress={() => setStatusFilter(f.value)}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            textStyle={statusFilter === f.value ? styles.filterChipTextActive : styles.filterChipText}
          >
            {f.label} ({filterCounts[f.value] ?? 0})
          </Chip>
        ))}
      </ScrollView>
      {/* Only meaningful on the one tab whose rows carry two counts — everywhere else there's
          nothing to scope. */}
      {statusFilter === 'WATCHED_PARTIAL' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scopeRow}
          contentContainerStyle={styles.filterRowContent}
        >
          <Text variant="labelMedium" style={styles.scopeLabel}>
            COUNT
          </Text>
          {COUNT_SCOPES.map((scope) => (
            <Chip
              key={scope.value}
              selected={countScope === scope.value}
              onPress={() => setCountScope(scope.value)}
              style={[styles.filterChip, countScope === scope.value && styles.filterChipActive]}
              textStyle={countScope === scope.value ? styles.filterChipTextActive : styles.filterChipText}
            >
              {scope.label}
            </Chip>
          ))}
        </ScrollView>
      )}
      <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={filteredList}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <SeriesRow
                series={item}
                onPress={() => router.push(`/series/${item.id}`)}
                onLongPress={() => setPendingRemoval(item)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="bodyLarge">
                  {seriesList.length === 0 ? 'Nothing here yet' : 'No series match your search/filter'}
                </Text>
              </View>
            }
          />
      {moreMenu}
      {pushConfirmDialog}
      {removeConfirmDialog}
      <MalAttribution />
      <Snackbar visible={syncMessage !== null} onDismiss={() => setSyncMessage(null)} duration={4000}>
        {syncMessage}
      </Snackbar>
    </View>
  );
}

function SeriesRow({ series, onPress, onLongPress }: { series: Series; onPress: () => void; onLongPress: () => void }) {
  const isNew = hasVisibleNewSeasonAlert(series);
  return (
    <Pressable style={styles.card} onPress={onPress} onLongPress={onLongPress} delayLongPress={500}>
      <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
      <View style={styles.cardText}>
        <SeriesTitleText variant="titleMedium" numberOfLines={1}>
          {series.title}
        </SeriesTitleText>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusDotColor(series.status.kind) }]} />
          <Text variant="bodyMedium" style={styles.statusText}>
            {statusLabel(series.status)}
          </Text>
        </View>
        {isNew && (
          <Chip compact style={styles.newBadge} textStyle={styles.newBadgeText}>
            New season!
          </Chip>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textFaint} />
    </Pressable>
  );
}

/** Wide-web poster-card grid tile — cover, title, status dot + label, matching the design doc's
 * Library grid card. Same data/onPress as SeriesRow above, just a different shape. */
function LibraryGridCard({
  series,
  onPress,
  onLongPress,
}: {
  series: Series;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const isNew = hasVisibleNewSeasonAlert(series);
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable
      style={[styles.gridCard, hovered && styles.gridCardHovered]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      {...hoverHandlers}
    >
      <View style={styles.gridCoverWrap}>
        <Image source={series.coverUrl ?? undefined} style={styles.gridCover} contentFit="cover" />
        {isNew && (
          <View style={styles.gridNewBadge}>
            <Text style={styles.gridNewBadgeText}>NEW SEASON</Text>
          </View>
        )}
      </View>
      <SeriesTitleText numberOfLines={1} style={styles.gridCardTitle}>
        {series.title}
      </SeriesTitleText>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: statusDotColor(series.status.kind) }]} />
        <Text style={styles.gridCardStatus}>{statusLabel(series.status)}</Text>
      </View>
    </Pressable>
  );
}

/** One vertical STATUS filter row in the wide-web sidebar-adjacent column — same active/onPress
 * logic as the mobile filter chips, with hover feedback added since a mouse is reliably present
 * whenever this branch renders (see the restrained colorize pass, colors.hoverWash). */
function WebFilterRow({
  label,
  count,
  dotColor,
  active,
  onPress,
}: {
  label: string;
  /** Omitted by the COUNT scope rows below the status list — a lens has no tally of its own. */
  count?: number;
  dotColor: string;
  active: boolean;
  onPress: () => void;
}) {
  const [hovered, hoverHandlers] = useHover();
  return (
    <Pressable onPress={onPress} {...hoverHandlers} style={[styles.webFilterRow, (active || hovered) && styles.webFilterRowActive]}>
      <View style={[styles.webFilterDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.webFilterLabel, { color: active ? colors.textPrimary : colors.textMuted }]}>{label}</Text>
      {count !== undefined && <Text style={styles.webFilterCount}>{count}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { flex: 1, fontFamily: fontFamilies.displayBold, color: colors.textPrimary },
  headerSpinner: { marginRight: spacing.xs },
  searchbar: { marginHorizontal: spacing.lg, marginTop: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, elevation: 0 },
  searchbarInput: { fontFamily: fontFamilies.bodyRegular, minHeight: 0 },
  filterRow: { marginTop: spacing.md, flexGrow: 0, flexShrink: 0, minHeight: 42 },
  // Same flexGrow/flexShrink/minHeight guards as filterRow above — a horizontal ScrollView next to
  // a long FlatList gets squeezed to a sliver without them (see filterRow's comment).
  scopeRow: { flexGrow: 0, flexShrink: 0, minHeight: 42 },
  scopeLabel: { color: colors.textFaint, letterSpacing: 1, marginRight: spacing.xs },
  filterRowContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm, alignItems: 'center' },
  filterChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterChipText: { fontFamily: fontFamilies.bodySemiBold, color: colors.textMuted },
  filterChipTextActive: { fontFamily: fontFamilies.bodySemiBold, color: '#fff' },
  // Same shape as theme/dialog.ts's shared cap, just tighter: this Dialog stands in for a menu
  // (Paper's anchored Menu mismeasures on this RN/Fabric version), and a menu of four short rows
  // reads as mostly empty space at the full dialog width.
  moreMenuDialog: { alignSelf: 'center', width: '90%', maxWidth: 320, marginHorizontal: 0 },
  moreMenuContent: { gap: spacing.xs },
  moreMenuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.sm },
  list: { flex: 1 },
  listContent: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  cover: { width: 56, height: 80, borderRadius: radii.sm, backgroundColor: colors.border },
  cardText: { flex: 1, gap: spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fontFamilies.bodyRegular, color: colors.textMuted },
  newBadge: { alignSelf: 'flex-start', backgroundColor: colors.amberTint, height: 24 },
  newBadgeText: { fontFamily: fontFamilies.bodySemiBold, color: colors.amber, fontSize: 11, lineHeight: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },

  // --- Wide web ---
  webContainer: { flex: 1, backgroundColor: colors.background },
  webHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: 32, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  webHeaderTitle: { fontFamily: fontFamilies.webSerifBold, fontSize: 24, color: colors.textPrimary },
  webSearchbar: { flex: 1, maxWidth: 440, borderRadius: radii.pill, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, elevation: 0, height: 42 },
  webHeaderCount: { fontFamily: fontFamilies.bodyMedium, fontSize: 13, color: colors.textMuted },
  webBody: { flex: 1, flexDirection: 'row' },
  webFilterColumn: { width: 200, flexShrink: 0, flexDirection: 'column', borderRightWidth: 1, borderRightColor: colors.border },
  webFilterColumnContent: { padding: spacing.lg, gap: 2 },
  webScopeBlock: { marginTop: spacing.lg },
  webFilterHeading: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11, letterSpacing: 1.4, color: colors.textFaint, marginBottom: spacing.sm },
  webFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingHorizontal: 10, borderRadius: radii.sm },
  webFilterRowActive: { backgroundColor: colors.hoverWash },
  webFilterDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  webFilterLabel: { flex: 1, fontFamily: fontFamilies.bodyMedium, fontSize: 13.5 },
  webFilterCount: { fontFamily: fontFamilies.bodySemiBold, fontSize: 12, color: colors.textFaint },
  webGrid: { flex: 1 },
  // width:'100%' is load-bearing on react-native-web: without it, a vertical ScrollView's
  // contentContainerStyle doesn't reliably stretch to the scrollview's own cross-axis width inside
  // a flexDirection:'row' ancestor, so the flexWrap grid below never gets the width it needs to
  // wrap past its first few columns — confirmed live (only 3 columns rendered on a window with
  // room for 7+).
  webGridContent: { padding: 28, width: '100%' },
  webGridRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 22 },
  gridCard: { width: 184 },
  // Opacity dip on hover rather than a background wash — this precedent comes straight from the
  // approved design mockup (poster-grid cards there use style-hover="opacity:.92"); a wash would
  // mean padding the card, which shifts the cover art off its exact 184px spec.
  gridCardHovered: { opacity: 0.92 },
  gridCoverWrap: { aspectRatio: 3 / 4, borderRadius: radii.lg, backgroundColor: colors.coverPlaceholder, overflow: 'hidden' },
  gridCover: { width: '100%', height: '100%' },
  gridNewBadge: { position: 'absolute', top: 10, left: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: colors.primary },
  gridNewBadgeText: { fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 0.4, color: '#fff' },
  gridCardTitle: { fontSize: 14.5, marginTop: 11, color: colors.textPrimary },
  gridCardStatus: { fontFamily: fontFamilies.bodySemiBold, fontSize: 12.5, color: colors.textMuted },
  webToast: { alignSelf: 'center', borderRadius: radii.lg, backgroundColor: colors.primaryDark },
});
