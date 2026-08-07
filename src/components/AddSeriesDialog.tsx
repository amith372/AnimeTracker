// Shared "Add <series>" status-picker dialog — used by Discover (Phase 4) and Recommendations
// (Phase 6), both of which need the user to pick a manual status before a prospective series is
// written to the library. Not WATCHED/NONE: those are derived states the user reaches by marking
// individual seasons, not a status they'd deliberately pick when first adding a show.
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Dialog, Portal, RadioButton } from 'react-native-paper';
import { MANUAL_STATUS_CHOICES, manualStatusLabel } from '@/domain/statusLabel';
import type { ManualStatus } from '@/domain/types';
import type { ReconcileSeries } from '@/domain/reconcileSeries';

export function AddSeriesDialog({
  series,
  onConfirm,
  onCancel,
}: {
  series: ReconcileSeries | null;
  onConfirm: (status: ManualStatus) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ManualStatus>('PLAN');

  // This component stays mounted while `series` toggles between null and a show, so without an
  // explicit reset the radio keeps whatever was chosen last time: add one show as Dropped and the
  // next Add dialog opens pre-set to Dropped. Plan-to-watch is the right default for a show you're
  // adding rather than one you're editing. (Same fix the Detail screen's status editor already
  // carries — it just never made it across to this dialog.)
  useEffect(() => {
    if (series !== null) setSelected('PLAN');
  }, [series]);

  return (
    <Portal>
      <Dialog visible={series !== null} onDismiss={onCancel}>
        <Dialog.Title>Add "{series?.title}"</Dialog.Title>
        <Dialog.Content>
          <View>
            <RadioButton.Group onValueChange={(v) => setSelected(v as ManualStatus)} value={selected}>
              {MANUAL_STATUS_CHOICES.map((status) => (
                <RadioButton.Item key={status} label={manualStatusLabel(status)} value={status} />
              ))}
            </RadioButton.Group>
            <View style={styles.actions}>
              <Button onPress={onCancel}>Cancel</Button>
              <Button mode="contained" onPress={() => onConfirm(selected)}>
                Add
              </Button>
            </View>
          </View>
        </Dialog.Content>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
