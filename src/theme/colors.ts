// Design tokens from the approved AnimeTracker design doc (claude.ai/design project
// "Anime tracker app design", turn 3 "3a" — the light-slate-body/green-ticks/soft-blue-header
// direction, which matches the base interactive prototype the doc converged on). Kept out of
// src/domain/ deliberately: that layer is pure business logic with zero presentation awareness
// (see statusLabel.ts, which is labels-only, no color) — colors are a UI concern and belong here.
// ─────────────────────────────────────────────────────────────────────────────
// EXPERIMENT — the "warm register". One commit, meant to be judged and then kept
// or reverted wholesale. Nothing else in the app is aware this happened: every
// screen reads these same token names, which is what lets a palette swap reach
// the whole app at once and leave in one `git revert`.
//
// What changed, and what deliberately did not:
//   - The NEUTRALS warmed and deepened. Cool slate/fog (#F8F9FA, #0F172A) became
//     warm paper and warm ink. This is where the whole "warmer" reading comes
//     from, and it costs nothing semantically because neutrals carry no meaning.
//   - `primary` and all six STATUS colors are byte-identical. The status hues are
//     the system's semantic core (One Status, One Color) and re-tinting them
//     would change what the app *says*, not how it looks. Control Blue is also
//     the safe side of the Borrowed-Blue Ban — warming it would drift toward
//     MyAnimeList's own navy, which is contractual, not taste (guardrail #4).
//   - `textMuted` is no longer the same hex as `slate`. DESIGN.md notes those
//     doubled deliberately; in a warm register a cool slate body text is exactly
//     what reads "unfinished", so they part company here. Slate-the-status keeps
//     its value.
//
// Side effect worth keeping either way: textFaint went from #94A3B8 (~2.5:1 on
// the page background, failing AA) to a warm grey that clears 4.5:1.
// ─────────────────────────────────────────────────────────────────────────────
export const colors = {
  primary: '#3B6EA5',
  primaryDark: '#26201B',
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
  // Warm paper, not fog white — the single most load-bearing value in the swap.
  background: '#F5F1EA',
  // Cards stay pure white: on a warm ground it reads as a lit surface rather than
  // another shade of the same beige, and it's what gives the new shadows something
  // to lift off.
  surface: '#FFFFFF',
  border: '#E6DDCF',
  textPrimary: '#1F1A16',
  textMuted: '#6E6259',
  textFaint: '#857868',
  checkboxUnchecked: '#D3C7B6',
  amberTint: 'rgba(245,158,11,.14)',
  // Restrained colorize pass (impeccable `colorize`, "Calm and precise" dosage): formalizes a wash
  // that was already being hand-typed as '#EEF3F8' in a couple of places (WebSidebar's active nav
  // row, Library's active web filter row) and extends it as the one hover/press feedback color for
  // pressable rows/cards — an "action, focus, selection" role, not decoration.
  // Stays primary-tinted rather than going warm-neutral: this wash marks *selection*, and a
  // selected row that reads as "slightly beiger beige" stops communicating anything. Rebalanced
  // toward the warm ground so it doesn't sit on the page like a cold patch.
  hoverWash: '#E9EDF3',
  // A soft primary-tinted wash standing in for a missing/loading cover image, replacing a flat
  // neutral-gray placeholder — same restrained-colorize pass. Only for surfaces sitting directly on
  // Fog White/Pure White; the gradient hero banners already tint their own cover placeholder
  // (rgba(255,255,255,0.15)) and are left alone.
  coverPlaceholder: 'rgba(87,66,45,0.08)',
} as const;

/**
 * EXPERIMENT — axis 2. A real depth scale, replacing the borders-only system.
 *
 * Every step carries a vertical offset and a soft blur: light comes from above, so a shadow falls
 * below. A zero-offset shadow is a glow, which is decoration pretending to be depth.
 *
 * The shadow colour is warm near-black, not pure black. Grey shadows on a warm ground read as dirt;
 * tinting the shadow toward the surface it falls on is what keeps depth looking like light rather
 * than smudge.
 *
 * `elevation` rides along for Android, where iOS/web shadow props are ignored outright.
 */
export const shadows = {
  /** Resting surfaces that should separate from the page without announcing themselves. */
  sm: {
    shadowColor: '#3A2A1C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  /** Cards you can pick up — poster cards, list rows, the searchbar. */
  md: {
    shadowColor: '#3A2A1C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
  },
  /** The one or two things per screen that sit above everything else. */
  lg: {
    shadowColor: '#3A2A1C',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 34,
    elevation: 14,
  },
} as const;

// The app icon's own gradient, reused as the "AT" logo mark wherever the design calls for it
// (login screen, library header).
export const logoGradient = ['#FF6F61', '#C58FC0', '#4FA3F7'] as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
