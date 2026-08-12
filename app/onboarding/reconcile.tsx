// Reconcile screen — the RN equivalent of ReconcileScreen.kt + ReconcileViewModel.kt collapsed
// into one component. React has no ViewModel layer of its own; this screen's useState plays that
// role directly, same pattern as the rest of this app (screens call repository functions/hooks,
// no separate state-holder class). Runs the import on mount, lets the user tick any seasons they
// watched but MAL doesn't know about (they historically only marked season 1 on MAL), then writes
// the result to Postgres (replaceAllSeries's replace_library RPC) on confirm.
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';
import {
  addImportedSeries,
  markInitialImportComplete,
  markLastSync,
  replaceAllSeries,
} from '@/repositories/AnimeRepository';
import { runAdditiveSync, runImport } from '@/repositories/ImportRepository';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import { statusLabel } from '@/domain/statusLabel';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import { GradientProgressBar } from '@/components/GradientProgressBar';
import { colors, radii, spacing } from '@/theme/colors';
import type { ReconcileEntry, ReconcileSeries } from '@/domain/reconcileSeries';

type ScreenState =
  | { kind: 'FETCHING_LIST' }
  | { kind: 'FETCHING_DETAILS'; completed: number; total: number }
  | { kind: 'READY'; series: ReconcileSeries[] }
  | { kind: 'ERROR'; message: string }
  | { kind: 'SAVING' };

export default function ReconcileScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'FETCHING_LIST' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();
  // 'import' (onboarding, the default) fetches the whole MAL list and saves it as a full replace;
  // 'additive' fetches only shows added to MAL since, and inserts them alongside the existing
  // library. Everything between those two ends — the state machine, the checklist, select-all,
  // the error/retry branch — is identical, which is why this is a mode rather than a second screen.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAdditive = mode === 'additive';

  const startImport = useCallback(() => {
    setState({ kind: 'FETCHING_LIST' });
    const run = isAdditive ? runAdditiveSync : runImport;
    run((progress) => {
      switch (progress.kind) {
        case 'FETCHING_LIST':
          setState({ kind: 'FETCHING_LIST' });
          break;
        case 'FETCHING_DETAILS':
          setState({ kind: 'FETCHING_DETAILS', completed: progress.completed, total: progress.total });
          break;
        case 'READY':
          setState({ kind: 'READY', series: progress.series });
          break;
        case 'FAILED':
          setState({ kind: 'ERROR', message: progress.message });
          break;
      }
    });
  }, [isAdditive]);

  // Guards against a double-mount firing runImport() twice on load — same pattern as app/auth.tsx
  // and app/oauth-complete.tsx. Real-world impact confirmed via the Supabase dashboard: two
  // mal-import invocations were booting in the same second, and the platform was dropping one of
  // them (EarlyDrop) rather than queuing it, which surfaced as a generic "mal-import failed" error
  // even though neither call was individually doing anything wrong. Doesn't guard the Retry
  // button's own onPress — that one should always be allowed to start a fresh attempt.
  const ranInitialImport = useRef(false);
  useEffect(() => {
    if (ranInitialImport.current) return;
    ranInitialImport.current = true;
    startImport();
  }, [startImport]);

  function toggleEntry(seriesRootMalId: number, entryMalId: number) {
    setState((current) => {
      if (current.kind !== 'READY') return current;
      return {
        kind: 'READY',
        series: current.series.map((s) =>
          s.rootMalId !== seriesRootMalId
            ? s
            : {
                ...s,
                entries: s.entries.map((e) =>
                  e.malId !== entryMalId
                    ? e
                    : { ...e, watchState: e.watchState === 'WATCHED' ? 'UNWATCHED' : 'WATCHED' },
                ),
              },
        ),
      };
    });
  }

  // Ticks (or clears) every season/movie across every series at once — MAL users who mark
  // everything "completed" as they finish it just want the whole checklist pre-filled, not a
  // series-by-series tap-through. Toggles based on the current all-watched state so the same
  // button both selects and clears, rather than needing two.
  function setAllEntries(watched: boolean) {
    setState((current) => {
      if (current.kind !== 'READY') return current;
      return {
        kind: 'READY',
        series: current.series.map((s) => ({
          ...s,
          entries: s.entries.map((e) => ({ ...e, watchState: watched ? 'WATCHED' : 'UNWATCHED' })),
        })),
      };
    });
  }

  async function confirm() {
    if (state.kind !== 'READY') return;
    const imported = state.series;
    setState({ kind: 'SAVING' });
    try {
      if (isAdditive) {
        // Insert-only, and back to wherever the user came from — the library they already had is
        // still there, so there's nothing to redirect them to. markLastSync deliberately does not
        // touch initial_import_completed_at (see AnimeRepository).
        const { failed } = await addImportedSeries(imported);
        await markLastSync();
        if (failed > 0) {
          setState({ kind: 'READY', series: imported });
          setSaveError(`${failed} of ${imported.length} shows could not be added. Try again.`);
          return;
        }
        router.back();
        return;
      }
      await replaceAllSeries(imported);
      await markInitialImportComplete();
      router.replace('/');
    } catch (e) {
      // Without this the screen sat on "Saving..." forever with no way out, and the only copy of
      // the fetched import was this component's state. Going back to READY with the same list
      // keeps the user's ticks and makes Confirm retryable — replaceAllSeries is transactional, so
      // a failed attempt left the library untouched rather than half-written.
      setState({ kind: 'READY', series: imported });
      setSaveError(e instanceof Error ? e.message : 'Could not save your library. Please try again.');
    }
  }

  if (state.kind === 'FETCHING_LIST') {
    return <StatusView message="Fetching your MyAnimeList..." />;
  }
  if (state.kind === 'FETCHING_DETAILS') {
    return (
      <StatusView
        message={`Fetching season/movie details (${state.completed}/${state.total})...`}
        progressFraction={state.total > 0 ? state.completed / state.total : undefined}
      />
    );
  }
  if (state.kind === 'SAVING') {
    return <StatusView message="Saving..." />;
  }
  if (state.kind === 'ERROR') {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.error}>
          {state.message}
        </Text>
        <Button mode="contained" onPress={startImport}>
          Retry
        </Button>
      </View>
    );
  }

  // Finding nothing is a normal outcome for the additive sync (it's what a repeat run looks like),
  // so it gets a real "nothing to do" screen rather than an empty checklist above a Confirm button
  // that would save nothing. The onboarding import has no equivalent case — an empty MAL list still
  // needs confirming, since that's what marks onboarding done.
  if (isAdditive && state.series.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge">You&apos;re up to date</Text>
        <Text variant="bodyMedium" style={styles.mutedText}>
          No new shows on your MyAnimeList.
        </Text>
        <Button mode="contained" onPress={() => router.back()} buttonColor={colors.primary}>
          Done
        </Button>
      </View>
    );
  }

  const allWatched = state.series.every((s) => s.entries.every((e) => e.watchState === 'WATCHED'));

  return (
    <View style={styles.container}>
      <View style={styles.selectAllRow}>
        <Text variant="bodyMedium" style={styles.mutedText}>
          {state.series.length} {isAdditive ? 'new shows found' : 'shows found'}
        </Text>
        <Button compact onPress={() => setAllEntries(!allWatched)}>
          {allWatched ? 'Deselect all' : 'Select all'}
        </Button>
      </View>
      <FlatList
        data={state.series}
        keyExtractor={(s) => String(s.rootMalId)}
        renderItem={({ item }) => <SeriesGroup series={item} onToggleEntry={toggleEntry} />}
      />
      <Button mode="contained" onPress={confirm} style={styles.confirmButton} buttonColor={colors.primary}>
        {isAdditive ? 'Add to library' : 'Confirm & save'}
      </Button>
      <Snackbar visible={saveError !== null} onDismiss={() => setSaveError(null)} duration={6000}>
        {saveError}
      </Snackbar>
    </View>
  );
}

function StatusView({ message, progressFraction }: { message: string; progressFraction?: number }) {
  return (
    <View style={styles.center}>
      {progressFraction !== undefined ? (
        <View style={styles.progressBarWrap}>
          <GradientProgressBar progress={progressFraction} />
        </View>
      ) : (
        <ActivityIndicator size="large" />
      )}
      <Text variant="bodyLarge">{message}</Text>
    </View>
  );
}

function SeriesGroup({
  series,
  onToggleEntry,
}: {
  series: ReconcileSeries;
  onToggleEntry: (seriesRootMalId: number, entryMalId: number) => void;
}) {
  const status = deriveSeriesStatus(series.manualStatus, series.entries);
  return (
    <View>
      <View style={styles.seriesHeader}>
        <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.seriesHeaderText}>
          <SeriesTitleText variant="titleMedium">{series.title}</SeriesTitleText>
          <Text variant="bodyMedium" style={styles.mutedText}>
            {statusLabel(status)}
          </Text>
        </View>
      </View>
      {series.entries.map((entry) => (
        <EntryRow key={entry.malId} entry={entry} onPress={() => onToggleEntry(series.rootMalId, entry.malId)} />
      ))}
    </View>
  );
}

function EntryRow({ entry, onPress }: { entry: ReconcileEntry; onPress: () => void }) {
  return (
    <View style={styles.entryRow}>
      <SquareCheckbox checked={entry.watchState === 'WATCHED'} onPress={onPress} accessibilityLabel={entry.title} />
      <View style={styles.entryText}>
        <Text variant="bodyLarge" onPress={onPress}>
          {entry.title}
        </Text>
        <Text variant="bodySmall" style={styles.mutedText}>
          {entry.kind === 'MOVIE' ? 'Movie' : 'TV Season'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  error: { textAlign: 'center' },
  progressBarWrap: { width: 200 },
  confirmButton: { margin: 16, borderRadius: radii.pill },
  mutedText: { color: colors.textMuted },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  seriesHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 8, gap: 12 },
  seriesHeaderText: { flex: 1 },
  cover: { width: 48, height: 68, borderRadius: radii.sm, backgroundColor: colors.border },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: 20, paddingVertical: spacing.xs },
  entryText: { flex: 1 },
});
