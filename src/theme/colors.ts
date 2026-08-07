// Design tokens from the approved AnimeTracker design doc (claude.ai/design project
// "Anime tracker app design", turn 3 "3a" — the light-slate-body/green-ticks/soft-blue-header
// direction, which matches the base interactive prototype the doc converged on). Kept out of
// src/domain/ deliberately: that layer is pure business logic with zero presentation awareness
// (see statusLabel.ts, which is labels-only, no color) — colors are a UI concern and belong here.
export const colors = {
  primary: '#3B6EA5',
  primaryDark: '#1E293B',
  green: '#10B981',
  amber: '#F59E0B',
  violet: '#8B5CF6',
  red: '#D2493C',
  slate: '#64748B',
  blueAccent: '#4FA3F7',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  checkboxUnchecked: '#CBD5E1',
  amberTint: 'rgba(245,158,11,.14)',
} as const;

// The app icon's own gradient, reused as the "AT" logo mark wherever the design calls for it
// (login screen, library header).
export const logoGradient = ['#FF6F61', '#C58FC0', '#4FA3F7'] as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
