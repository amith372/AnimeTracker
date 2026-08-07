// Maps a series' derived/manual status to the dot/checkmark color the design doc uses to convey
// status at a glance (Library row dots, Series Detail's status pill). Status was previously
// text-only — see statusLabel.ts, which this file deliberately mirrors the shape of (one pure
// function per status kind) rather than adding color into the domain layer itself.
import type { SeriesStatus } from '@/domain/seriesStatus';
import { colors } from './colors';

export function statusDotColor(kind: SeriesStatus['kind']): string {
  switch (kind) {
    case 'CURRENTLY_WATCHING':
      return colors.amber;
    case 'PLAN':
      return colors.violet;
    case 'DROPPED':
      return colors.red;
    case 'WATCHED_FORGOT':
      return colors.slate;
    case 'WATCHED':
      return colors.green;
    case 'WATCHED_PARTIAL':
      return colors.blueAccent;
  }
}
