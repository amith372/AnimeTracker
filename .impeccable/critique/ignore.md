# Critique ignore list

Findings matching the entries below are dropped silently by `$impeccable critique`. This file is
the only prior-run input a critique reads.

## WCAG / assistive-technology conformance — out of scope, decided 2026-10-14

AnimeTracker is a private, strictly non-commercial app used by the developer and a small circle of
people they know (see PRODUCT.md's Users and Accessibility & Inclusion sections). Formal
accessibility conformance is a deliberate non-goal, not an unknown. These were measured, priced,
and declined — re-raising them each run costs a review slot that a real defect should get.

Ignore:

- **Text contrast below WCAG AA (4.5:1) or AAA.** Includes `textFaint` (`#857868`, measured 3.80:1
  on Warm Paper), the status-hue-on-own-tint badges (amber "New season!" 1.74:1, `AiringBadge`
  green 2.27:1, amber rating badge 1.93:1), `heroMutedText` on the hero gradient (3.53–4.05:1),
  and white text on the brand-mark gradient (2.35–2.73:1). DESIGN.md records the real figures.
- **Non-text / UI-component contrast below 3:1** (WCAG 1.4.11). Includes the unchecked
  `SquareCheckbox` border (`checkboxUnchecked` `#D3C7B6`, 1.66:1) and the status dots.
- **Missing `accessibilityRole="header"`** and the absence of a heading structure on web.
- **Orphaned or invalid ARIA role nesting** — `menuitem` without a `menu` parent, `tab` without
  `tablist`, `radio` without `radiogroup`.
- **No focus-visible styling / no keyboard-only navigation path** on the wide-web layer, and
  sidebar nav rows being `Pressable` with `accessibilityRole="link"` rather than real anchors.
- **Font-scale clipping above ~1.3×** — the two deliberate `maxFontSizeMultiplier` caps, and fixed
  `webCard` / chip-row heights that clip rather than grow.
- **Missing `accessibilityLabel` on decorative or nested elements** — cover-art `<Image>` nested
  inside a parent that already carries a label, and `AtLogoMark`.

## Deliberately NOT ignored

Called out so the scope above isn't read wider than it is. Each of these reads as an
accessibility finding but fails for every user, so it stays in review:

- **Touch targets under 44pt / 48dp.** A ~32dp status chip is a mis-tap for an average thumb, not
  only an assistive-technology concern — and `app/series/[id].tsx` already carries a comment
  claiming this was fixed to 44 while the `minHeight` sits on the parent `ScrollView` instead of
  the chip. That gap between comment and code is a correctness problem.
- **`accessibilityLabel` missing on icon-only controls** (6 unlabeled `IconButton`s, including two
  `dots-vertical` overflow menus and two `arrow-left` backs). An unlabeled glyph with no text is
  undiscoverable to a sighted first-timer too — it is a copy/affordance problem that happens to
  also be an a11y one.
- **`onPrimary` hardcoded `#FFFFFF` across both themes** (`src/theme/theme.ts`), giving 2.54:1
  white-on-`#7BA6D6` for every filled button and active chip in dark mode. This is plain
  illegibility in the mainline, not a conformance target.
