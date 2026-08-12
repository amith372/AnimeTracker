---
name: AnimeTracker
description: A calm, precise personal anime watch-tracker built on real MyAnimeList data.
colors:
  primary: "#3B6EA5"
  ink: "#1E293B"
  status-watched: "#10B981"
  status-watching: "#F59E0B"
  status-plan: "#8B5CF6"
  status-dropped: "#D2493C"
  status-forgot: "#64748B"
  status-partial: "#4FA3F7"
  background: "#F8F9FA"
  surface: "#FFFFFF"
  border: "#E2E8F0"
  text-primary: "#0F172A"
  text-faint: "#94A3B8"
  hover-wash: "#EEF3F8"
  cover-placeholder: "rgba(59,110,165,.08)"
  brand-mark-start: "#FF6F61"
  brand-mark-mid: "#C58FC0"
  brand-mark-end: "#4FA3F7"
typography:
  display:
    fontFamily: "ZenKakuGothicNew_900Black"
    fontWeight: 900
  headline:
    fontFamily: "ZenKakuGothicNew_700Bold"
    fontWeight: 700
  title-font:
    fontFamily: "ZenKakuGothicNew_700Bold, ZenKakuGothicNew_500Medium"
    fontWeight: 700
  title:
    fontFamily: "PlusJakartaSans_700Bold"
    fontWeight: 700
  label:
    fontFamily: "PlusJakartaSans_600SemiBold"
    fontWeight: 600
  body:
    fontFamily: "PlusJakartaSans_400Regular"
    fontWeight: 400
  web-serif:
    fontFamily: "ShipporiMincho_700Bold, ShipporiMincho_800ExtraBold"
    fontWeight: 700
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "40px"
  chip-status-active:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  chip-status:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-faint}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  card-poster:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    width: "184px"
  input-search:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "44px"
  nav-sidebar-row-active:
    backgroundColor: "#EEF3F8"
    textColor: "{colors.text-primary}"
    rounded: "10px"
    height: "44px"
---

# Design System: AnimeTracker

## Overview

**Creative North Star: "The Watch Room"**

AnimeTracker reads like a calm, well-run control room, not a storefront: a steel-blue and slate palette, flat bordered surfaces with no drop shadows, and exactly one color per watch-status so a glance at a status dot tells you more than a sentence of copy would. Nothing here is trying to sell anything — it's a personal, non-commercial tool for a small circle of people who already have real MyAnimeList data, and the whole visual language is built to get out of the way of that data. The one deliberately warm note is the coral→pink→blue brand mark ("AT"); everywhere else, color is meaning, not decoration.

It must never look like, or read as, the official MyAnimeList app — that's a contractual constraint (see `PRODUCT.md`), not a style preference, and it shapes the palette choice as much as anything: nothing here borrows MAL's own blue/white identity.

The system runs on two visual registers from one shared token set. Native (and web under 900px) is a single-column, bottom-tab mobile app. Web at 900px and above becomes a genuine desktop layout — a fixed sidebar, poster-card grids, a two-column Series Detail — using the exact same colors, type, and component shapes, just rearranged for the wider canvas. It's one system wearing two layouts, not two systems.

**Key Characteristics:**
- Flat, bordered surfaces — depth comes from hairline borders and background/surface contrast, never shadows.
- One hue per watch-status, used nowhere else in the UI.
- Two typefaces doing distinct jobs (a third, reserved one on web only) — see Typography.
- A hard 900px layout swap on web, not a fluid responsive gradient.
- The brand-mark gradient is a signature, used exactly once (the "AT" mark) and nowhere else.

## Colors

Cool and restrained at rest — blue, slate, off-white — with color spent almost entirely on telling one of six watch-statuses apart at a glance.

### Primary
- **Control Blue** (`#3B6EA5`): the one interactive/brand color — primary buttons, active nav/filter states, links, the Series Detail hero gradient's starting stop, the "A" avatar circle.

### Neutral
- **Fog White** (`#F8F9FA`): page background, everywhere.
- **Pure White** (`#FFFFFF`): card/surface background, sits on top of Fog White.
- **Hairline Grey** (`#E2E8F0`): the one border color used for every card, chip, and input outline in the system.
- **Near-Black Ink** (`#0F172A`): primary text.
- **Faint Grey** (`#94A3B8`): secondary/faint text (counts, footnotes, timestamps).
- **Pale Grey** (`#CBD5E1`): unchecked-checkbox / disabled-adjacent strokes — visually close to Faint Grey and Hairline Grey by design; don't add a fourth near-identical grey without checking these three first.
- **Deep Ink** (`#1E293B`): a near-black navy reserved for high-contrast inverted surfaces — the selected filter chip on the mobile Library screen, and the floating toast/snackbar background on web. Not a text color.

### Status Palette
The six colors below are the system's real semantic core (`src/theme/statusColors.ts`). Each maps 1:1 to exactly one watch-status, everywhere a status renders — the Library list/grid dot, the Series Detail status pill, recommendation-card ratings badges excluded.

- **Signal Green** (`#10B981`) — Watched (complete).
- **Warm Amber** (`#F59E0B`) — Currently watching. Also used at 14% opacity (`rgba(245,158,11,.14)`) as the "new season available" badge tint.
- **Queue Violet** (`#8B5CF6`) — Plan to watch.
- **Muted Clay Red** (`#D2493C`) — Dropped. Deliberately a soft terracotta, not an alarm red — this is a personal tracker, not an error state.
- **Slate** (`#64748B`) — Watched, details forgotten. Note: this exact hex doubles as the app's default muted-text color (`textMuted`) elsewhere — an intentional reuse, not a collision, but a reason not to introduce a separate "muted grey" token.
- **Sky Blue** (`#4FA3F7`) — Watched, partial ("3/5 seasons"). Also the terminal stop of the brand-mark gradient below.

### Signature Gradient (brand mark)
- **Brand Mark Gradient** (`#FF6F61` → `#C58FC0` → `#4FA3F7`): coral → pink → sky blue. Used on the "AT" logo mark everywhere, and — on the wide-web sidebar only — as a gradient-clipped text fill on the "AnimeTracker" wordmark beside it, matching the design doc. This is the system's one warm, decorative color; its rarity outside the brand mark itself is still the point.

### Interaction Wash
- **Hover Wash** (`#EEF3F8`): a very light Control-Blue-tinted background, used for both the active-route/active-filter state and hover feedback on plain row-shaped pressables (sidebar nav rows, Library's status filter rows, wide-web status chips). Formalizes a value that was already being hand-typed in two places before the colorize pass below.
- **Cover Placeholder** (`rgba(59,110,165,.08)`): a soft Control-Blue wash standing in for a missing/loading cover image on surfaces sitting directly on Fog White/Pure White (poster tiles, grid cards, recommendation cards) — replaces a flat neutral-gray placeholder. The gradient hero banners keep their own translucent-white placeholder instead; they already sit on color.

### Named Rules
**The One Status, One Color Rule.** Each of the six status colors means exactly one watch-status, everywhere in the app. Never reuse Signal Green, Warm Amber, Queue Violet, Muted Clay Red, Slate, or Sky Blue for anything that isn't that status — including charts, badges, or one-off accents.

**The Borrowed-Blue Ban.** Never introduce a blue closer to MyAnimeList's own brand blue than Control Blue already is, and never pair blue-on-white in a way that could be mistaken for MAL's own UI chrome (contractual — see `PRODUCT.md`).

## Typography

**Display / Title Font:** Zen Kaku Gothic New (500 Medium / 700 Bold / 900 Black)
**Body Font:** Plus Jakarta Sans (400 Regular / 500 Medium / 600 SemiBold / 700 Bold)
**Web-Only Serif:** Shippori Mincho (700 Bold / 800 ExtraBold) — reserved, not general-purpose (see Named Rules).

**Character:** A blocky, confident geometric sans (Zen Kaku Gothic New) carries anime titles and screen headlines; a plainer, highly legible UI sans (Plus Jakarta Sans) carries everything else. The pairing reads as calm and functional, not editorial — nothing here is trying to look like a magazine.

### Hierarchy
- **Display** (900, Zen Kaku Gothic New): configured for the largest MD3 display-scale text; rarely invoked directly today, reserved for a rare, very large moment.
- **Headline** (700, Zen Kaku Gothic New): screen-level titles — "Library" / "Discover" / "For you" headers, the Series Detail hero title.
- **Title font** (700 Bold / 500 Medium, Zen Kaku Gothic New, via the shared `SeriesTitleText` component): every actual anime/show/season title, wherever it renders — Library rows and grid cards, Series Detail, poster tiles, recommendation cards, the entry-image popup. This is a distinct rule from Headline above; see Named Rules.
- **Title** (700 Bold / 600 SemiBold, Plus Jakarta Sans): component-level titles — list-row and card titles that are not a show's own name.
- **Label** (600 SemiBold / 500 Medium, Plus Jakarta Sans): chips, buttons, filter counts, small UI labels.
- **Body** (400 Regular, Plus Jakarta Sans): paragraph text, subtitles, descriptions, genres line.

### Named Rules
**The Title Font Rule.** Any text that names an actual anime, show, or season always renders through `SeriesTitleText` (Zen Kaku Gothic New, Bold or Medium) — never the plain body font, regardless of which screen or component it's in. This is what visually separates "what show is this" from all surrounding UI chrome.

**The Web Serif Exception.** Shippori Mincho appears in exactly three places, only on web at ≥900px: the sidebar wordmark ("AnimeTracker"), the page-level headline titles (Library / Discover / For you), and the Series Detail hero title on wide web. It never appears on native, never below the 900px breakpoint, and never substitutes for the Title Font Rule above — an anime title on the wide-web Series Detail hero still reads as a headline moment, not a `SeriesTitleText` title, so this is the one place Zen Kaku Gothic New is deliberately not used for a show's name.

## Layout

Two registers, one hard breakpoint (900px, `useIsWideWeb`), no in-between state — below it, mobile; at or above it, desktop. Native never crosses into the desktop register regardless of screen size.

**Mobile / narrow web:** single-column, edge-to-edge screens, bottom-tab navigation between Library / Discover / For you, safe-area-aware headers, horizontal-scrolling chip rows for filters, vertical lists for content. Gutters and padding follow the spacing scale (4 / 8 / 12 / 16 / 24px), with screen-edge padding typically 16px (`spacing.lg`).

**Wide web (≥900px):** a fixed 232px left sidebar (logo, wordmark, three nav rows, MAL attribution footer) sits beside the routed content, which itself often splits into its own two-column body — e.g. Library's ~200px status-filter column beside a flexible poster grid, or Series Detail's flexible entries list beside a fixed 240px status-chip column. Poster/grid cards target a ~184px column with 22px gaps (React Native has no native CSS grid, so this is approximated via flex-wrap rather than true `grid-template-columns: repeat(auto-fill, minmax(...))`).

## Elevation & Depth

Flat by design — there is no shadow vocabulary. Depth comes entirely from a single hairline border color (Hairline Grey, `#E2E8F0`) plus the Fog White / Pure White background-surface contrast. The two exceptions are both gradients, not shadows: the brand mark, and the Series Detail / Preview hero banner (Control Blue → `#4778AC`, a close-but-distinct blue that isn't its own named token today — worth promoting to a real token rather than staying a magic hex repeated across files).

React Native Paper's own components (Dialog, Snackbar) may carry a small native platform default elevation that isn't explicitly stripped — treat that as a known minor exception, not a pattern to extend.

### Named Rules
**The Borders-Not-Shadows Rule.** New surfaces get a 1px Hairline Grey border and a background/surface contrast step. They do not get a `boxShadow`/`elevation` prop set beyond a component's own untouched default.

## Shapes

Radius scale: `sm` 8px, `md` 12px, `lg` 16px, `xl` 22px, `pill` 999px (fully round). Cards and cover art lean on `lg`; search inputs and status/filter chips lean on `pill` or near it (`md`-adjacent, 10–11px, for the sidebar's nav rows). Borders are always 1px Hairline Grey; no double borders or inset strokes.

Two observed one-offs sit outside the scale: the mobile Series Detail/Preview banner's 30px bottom corners (a deliberate "big media moment" exception, larger than any token) and the wide-web `DetailHeroCard`'s 20px card radius (close to but not literally `xl`/22px — should just become `radii.xl` rather than staying its own magic number).

### Named Rules
**The Scale-First Rule.** Before hardcoding a new corner radius, check whether `sm`/`md`/`lg`/`xl`/`pill` already covers it, or extend the scale in `src/theme/colors.ts` — don't add a one-off literal.

## Components

Chosen direction: **tactile and responsive** — components should give visible feedback on interaction, not sit dead until pressed. Implemented via a shared `useHover` hook (web-only; a no-op on native touch) on every plain hand-rolled `Pressable` in the wide-web layer — sidebar nav rows, Library's grid cards and status filter rows, poster tiles, the Series Detail status chips and back-link. Row-shaped elements get the Hover Wash background; poster/grid cards (which can't take padding for a wash without shifting their exact cover-art size) get a 0.92 opacity dip instead, a precedent carried directly from the design doc. Paper-managed components (`Card`, `Button`, `Chip` used as-is) rely on Paper's own built-in state layer and are out of scope for this rule — only components this codebase built the interaction primitive for.

### Buttons
- **Shape:** fully round (`pill`, 999px).
- **Primary:** Control Blue background, white text, ~18px horizontal padding, 40px height (matches Discover's "Add" button).
- **Outlined/Ghost:** Control Blue border and text on a transparent/white background; fills solid on press or hover.

### Chips
- **Style:** `md` radius (12px, or the 10–11px near-`md` variant used in web nav/status rows), 1px Hairline Grey border, Pure White background at rest.
- **Selected/active state:** Control Blue fill, white text, border matches fill. On the mobile Library screen specifically, the selected filter chip uses Deep Ink instead of Control Blue — a deliberate one-off for that single control, not a general rule.

### Cards / Containers
- **Corner style:** `lg` (16px) for poster/cover cards; `xl`-equivalent (~20–22px) for the Series Detail hero card.
- **Background:** Pure White on Fog White.
- **Shadow strategy:** none — see Elevation & Depth.
- **Border:** 1px Hairline Grey.
- **Internal padding:** follows the spacing scale, typically `md`–`lg` (12–16px).

### Inputs / Search
- **Style:** `pill` radius, Pure White (or Fog White on the wide-web Library header) background, 1px Hairline Grey border, no drop shadow.
- **Focus:** relies on the platform's native text-input focus affordance; no custom focus ring implemented today.

### Navigation
- **Native / narrow web:** bottom tab bar, three items (Library / Discover / For you), active tab tinted Control Blue, inactive tinted Slate.
- **Wide web:** fixed left sidebar — logo mark + wordmark, three nav rows each with a small status dot (filled Control Blue when active, Pale Grey when not) and a `#EEF3F8` background wash on the active row, MAL attribution pinned to the bottom.

### The Status Dot (signature component)
The single most repeated pattern in the system: a small (7–8px) filled circle in one of the six status colors, always paired with the status's text label immediately beside it. It appears on every Library row/grid card, every Series Detail hero and status editor, and every recommendation surface that shows a tracked show's status. Any new surface that shows a show's watch-status should reuse this exact pairing rather than inventing a new status indicator.

## Do's and Don'ts

### Do:
- **Do** reserve each of the six status colors for its one meaning — never repurpose Signal Green, Warm Amber, Queue Violet, Muted Clay Red, Slate, or Sky Blue for anything else.
- **Do** render every real anime/show/season title through `SeriesTitleText` (Zen Kaku Gothic New) — see The Title Font Rule.
- **Do** keep the wide-web layout gated behind the hard 900px breakpoint (`useIsWideWeb`) rather than a fluid responsive gradient.
- **Do** use `radii.pill` for inputs and chips, `radii.lg` for cards/covers, and extend the scale in `src/theme/colors.ts` before hardcoding a new radius value (The Scale-First Rule).
- **Do** give new interactive elements visible feedback on interaction — the Hover Wash background for row-shaped pressables, a 0.92 opacity dip for poster/grid cards, Paper's built-in ripple/press-opacity on native — using the shared `useHover` hook, not a one-off implementation per component.

### Don't:
- **Don't** use the brand-mark gradient (coral → pink → sky blue) anywhere except the "AT" logo mark and, on the wide-web sidebar, its adjacent wordmark — never as a background fill, button, or decorative accent elsewhere.
- **Don't** add drop shadows or `elevation` to cards/surfaces — depth is borders and background contrast only.
- **Don't** use Shippori Mincho outside the three confirmed wide-web chrome spots, and never for an actual show/season title (see The Web Serif Exception).
- **Don't** introduce a blue closer to MyAnimeList's own brand identity than Control Blue, or otherwise make the UI read as MAL's own app — this is contractual, not a style call (see `PRODUCT.md`).
- **Don't** add a new near-duplicate grey (there are already three close neighbors — Hairline Grey, Faint Grey, Pale Grey — each with a specific job); reuse one of these before minting a fourth.
