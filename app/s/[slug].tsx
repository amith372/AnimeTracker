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
//    the labels come from the real `statusLabel`, so this page and the owner's Library can never
//    disagree about what "Watched 3/5 seasons" means (success criterion 5).
//  - **It is visibly AnimeTracker and attributes MyAnimeList** — guardrail #4 and §3(a)(xi)/(xiii),
//    which matter more on a page a stranger sees than on one only the owner does.
//  - **It asks not to be indexed.** An unguessable slug keeps a list from being found; the meta
//    tag and `public/robots.txt`'s disallow keep a shared one from being archived and surfaced in
//    search long after it was revoked.
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Image } from 'expo-image';
import { FlatList, Platform, View } from 'react-native';
import { ActivityIndicator, Card, Text } from 'react-native-paper';
import { AtLogoMark } from '@/components/AtLogoMark';
import { LoadFailure } from '@/components/LoadFailure';
import { MalAttribution } from '@/components/MalAttribution';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { statusLabel } from '@/domain/statusLabel';
import { useSharedLibrary } from '@/repositories/SharedLibraryRepository';
import { sharedLibraryHeading, type SharedSeries } from '@/repositories/sharedLibraryMapping';
import { userFacingMessage } from '@/repositories/errorMessage';
import { layout, radii, spacing } from '@/theme/colors';
import { statusDotColor } from '@/theme/statusColors';
import { makeStyles, useThemeColors } from '@/theme/useTheme';

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
  const colors = useThemeColors();
  useNoIndex();
  // The route param. `useLocalSearchParams` types it as string | string[]; a one-segment route
  // only ever yields a string, and the guard is here so a malformed URL falls through to the
  // function's own "isn't being shared" answer rather than throwing on the way.
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const { library, notShared, isLoading, error, refetch } = useSharedLibrary(slug);

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

  const heading = sharedLibraryHeading(library.displayName);
  const count = library.series.length;

  return (
    <View style={styles.flex}>
      <FlatList
        data={library.series}
        // By index, which is correct here and not a shortcut: the response carries no ids by
        // design, and this list is rendered once per load with no reordering, insertion or
        // removal for an index to get wrong.
        keyExtractor={(_, index) => String(index)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <AtLogoMark size={28} />
              {/* The app's own name, not MyAnimeList's. §3(a)(xi) bars making this look like a
                  Company Offering, and a page a stranger lands on cold is exactly where that
                  could go wrong. */}
              <Text variant="labelLarge" style={styles.brandText}>
                AnimeTracker
              </Text>
            </View>
            <Text variant="headlineSmall" style={styles.heading}>
              {heading}
            </Text>
            <Text variant="bodyMedium" style={styles.subheading}>
              {count === 1 ? '1 show' : `${count} shows`}
            </Text>
          </View>
        }
        renderItem={({ item }) => <SharedSeriesCard series={item} />}
        ListEmptyComponent={
          // Not a blank page, which reads as broken. The PRD's empty-library edge case.
          <View style={styles.center}>
            <Text variant="bodyLarge" style={styles.emptyBody}>
              Nothing on this list yet.
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
    </View>
  );
}

/**
 * One row. Cover, title, status and genres — the same four things the Recommendations cards carry,
 * and genres as a dotted line rather than Chip components for the same reason they are there: a
 * row of chips in a narrow column wraps into a block taller than the cover beside it.
 *
 * Not pressable. There is nowhere for a viewer to go, and a card that looks tappable and does
 * nothing is worse than one that plainly doesn't.
 */
function SharedSeriesCard({ series }: { series: SharedSeries }) {
  const styles = useStyles();
  const label = statusLabel(series.status);
  const dot = statusDotColor(series.status.kind);

  return (
    <Card style={styles.card}>
      <Card.Content style={styles.cardContent}>
        <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.cardText}>
          <SeriesTitleText variant="titleMedium" numberOfLines={2} style={styles.title}>
            {series.title}
          </SeriesTitleText>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text variant="bodySmall" style={styles.muted}>
              {label}
            </Text>
            {series.type === 'STANDALONE_MOVIE' && (
              <Text variant="bodySmall" style={styles.muted}>
                · Movie
              </Text>
            )}
          </View>
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

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  // The same reading column the onboarding screens use: a list of cards spanning a 1900px window
  // puts the cover and the title at opposite ends of the eye's travel.
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: layout.onboardingColumn,
    alignSelf: 'center',
  },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brandText: { color: colors.textMuted },
  heading: { color: colors.textPrimary },
  subheading: { color: colors.textMuted },
  emptyTitle: { color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, textAlign: 'center' },
  footer: { marginTop: spacing.lg },
  card: { backgroundColor: colors.surface },
  cardContent: { flexDirection: 'row', gap: spacing.md },
  cover: { width: 72, height: 102, borderRadius: radii.sm, backgroundColor: colors.background },
  cardText: { flex: 1, gap: spacing.xs },
  title: { color: colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muted: { color: colors.textMuted },
}));
