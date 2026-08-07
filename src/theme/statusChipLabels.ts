// Short labels for status chip rows (Series Detail, the not-yet-tracked preview screen) —
// manualStatusLabel's full text ("Auto — from watched seasons") is written for a dialog list, not
// a pill that needs to stay one line.
import type { ManualStatus } from '@/domain/types';

export const MANUAL_STATUS_CHIP_LABELS: Record<ManualStatus, string> = {
  NONE: 'Auto',
  CURRENTLY_WATCHING: 'Watching',
  PLAN: 'Plan',
  DROPPED: 'Dropped',
  WATCHED_FORGOT: 'Forgot',
};
