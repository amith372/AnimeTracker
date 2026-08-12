// Reconcile screen — the RN equivalent of ReconcileScreen.kt + ReconcileViewModel.kt collapsed
// into one component. React has no ViewModel layer of its own; this screen's useState plays that
// role directly, same pattern as the rest of this app (screens call repository functions/hooks,
// no separate state-holder class). Runs the import on mount, lets the user tick any seasons they
// watched but MAL doesn't know about (they historically only marked season 1 on MAL), then writes
// the result to Postgres (replaceAllSeries's replace_library RPC) on confirm.
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Button, Dialog, Portal, Snackbar, Text } from 'react-native-paper';
import {
  addImportedSeries,
  markInitialImportComplete,
  markLastSync,
  replaceAllSeries,
  useLibrary,
} from '@/repositories/AnimeRepository';
import { userFacingMessage } from '@/repositories/errorMessage';
import { runAdditiveSync, runImport } from '@/repositories/ImportRepository';
import { deriveSeriesStatus } from '@/domain/seriesStatus';
import { statusLabel } from '@/domain/statusLabel';
import { SeriesTitleText } from '@/components/SeriesTitleText';
import { SquareCheckbox } from '@/components/SquareCheckbox';
import { GradientProgressBar } from '@/components/GradientProgressBar';
import { colors, radii, spacing } from '@/theme/colors';
import { dialogStyle } from '@/theme/dialog';
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
  // Confirming a *replace* — see replaceConfirmDialog. Only ever shown when there's an existing
  // library to lose; a first-time import goes straight through.
  const [replaceConfirmVisible, setReplaceConfirmVisible] = useState(false);
  const router = useRouter();
  // 'import' (onboarding, the default) fetches the whole MAL list and saves it as a full replace;
  // 'additive' fetches only shows added to MAL since, and inserts them alongside the existing
  // library. Everything between those two ends — the state machine, the checklist, the error/retry
  // branch — is identical, which is why this is a mode rather than a second screen.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isAdditive = mode === 'additive';
  // What's already in the library, purely so the confirm step can say what a replace would cost.
  // Only meaningful in 'import' mode — the additive path never deletes anything.
  const { series: existingLibrary } = useLibrary();
  const replacesExistingLibrary = !isAdditive && existingLibrary.length > 0;
  // Which shows have their season list open. The list is a scan-and-correct task, not a
  // tick-everything one: a real library runs to hundreds of shows, and rendering every season of
  // every one at once buried the show titles in a wall of rows. Collapsed by default, keyed by
  // rootMalId, and held here rather than inside SeriesGroup so a row that scrolls out of the
  // FlatList's window and back doesn't silently collapse again.
  const [expandedRoots, setExpandedRoots] = useState<Set<number>>(new Set());

  function toggleExpanded(rootMalId: number) {
    setExpandedRoots((current) => {
      const next = new Set(current);
      if (!next.delete(rootMalId)) next.add(rootMalId);
      return next;
    });
  }

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

  // The Confirm button's handler. Everything except an actual replace commits immediately; a
  // replace stops for the dialog first — see replaceConfirmDialog for why.
  function handleConfirmPress() {
    if (replacesExistingLibrary) setReplaceConfirmVisible(true);
    else confirm();
  }

  async function confirm() {
    setReplaceConfirmVisible(false);
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
      setSaveError(userFacingMessage(e, 'Could not save your library. Your ticks are still here — try again.'));
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

  // Saving an import is a *replace*: replaceAllSeries wipes the whole library inside one
  // transaction (see AnimeRepository). Harmless the first time, when there's nothing to lose — but
  // on a re-run it silently destroys everything MAL can't give back: won't-watch marks, manual
  // status overrides, and liked flags all live only here. That deserved at least the confirmation
  // the (reversible, MAL-side) push already has, and had none.
  const replaceConfirmDialog = (
    <Portal>
      <Dialog visible={replaceConfirmVisible} onDismiss={() => setReplaceConfirmVisible(false)} style={dialogStyle}>
        <Dialog.Title>Replace your library?</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            This replaces all {existingLibrary.length} shows in your library with the{' '}
            {state.kind === 'READY' ? state.series.length : 0} above. Anything MyAnimeList doesn&apos;t know
            about — seasons you marked &quot;won&apos;t watch&quot;, statuses you set yourself, and shows you
            liked — is lost and can&apos;t be brought back. Your MyAnimeList account isn&apos;t touched.
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={() => setReplaceConfirmVisible(false)}>Cancel</Button>
          <Button textColor={colors.red} onPress={confirm}>
            Replace
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );

  return (
    <View style={styles.container}>
      <View style={styles.countRow}>
        <Text variant="bodyMedium" style={styles.mutedText}>
          {state.series.length} {isAdditive ? 'new shows found' : 'shows found'}
        </Text>
        <Text variant="bodySmall" style={styles.mutedText}>
          Tap a show to tick the seasons you&apos;ve watched
        </Text>
      </View>
      <FlatList
        data={state.series}
        keyExtractor={(s) => String(s.rootMalId)}
        renderItem={({ item }) => (
          <SeriesGroup
            series={item}
            expanded={expandedRoots.has(item.rootMalId)}
            onToggleExpanded={() => toggleExpanded(item.rootMalId)}
            onToggleEntry={toggleEntry}
          />
        )}
      />
      {/* "Replace my library" when that's what the button actually does — "Confirm & save" named
          the safe first-time case for an action that, on a re-run, deletes everything first. */}
      <Button mode="contained" onPress={handleConfirmPress} style={styles.confirmButton} buttonColor={colors.primary}>
        {isAdditive ? 'Add to library' : replacesExistingLibrary ? 'Replace my library' : 'Confirm & save'}
      </Button>
      {replaceConfirmDialog}
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

/** One show on the checklist: a tappable header that expands to reveal its seasons/movies. The
 * header doubles as the summary — its status line ("Watched 2/5 seasons") is what tells the user
 * whether a collapsed show still needs correcting, so the list stays scannable without opening
 * every row. */
function SeriesGroup({
  series,
  expanded,
  onToggleExpanded,
  onToggleEntry,
}: {
  series: ReconcileSeries;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleEntry: (seriesRootMalId: number, entryMalId: number) => void;
}) {
  const status = deriveSeriesStatus(series.manualStatus, series.entries);
  const entryCount = series.entries.length;
  return (
    <View>
      <Pressable
        style={styles.seriesHeader}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={series.title}
      >
        <Image source={series.coverUrl ?? undefined} style={styles.cover} contentFit="cover" />
        <View style={styles.seriesHeaderText}>
          <SeriesTitleText variant="titleMedium">{series.title}</SeriesTitleText>
          <Text variant="bodyMedium" style={styles.mutedText}>
            {statusLabel(status)}
          </Text>
          <Text variant="bodySmall" style={styles.mutedText}>
            {entryCount} {entryCount === 1 ? 'season/movie' : 'seasons & movies'}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color={colors.textMuted}
        />
      </Pressable>
      {expanded &&
        series.entries.map((entry) => (
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
  countRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 2 },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  seriesHeaderText: { flex: 1 },
  cover: { width: 48, height: 68, borderRadius: radii.sm, backgroundColor: colors.border },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: 20, paddingVertical: spacing.xs },
  entryText: { flex: 1 },
});
