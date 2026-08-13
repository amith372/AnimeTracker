// Shared "Add <series>" status-picker dialog — used by Discover (Phase 4) and Recommendations
// (Phase 6), both of which need the user to pick a status before a prospective series is written
// to the library. Offers the four manual statuses plus "Watched", which is a derived status rather
// than a manual one and so means "Auto, with season 1 ticked" — see ADD_STATUS_CHOICES and
// applyAddChoice. Still no `NONE` on its own: bare Auto on a brand-new show with nothing watched
// is indistinguishable from not tracking it.
import { useEffect, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { ActivityIndicator, Button, Dialog, Portal, RadioButton, Text } from 'react-native-paper';
import { ADD_STATUS_CHOICES, addChoiceLabel, type AddChoice } from '@/domain/statusLabel';
import { getSynopsis } from '@/repositories/SynopsisRepository';
import { spacing } from '@/theme/colors';
import { makeStyles } from '@/theme/useTheme';
import { dialogStyle } from '@/theme/dialog';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

// How much of the summary to show before clipping. Enough to tell whether a show is worth adding
// without turning a status picker into a reading page — the full text lives on the show's own
// screen (Series Detail, or the preview screen's info button).
const SYNOPSIS_LINES = 4;

export function AddSeriesDialog({
  series,
  onConfirm,
  onCancel,
}: {
  series: ReconcileSeries | null;
  onConfirm: (choice: AddChoice) => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const [selected, setSelected] = useState<AddChoice>('PLAN');
  const [synopsis, setSynopsis] = useState<string | null>(null);
  const [synopsisLoading, setSynopsisLoading] = useState(false);

  // This component stays mounted while `series` toggles between null and a show, so without an
  // explicit reset the radio keeps whatever was chosen last time: add one show as Dropped and the
  // next Add dialog opens pre-set to Dropped. Plan-to-watch is the right default for a show you're
  // adding rather than one you're editing. (Same fix the Detail screen's status editor already
  // carries — it just never made it across to this dialog.)
  useEffect(() => {
    if (series !== null) setSelected('PLAN');
  }, [series]);

  // Deciding whether to add a show off a poster and a title alone meant opening MAL in a browser to
  // find out what it even is. The summary comes from the same cached detail response Discover
  // already fetched to build this row, so in practice it's a cache hit, not a new MAL request
  // (guardrail #3). Keyed on rootMalId — the summary is the *series'*, not one season's.
  const rootMalId = series?.rootMalId ?? null;
  useEffect(() => {
    if (rootMalId === null) return;
    let cancelled = false;
    setSynopsis(null);
    setSynopsisLoading(true);
    getSynopsis(rootMalId).then((text) => {
      if (cancelled) return;
      setSynopsis(text?.trim() || null);
      setSynopsisLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [rootMalId]);

  return (
    <Portal>
      <Dialog visible={series !== null} onDismiss={onCancel} style={dialogStyle}>
        <Dialog.Title>Add "{series?.title}"</Dialog.Title>
        {/* Scrolls, because the summary makes this taller than a bare radio list — on a short phone
            the Add button would otherwise sit below the fold with no way to reach it. */}
        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {synopsisLoading ? (
              <ActivityIndicator style={styles.synopsisSpinner} />
            ) : (
              synopsis !== null && (
                <Text variant="bodySmall" numberOfLines={SYNOPSIS_LINES} style={styles.synopsis}>
                  {synopsis}
                </Text>
              )
            )}
            <RadioButton.Group onValueChange={(v) => setSelected(v as AddChoice)} value={selected}>
              {ADD_STATUS_CHOICES.map((choice) => (
                <RadioButton.Item key={choice} label={addChoiceLabel(choice)} value={choice} />
              ))}
            </RadioButton.Group>
            <View style={styles.actions}>
              <Button onPress={onCancel}>Cancel</Button>
              <Button mode="contained" onPress={() => onConfirm(selected)}>
                Add
              </Button>
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
      </Dialog>
    </Portal>
  );
}

const useStyles = makeStyles((colors) => ({
  scrollArea: { maxHeight: 460, paddingHorizontal: spacing.lg },
  scrollContent: { paddingVertical: spacing.sm },
  synopsis: { color: colors.textMuted, lineHeight: 19, marginBottom: spacing.sm },
  synopsisSpinner: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
}));
