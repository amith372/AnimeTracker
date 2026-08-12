// Design tokens from the approved AnimeTracker design doc (claude.ai/design project
// "Anime tracker app design", turn 3 "3a" — the light-slate-body/green-ticks/soft-blue-header
// direction, which matches the base interactive prototype the doc converged on). Kept out of
// src/domain/ deliberately: that layer is pure business logic with zero presentation awareness
// (see statusLabel.ts, which is labels-only, no color) — colors are a UI concern and belong here.
export const colors = {
  primary: '#3B6EA5',
  primaryDark: '#1E293B',
  // End stop of the Series Detail/Preview hero banner's gradient (colors.primary -> this) — a
  // close-but-distinct blue from `primary`, named so it stops being a magic hex duplicated across
  // app/series/[id].tsx, app/series/preview.tsx, and src/components/web/DetailHeroCard.tsx.
  heroGradientEnd: '#4778AC',
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
  // Restrained colorize pass (impeccable `colorize`, "Calm and precise" dosage): formalizes a wash
  // that was already being hand-typed as '#EEF3F8' in a couple of places (WebSidebar's active nav
  // row, Library's active web filter row) and extends it as the one hover/press feedback color for
  // pressable rows/cards — an "action, focus, selection" role, not decoration.
  hoverWash: '#EEF3F8',
  // A soft primary-tinted wash standing in for a missing/loading cover image, replacing a flat
  // neutral-gray placeholder — same restrained-colorize pass. Only for surfaces sitting directly on
  // Fog White/Pure White; the gradient hero banners already tint their own cover placeholder
  // (rgba(255,255,255,0.15)) and are left alone.
  coverPlaceholder: 'rgba(59,110,165,0.08)',
} as const;

// The app icon's own gradient, reused as the "AT" logo mark wherever the design calls for it
// (login screen, library header).
export const logoGradient = ['#FF6F61', '#C58FC0', '#4FA3F7'] as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
