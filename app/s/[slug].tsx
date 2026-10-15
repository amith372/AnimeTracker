// The page a stranger opens — plan 4 step 3 / prd/2-public-share.md.
//
// The only screen in the app written for someone who is not a user: no account, no app, quite
// possibly no idea what MyAnimeList is. Everything that follows from that is deliberate:
//
//  - **It lives outside `app/(tabs)/`.** The login-and-consent gate is in `app/(tabs)/index.tsx`,
//    not the root layout, so a top-level route is reached with no session and without redirecting
//    anyone. Inside the tabs group this would bounce every viewer to a login screen and hand them
//    a tab bar for an app they do not have.
//  - **Nothing asks the viewer for anything.** No sign-in prompt, no consent banner, no "open in
//    the app", no analytics, no identifier, and no record that anyone looked (success criteria 7
//    and 8). The only request this page makes is the one that fetches the list.
//  - **No navigation into the app**, so there is no path from here to a screen that would ask for
//    a login.
//  - **The statuses are the app's own.** `toSharedLibrary` runs the real `deriveSeriesStatus` and
//    the labels come from the real `statusLabel`/`progressPhrase`, so this page and the owner's
//    Library can never disagree about what "Watched 3/5 seasons" means (success criterion 5).
//  - **It is visibly AnimeTracker and attributes MyAnimeList** — guardrail #4 and §3(a)(xi)/(xiii),
//    which matter more on a page a stranger sees than on one only the owner does.
//  - **It asks not to be indexed.** An unguessable slug keeps a list from being found; the meta
//    tag and `public/robots.txt`'s disallow keep a shared one from being archived and surfaced in
//    search long after it was revoked.
//
// **Layout: a status sidebar and compact rows** (chosen from three mockups, 2026-10-15). A long
// scroll of poster cards was the first build and the wrong shape for a library this size — a
// reader could see neither how much of it was finished nor which part to look at. Every row now
// carries its progress, and the sidebar is both the filter and the summary. Below the wide-web
// breakpoint the sidebar becomes two chip rows above the list, because 232px of filters beside a
// 390px phone leaves nothing for the content.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { FlatList, Platform, Pressable, ScrollView, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { AtLogoMark } from '@/components/AtLogoMark';
import { LoadFailure } from '@/components/LoadFailure';
import { MalAttribution } from '@/components/MalAttribution';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { deriveScopedSeriesStatus, type CountScope, type SeriesStatus } from '@/domain/seriesStatus';
import { progressPhrase, statusLabel, type ProgressHalves } from '@/domain/statusLabel';
import { useIsWideWeb } from '@/hooks/useWebLayout';
import { useSharedLibrary } from '@/repositories/SharedLibraryRepository';
import { sharedLibraryHeading, type SharedSeries } from '@/repositories/sharedLibraryMapping';
import { userFacingMessage } from '@/repositories/errorMessage';
import { radii, spacing } from '@/theme/colors';
import { statusDotColor } from '@/theme/statusColors';
import { makeStyles } from '@/theme/useTheme';

/** The reading width for the whole page. Wider than the onboarding column because this is a
 * sidebar plus a list of rows, not prose. */
const MAX_WIDTH = 1180;
const SIDEBAR_WIDTH = 232;

/**
 * The buckets a viewer filters by, and the words for them.
 *
 * Two deliberate differences from the app's own `statusKindLabel`, both because the audience here
 * has never used the app:
 *
 *  - **"Part-way through"**, not "Watched X/Y". The app's label is shorthand its owner learned;
 *    to a stranger it is a puzzle. The row still shows the real figures.
 *  - **`WATCHED_FORGOT` sits inside "Watched"**. It means "seen it, don't remember the details",
 *    which is a distinction that matters to the person tracking and to nobody else — and a bucket
 *    labelled "Watched (forgot details)" would publish something slightly embarrassing for no
 *    reader's benefit. This groups two kinds under one public word; it does not change what the
 *    app derived.
 */
const BUCKETS = [
  { key: 'WATCHED', label: 'Watched', kinds: ['WATCHED', 'WATCHED_FORGOT'] },
  { key: 'PARTIAL', label: 'Part-way through', kinds: ['WATCHED_PARTIAL'] },
  { key: 'WATCHING', label: 'Currently watching', kinds: ['CURRENTLY_WATCHING'] },
  { key: 'PLAN', label: 'Plan to watch', kinds: ['PLAN'] },
  { key: 'DROPPED', label: 'Dropped', kinds: ['DROPPED'] },
] as const satisfies readonly { key: string; label: string; kinds: readonly SeriesStatus['kind'][] }[];

type BucketKey = (typeof BUCKETS)[number]['key'];

/** Which bucket a derived status falls in. */
function bucketOf(status: SeriesStatus): BucketKey {
  const found = BUCKETS.find((bucket) => (bucket.kinds as readonly string[]).includes(status.kind));
  // Every kind is listed above; the fallback exists so a seventh status added later renders as
  // something rather than vanishing from a page that is meant to show the whole library.
  return found?.key ?? 'WATCHED';
}

/**
 * Asks search engines not to index this page, for as long as it is the one on screen.
 *
 * Written against the DOM rather than through `expo-router/head`: that component is a
 * react-helmet-async wrapper needing a `Head.Provider` at the app root, which is a change to every
 * screen for the sake of one meta tag. Four lines here, removed on unmount, affect nothing else.
 *
 * It is the weaker of the two guards and knows it — a crawler that doesn't run JavaScript never
 * sees it. `public/robots.txt`'s `Disallow: /s/` is the one that does the work; this catches the
 * crawlers that render pages before deciding what to keep.
 */
function useNoIndex() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
}

export default function SharedListScreen() {
  const styles = useStyles();
  useNoIndex();
  const isWide = useIsWideWeb();
  // The route param. `useLocalSearchParams` types it as string | string[]; a one-segment route
  // only ever yields a string, and the guard is here so a malformed URL falls through to the
  // function's own "isn't being shared" answer rather than throwing on the way.
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { library, notShared, isLoading, error, refetch } = useSharedLibrary(slug);

  const [bucket, setBucket] = useState<BucketKey | 'ALL'>('ALL');
  // Null is "both halves", the way the genre chips work — pressing a selected one clears it. A
  // second "Everything" row would be a second reset for the same page and leave two of them
  // disagreeing about what they reset.
  const [scope, setScope] = useState<Exclude<CountScope, 'ALL'> | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const all = useMemo(() => library?.series ?? [], [library]);

  // Counts for the sidebar, and the whole-library totals in the subheading. One pass over the
  // list rather than a filter per bucket, since a large library runs this on every render the
  // filter changes.
  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    // How many shows have a seasons half and how many have a films half. A show with both is in
    // both, which is the honest answer — Demon Slayer genuinely is five seasons and two films.
    const kinds: Record<string, number> = { SEASONS: 0, MOVIES: 0 };
    let watchedEntries = 0;
    let totalEntries = 0;
    for (const series of all) {
      const key = bucketOf(series.status);
      counts[key] = (counts[key] ?? 0) + 1;
      if (series.progress.seasons.total > 0) kinds.SEASONS += 1;
      if (series.progress.movies.total > 0) kinds.MOVIES += 1;
      watchedEntries += series.progress.seasons.watched + series.progress.movies.watched;
      totalEntries += series.progress.seasons.total + series.progress.movies.total;
    }
    return { counts, kinds, watchedEntries, totalEntries };
  }, [all]);

  // Status, then kind, then genre. The order is what the counts are read against: status and kind
  // both count the whole library (so their numbers are stable as you press things), while the
  // genres on offer are rebuilt from whatever the first two left.
  const byBucket = useMemo(
    () => (bucket === 'ALL' ? all : all.filter((series) => bucketOf(series.status) === bucket)),
    [all, bucket],
  );
  const byKind = useMemo(
    () =>
      scope === 'SEASONS'
        ? byBucket.filter((series) => series.progress.seasons.total > 0)
        : scope === 'MOVIES'
          ? byBucket.filter((series) => series.progress.movies.total > 0)
          : byBucket,
    [byBucket, scope],
  );

  // Built from what the filters above already left, so a genre chip can never match nothing. The
  // selection is then applied only if it survived that rebuild, which avoids an effect to prune it
  // — switching status with a genre picked simply shows the status, rather than an empty list the
  // viewer has to work out how to escape.
  const genreOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const series of byKind) for (const g of series.genres) seen.add(g);
    return [...seen].sort();
  }, [byKind]);
  const activeGenre = genre && genreOptions.includes(genre) ? genre : null;
  const rows = useMemo(
    () => (activeGenre ? byKind.filter((series) => series.genres.includes(activeGenre)) : byKind),
    [byKind, activeGenre],
  );

  if (isLoading) {
    return (
      <View style={styles.flex}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  // A real failure — the network, or the server. Retryable, and deliberately worded as a problem
  // on our side rather than as "this list doesn't exist", which is the next branch's answer and a
  // very different claim.
  if (error) {
    return (
      <View style={styles.flex}>
        <View style={styles.center}>
          <LoadFailure message={userFacingMessage(error, 'Couldn’t load this list.')} onRetry={refetch} />
        </View>
      </View>
    );
  }

  // Revoked, mistyped, or never real — one answer for all three. Not an error screen: there is
  // nothing wrong, and nothing for the person reading it to do.
  if (notShared || !library) {
    return (
      <View style={styles.flex}>
        <View style={styles.center}>
          <AtLogoMark size={48} />
          <Text variant="titleMedium" style={styles.emptyTitle}>
            This list isn’t being shared
          </Text>
          <Text variant="bodyMedium" style={styles.emptyBody}>
            The link may have been turned off, or it may never have been a link at all.
          </Text>
        </View>
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <AtLogoMark size={26} />
        {/* The app's own name, not MyAnimeList's. §3(a)(xi) bars making this look like a Company
            Offering, and a page a stranger lands on cold is exactly where that could go wrong. */}
        <Text variant="labelLarge" style={styles.brandText}>
          AnimeTracker
        </Text>
      </View>
      <Text variant="headlineSmall" style={styles.heading}>
        {sharedLibraryHeading(library.displayName)}
      </Text>
      <Text variant="bodyMedium" style={styles.subheading}>
        {all.length === 1 ? '1 show' : `${all.length} shows`}
        {summary.totalEntries > 0
          ? ` · ${summary.watchedEntries} of ${summary.totalEntries} seasons and films watched`
          : ''}
      </Text>
    </View>
  );

  const filters = (
    <StatusFilters
      counts={summary.counts}
      total={all.length}
      active={bucket}
      onSelect={(next) => setBucket(next)}
      kindCounts={summary.kinds}
      activeKind={scope}
      onSelectKind={(next) => setScope(next === scope ? null : next)}
      genres={genreOptions}
      activeGenre={activeGenre}
      onSelectGenre={(next) => setGenre(next === activeGenre ? null : next)}
      wide={isWide}
    />
  );

  const list = (
    <FlatList
      data={rows}
      // By index, which is correct here and not a shortcut: the response carries no ids by design,
      // and this list is rendered once per load with no reordering, insertion or removal for an
      // index to get wrong.
      keyExtractor={(_, index) => String(index)}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => <SeriesRow series={item} wide={isWide} scope={scope} />}
      ListHeaderComponent={isWide ? null : <View style={styles.narrowFilters}>{filters}</View>}
      ListEmptyComponent={
        <View style={styles.emptyRows}>
          <Text variant="bodyLarge" style={styles.emptyBody}>
            {/* Two different nothings. An empty library is the owner's, and saying "no shows match"
                there would blame a filter the viewer never touched. */}
            {all.length === 0 ? 'Nothing on this list yet.' : 'Nothing here with that filter.'}
          </Text>
        </View>
      }
      ListFooterComponent={
        <View style={styles.footer}>
          {/* Guardrail #4 / §3(a)(xiii): attribution, on the page a stranger sees as much as in
              the app. */}
          <MalAttribution />
        </View>
      }
    />
  );

  return (
    <View style={styles.flex}>
      <View style={styles.page}>
        {header}
        {isWide ? (
          <View style={styles.wideBody}>
            {/* Its own scroll view, so a long genre list can scroll without taking the rows with
                it — the sidebar staying put while the list moves is the whole point of this
                layout. */}
            <ScrollView style={styles.sidebar} contentContainerStyle={styles.sidebarContent}>
              {filters}
            </ScrollView>
            <View style={styles.listColumn}>{list}</View>
          </View>
        ) : (
          list
        )}
      </View>
    </View>
  );
}

/**
 * The status list and the genre chips — a sidebar on wide web, two chip rows above the list on a
 * phone. One component rather than two so the counts, the labels and the selected state cannot
 * drift between the shapes; only the direction and the chrome differ.
 */
function StatusFilters({
  counts,
  total,
  active,
  onSelect,
  kindCounts,
  activeKind,
  onSelectKind,
  genres,
  activeGenre,
  onSelectGenre,
  wide,
}: {
  counts: Record<string, number>;
  total: number;
  active: BucketKey | 'ALL';
  onSelect: (key: BucketKey | 'ALL') => void;
  kindCounts: Record<string, number>;
  activeKind: Exclude<CountScope, 'ALL'> | null;
  onSelectKind: (scope: Exclude<CountScope, 'ALL'>) => void;
  genres: string[];
  activeGenre: string | null;
  onSelectGenre: (genre: string) => void;
  wide: boolean;
}) {
  const styles = useStyles();

  // A bucket nobody's library uses is left out entirely: offering a filter that matches nothing is
  // worse than offering fewer, and on a small library most of these are empty.
  const shown = BUCKETS.filter((b) => (counts[b.key] ?? 0) > 0);
  const options: { key: BucketKey | 'ALL'; label: string; count: number; dot: string | null }[] = [
    { key: 'ALL', label: 'Everything', count: total, dot: null },
    ...shown.map((b) => ({
      key: b.key as BucketKey,
      label: b.label,
      count: counts[b.key] ?? 0,
      // The app's own status colour, so a reader who has seen the Library recognizes it and a
      // reader who hasn't still gets a consistent key down the page.
      dot: statusDotColor(b.kinds[0]),
    })),
  ];

  const statusList = options.map((option) => {
    const selected = option.key === active;
    return (
      <Pressable
        key={option.key}
        onPress={() => onSelect(option.key)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[wide ? styles.sideRow : styles.chip, selected && (wide ? styles.sideRowActive : styles.chipActive)]}
      >
        {option.dot && <View style={[styles.dot, { backgroundColor: option.dot }]} />}
        <Text variant="bodySmall" style={selected ? styles.filterTextActive : styles.filterText}>
          {option.label}
        </Text>
        {wide && <View style={styles.spacer} />}
        <Text variant="bodySmall" style={selected ? styles.filterCountActive : styles.filterCount}>
          {option.count}
        </Text>
      </Pressable>
    );
  });

  // Not a filter over *rows* but a lens over each one — the Library's own COUNT scope
  // (deriveScopedSeriesStatus), which is why picking Series hides the film half of every row's
  // progress rather than merely hiding the shows that are films. Demon Slayer under Series reads
  // "Watched 5/5 seasons"; under Movies, "Watched 1/2 movies". A show with both halves appears
  // under both, which is the honest answer rather than a duplicate.
  //
  // This is the reason it is not a plain `type` filter: that one would have put the 176 films
  // sitting inside TV series out of reach of every filter on the page, visible only under
  // Everything.
  //
  // Hidden outright unless the library actually holds both kinds. Most libraries are all series,
  // and a "Movies (0)" row is a filter that can only disappoint.
  const KINDS: { key: Exclude<CountScope, 'ALL'>; label: string }[] = [
    { key: 'SEASONS', label: 'Series' },
    { key: 'MOVIES', label: 'Movies' },
  ];
  const kindsShown = KINDS.filter((k) => (kindCounts[k.key] ?? 0) > 0);
  const kindList = kindsShown.map((k) => {
    const selected = k.key === activeKind;
    return (
      <Pressable
        key={k.key}
        onPress={() => onSelectKind(k.key)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[wide ? styles.sideRow : styles.chip, selected && (wide ? styles.sideRowActive : styles.chipActive)]}
      >
        <Text variant="bodySmall" style={selected ? styles.filterTextActive : styles.filterText}>
          {k.label}
        </Text>
        {wide && <View style={styles.spacer} />}
        <Text variant="bodySmall" style={selected ? styles.filterCountActive : styles.filterCount}>
          {kindCounts[k.key] ?? 0}
        </Text>
      </Pressable>
    );
  });

  const genreList = genres.map((g) => {
    const selected = g === activeGenre;
    return (
      <Pressable
        key={g}
        onPress={() => onSelectGenre(g)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[styles.genreChip, selected && styles.chipActive]}
      >
        <Text variant="bodySmall" style={selected ? styles.filterTextActive : styles.filterText}>
          {g}
        </Text>
      </Pressable>
    );
  });

  if (wide) {
    return (
      <>
        <Text variant="labelSmall" style={styles.sideHeading}>
          STATUS
        </Text>
        <View style={styles.sideGroup}>{statusList}</View>
        {kindsShown.length > 1 && (
          <>
            <Text variant="labelSmall" style={styles.sideHeading}>
              KIND
            </Text>
            <View style={styles.sideGroup}>{kindList}</View>
          </>
        )}
        {genres.length > 1 && (
          <>
            <Text variant="labelSmall" style={styles.sideHeading}>
              GENRE
            </Text>
            <View style={styles.chipWrap}>{genreList}</View>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {statusList}
      </ScrollView>
      {kindsShown.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {kindList}
        </ScrollView>
      )}
      {genres.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipRow}
          contentContainerStyle={styles.chipRowContent}
        >
          {genreList}
        </ScrollView>
      )}
    </>
  );
}

const EMPTY_HALF = { watched: 0, total: 0 };

/**
 * One show. Thumbnail, title, genres, then the status and how far through it is.
 *
 * The progress bar is the reason this layout was chosen over a poster grid: it is the one thing a
 * reader of someone else's list actually wants and a cover cannot say. On a phone the status block
 * sits under the title instead of beside it, because 216px of it next to a 44px thumbnail leaves a
 * title about four characters wide.
 *
 * Under a lens (`scope`) the status is **re-derived**, not filtered: `deriveScopedSeriesStatus` is
 * the app's own function running over one half of the entries, so "Watched 5/5 seasons" under
 * Series and "Watched 1/2 movies" under Movies are both answers the Library would give to the same
 * question. Hiding half the phrase while leaving the status pill saying something about both
 * halves would be this page inventing a third reading of the data.
 */
function SeriesRow({
  series,
  wide,
  scope,
}: {
  series: SharedSeries;
  wide: boolean;
  scope: Exclude<CountScope, 'ALL'> | null;
}) {
  const styles = useStyles();
  const status = scope
    ? deriveScopedSeriesStatus(
        series.manualStatus,
        series.entries.map((entry) => ({
          kind: entry.kind,
          orderIndex: entry.orderIndex,
          watchState: entry.watchState,
        })),
        scope,
      )
    : series.status;
  // The halves the bar and the figures count, narrowed the same way the status just was.
  const halves: ProgressHalves =
    scope === 'SEASONS'
      ? { seasons: series.progress.seasons, movies: EMPTY_HALF }
      : scope === 'MOVIES'
        ? { seasons: EMPTY_HALF, movies: series.progress.movies }
        : series.progress;
  const label = statusLabel(status);
  const colour = statusDotColor(status.kind);
  const done = halves.seasons.watched + halves.movies.watched;
  const total = halves.seasons.total + halves.movies.total;
  const fraction = total > 0 ? done / total : 0;
  const counts = progressPhrase(halves);

  const statusBlock = (
    <View style={wide ? styles.statusColumn : styles.statusStacked}>
      <View style={styles.statusLine}>
        <View style={[styles.dot, { backgroundColor: colour }]} />
        <Text variant="bodySmall" style={styles.statusText} numberOfLines={1}>
          {/* The app's own label, verbatim — "Watched 3/5 seasons, 2/3 movies" and the rest. */}
          {label}
        </Text>
        {wide && <View style={styles.spacer} />}
      </View>
      {counts.length > 0 && (
        <>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: colour }]} />
          </View>
          <Text variant="bodySmall" style={styles.countsText} numberOfLines={1}>
            {counts}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.row}>
      <Image source={series.coverUrl ?? undefined} style={styles.thumb} contentFit="cover" />
      <View style={styles.rowText}>
        <SeriesTitleText variant="titleSmall" numberOfLines={2} style={styles.rowTitle}>
          {series.title}
        </SeriesTitleText>
        {series.genres.length > 0 && (
          <Text variant="bodySmall" numberOfLines={1} style={styles.rowGenres}>
            {series.genres.join(' · ')}
          </Text>
        )}
        {!wide && statusBlock}
      </View>
      {wide && statusBlock}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  header: { gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandText: { color: colors.textMuted, letterSpacing: 1 },
  heading: { color: colors.textPrimary },
  subheading: { color: colors.textMuted },
  wideBody: { flex: 1, flexDirection: 'row', gap: spacing.xl, paddingHorizontal: spacing.lg },
  sidebar: { width: SIDEBAR_WIDTH, flexGrow: 0, flexShrink: 0 },
  sidebarContent: { gap: spacing.xs, paddingBottom: spacing.xl },
  listColumn: { flex: 1 },
  listContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  narrowFilters: { gap: spacing.xs, marginBottom: spacing.sm },

  sideHeading: { color: colors.textFaint, letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs },
  sideGroup: { gap: 2 },
  sideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  sideRowActive: { backgroundColor: colors.primaryDark },
  chipRow: { flexGrow: 0, flexShrink: 0 },
  chipRowContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  genreChip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  filterText: { color: colors.textPrimary },
  filterTextActive: { color: '#FFFFFF' },
  filterCount: { color: colors.textFaint },
  filterCountActive: { color: '#FFFFFF', opacity: 0.7 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  thumb: { width: 44, height: 62, borderRadius: radii.sm, backgroundColor: colors.coverPlaceholder },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { color: colors.textPrimary },
  rowGenres: { color: colors.textMuted },
  statusColumn: { width: 216, gap: 5 },
  statusStacked: { marginTop: spacing.xs, gap: 5 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: colors.textPrimary, flexShrink: 1 },
  countsText: { color: colors.textMuted },
  track: { height: 5, borderRadius: radii.pill, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
  dot: { width: 8, height: 8, borderRadius: 4 },
  spacer: { flex: 1 },

  emptyTitle: { color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, textAlign: 'center' },
  emptyRows: { padding: spacing.xl, alignItems: 'center' },
  footer: { marginTop: spacing.lg },
}));
