---
name: MAC Recap
description: Visual identity of the MAC Recap tool UI (not the case study templates). Dark, neutral-grey chrome on black; lime for the main calls to action and a few details, blue for secondary emphasis. shadcn/ui (new-york, neutral base) on Next.js + Tailwind; tokens below override the shadcn defaults.
status: final
created: 2026-10-08
updated: 2026-10-16
colors:
  # Surfaces: black page, neutral grey ramp sampled from imports/ui-refs. No navy anywhere in the UI.
  surface: '#000000'
  surface-raised: '#151515'
  surface-control: '#1E1E1E'
  surface-selected: '#262626'
  border: '#262626'
  border-strong: '#303030'
  # Text
  foreground-strong: '#FFFFFF'
  foreground: '#F2F2F2'
  foreground-muted: '#878787'
  # Brand (screen palette; logo files keep their own hexes, see Colors)
  primary: '#CBFF00'
  primary-foreground: '#000000'
  accent: '#007BFF'
  info: '#B2D9EF'
  danger: '#FF4D4F'
  danger-foreground: '#000000'
  focus-ring: '#CBFF00'
  # Lifecycle status hues (badge text + tint source). Labels per EXPERIENCE.md Option A.
  status-draft: '#F2F2F2'
  status-generating: '#F2F2F2'
  status-review: '#007BFF'
  status-approved: '#CBFF00'
typography:
  display:
    fontFamily: 'Inter'
    fontWeight: '500'
    note: '[ASSUMPTION] size not set; page titles only'
  heading:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '500'
  body:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '400'
  label:
    fontFamily: 'Inter'
    fontSize: 12px
    fontWeight: '400'
  badge:
    fontFamily: 'Inter'
    fontSize: 13px
    fontWeight: '400'
  button:
    fontFamily: 'Inter'
    fontSize: 14px
    fontWeight: '400'
  mono:
    fontFamily: 'JetBrains Mono'
    fontSize: 12px
    fontWeight: '400'
    note: 'IDs, pixel sizes, zoom readouts'
rounded:
  # Read off imports/ui-refs; [ASSUMPTION] exact values approximate the references.
  sm: 8px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  # Tailwind 4-based scale inherited. Named values below are the ones the references fix.
  panel-padding: 16px
  field-gap: 6px
  section-gap: 16px
  segment-inset: 3px
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    typography: '{typography.button}'
    radius: '{rounded.md}'
    note: 'Black on lime 17.8:1. Label text only, no icon.'
  button-secondary:
    background: '{colors.surface-control}'
    foreground: '{colors.foreground}'
    radius: '{rounded.md}'
  button-danger:
    background: '{colors.danger}'
    foreground: '{colors.danger-foreground}'
    radius: '{rounded.md}'
  panel:
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    padding: '{spacing.panel-padding}'
  divider:
    color: '{colors.border}'
    note: '1px full-bleed hairline between panel sections'
  field:
    background: '{colors.surface-control}'
    foreground: '{colors.foreground}'
    label: '{colors.foreground-muted}'
    radius: '{rounded.md}'
  segmented-control:
    track: '{colors.surface-control}'
    segment-selected: '{colors.surface-selected}'
    foreground-selected: '{colors.foreground}'
    foreground-unselected: '{colors.foreground-muted}'
    radius-track: '{rounded.md}'
    radius-segment: '{rounded.sm}'
    inset: '{spacing.segment-inset}'
  drop-zone:
    background: '{colors.surface-raised}'
    border: '1px dashed {colors.border-strong}'
    foreground: '{colors.foreground}'
    link: '{colors.primary}'
    radius: '{rounded.lg}'
  thumbnail-tile:
    background: '{colors.surface-control}'
    background-selected: '{colors.surface-selected}'
    radius: '{rounded.md}'
  status-badge:
    shape: 'pill, {rounded.full}, no leading dot'
    typography: '{typography.badge}'
    fill: 'status hue at ~10-16% alpha'
    border: '1px, status hue at ~25-40% alpha'
    foreground: 'status hue'
  status-badge-draft:
    fill: 'rgba(242,242,242,0.06)'
    border: 'rgba(242,242,242,0.22)'
    foreground: '{colors.status-draft}'
  status-badge-generating:
    fill: 'rgba(242,242,242,0.06)'
    border: 'rgba(242,242,242,0.22)'
    foreground: '{colors.status-generating}'
  status-badge-review:
    fill: 'rgba(0,123,255,0.16)'
    border: 'rgba(0,123,255,0.40)'
    foreground: '{colors.info}'
  status-badge-approved:
    fill: 'rgba(203,255,0,0.10)'
    border: 'rgba(203,255,0,0.28)'
    foreground: '{colors.status-approved}'
  favourite-toggle:
    shape: 'pill, {rounded.full}, star + label'
    off: 'transparent, 1px {colors.border-strong}, {colors.foreground-muted}'
    on: 'fill rgba(0,123,255,0.10), border rgba(0,123,255,0.40), star {colors.accent}, label {colors.info}'
  logo:
    file: 'imports/brand/MAC-logo.svg'
    color: '#F2F2F2 (logo palette, negative use)'
    placement: 'sidebar top'
  focus-indicator:
    color: '{colors.focus-ring}'
---

## Brand & Style

MAC Recap is an internal tool for turning a closed project's checked material into a case study. The chrome is a dark, quiet editor: black page, stacked neutral-grey panels, hairline dividers, small muted labels. Colour is rare and means something. Lime is the main call to action and a handful of details; blue carries secondary emphasis. Lime is kept scarce on purpose (2026-10-14: "too many lime elements"). The case study canvas is always the loudest thing on screen. Tool tokens never restyle template output.

The look of the panels, controls and badges is taken from third-party editor screenshots in [`imports/ui-refs/`](imports/ui-refs/). Only their visual language is adopted: shapes, density, segmented controls, spacing, dividers and grey surfaces. Their behaviour isn't adopted (card-ratio chips, duration and timeline, background restyling). EXPERIENCE.md owns behaviour.

The UI is built on shadcn/ui (new-york style, neutral base). Unlisted shadcn components inherit its defaults, re-pointed at the tokens above.

## Colors

The screen palette is deliberately separate from the logo palette. The logo SVGs in [`imports/brand/`](imports/brand/) keep their own hexes (`#DEFE56` lime, `#C0D7EB` blue-grey, `#F2F2F2` negative, `#6A8BFF` accent mark) and aren't recoloured. In the tool UI the sidebar uses the white wordmark (decided 2026-10-13).

- **Black `{colors.surface}`** is the page and the canvas surround.
- **Grey ramp** builds depth: `{colors.surface-raised}` for panels, `{colors.surface-control}` for fields, segmented tracks and tiles, `{colors.surface-selected}` for the selected segment or tile, `{colors.border}` and `{colors.border-strong}` for hairlines and dashed drop zones.
- **Lime `{colors.primary}`** is for the main calls to action (Avanti, Genera, Approva, Esporta, *Nuovo case study*), with black `{colors.primary-foreground}` text. Beyond buttons it appears only on the drop zone's *sfoglia* link, the focus ring and the *Approvato* badge. It is never a surface or a large fill, and new lime uses need a reason.
- **Blue `{colors.accent}`** is for secondary emphasis: the *Preferito* toggle when on, upload progress bars, the *Da approvare* badge and inline text links.
- **Light blue-grey `{colors.info}`** is text on blue tints (the *Da approvare* badge, the *Preferito* label), where blue text would fall below 4.5:1.
- **Text:** `{colors.foreground}` for values, selected items and body text. `{colors.foreground-strong}` for emphasis. `{colors.foreground-muted}` for labels and unselected items, deliberately lower-contrast than values.
- **Red `{colors.danger}`** is for errors and destructive actions. It takes a black label, because white on it fails contrast.
- **Navy `#002438`** is part of the brand list but **not used in the tool UI** (decided 2026-10-13).

Contrast on the grey ramp, measured against WCAG AA (4.5:1 normal text):

| Pair | Ratio | |
|---|---|---|
| `foreground-muted` on `surface-raised` / `surface-control` | 5.08 / 4.64 | passes |
| `foreground-muted` on `surface-selected` | 4.21 | fails: never place it there |
| Black on lime (primary button) / black on red | 17.84 / 6.43 | passes |
| Blue text on `surface-raised` / black | 4.59 / 5.28 | passes |
| Blue text on `surface-selected` or on a blue tint | 3.8 / 4.19 | fails: use `{colors.info}` there |

## Typography

**Inter** for the whole tool UI, **JetBrains Mono** for IDs, pixel sizes and zoom readouts. Template fonts inside the configurator are unrelated to these.

Hierarchy comes from size and colour, not weight. Labels are 12px `{colors.foreground-muted}`, values and body 14px `{colors.foreground}`. Use regular 400 for nearly everything, including button labels. Medium 500 is for headings only.

## Layout & Spacing

Tailwind's 4-based scale. Panels have 16px padding and 16px between sections. Labels sit 6px above their field, and values that belong to a label sit on the same line, right-aligned (for example "Formato … 1920 × 1080"). Sections inside a panel are separated by a full-bleed 1px divider.

## Elevation & Depth

Depth is tonal, not shadowed: each step up the grey ramp is one level. A floating toolbar is a `{colors.surface-raised}` pill over the canvas, which shows a faint dotted grid. Don't use drop shadows on panels.

## Shapes

Rounded but tight. `{rounded.sm}` for segments inside a track, `{rounded.md}` for buttons, fields and tiles, `{rounded.lg}` for panels and drop zones, and `{rounded.full}` for status badges only.

## Components

- **Primary button:** lime fill, black label at 400 weight, text only (no arrow or icon), `{rounded.md}`. `[ASSUMPTION]` Use at most one per view.
- **Secondary button:** `{colors.surface-control}` fill with `{colors.foreground}` label.
- **Panel:** `{colors.surface-raised}`, 1px `{colors.border}`, `{rounded.lg}`, sections split by dividers.
- **Field / dropdown:** `{colors.surface-control}` fill, muted label above, chevron in `{colors.foreground-muted}`.
- **Segmented control:** grey track with a 3px inset; the selected segment is `{colors.surface-selected}` with `{colors.foreground}`, unselected segments are `{colors.foreground-muted}`.
- **Thumbnail tile:** `{colors.surface-control}` tile with the caption below; selected is `{colors.surface-selected}`.
- **Drop zone:** 1px dashed `{colors.border-strong}` on `{colors.surface-raised}`, `{rounded.lg}`, centred text; the *sfoglia* link is lime and underlined; accepted types show as small mono chips with a `{colors.border-strong}` outline.
- **Favourite toggle:** a pill button with a star and the label *Preferito*. Off: transparent, 1px `{colors.border-strong}`, `{colors.foreground-muted}`. On: blue tint (`rgba(0,123,255,0.10)` fill, `rgba(0,123,255,0.40)` border), blue `{colors.accent}` star, `{colors.info}` label. Image and video rows only.
- **Logo:** the white MAC wordmark ([`imports/brand/MAC-logo.svg`](imports/brand/MAC-logo.svg), `#F2F2F2`) at the top of the sidebar, in place of the "MAC Recap" text. The wizard has no sidebar and so no logo.
- **Status badge:** a pill with a tinted fill, a tinted 1px border and text in the status hue. There is no leading dot. Reference: [`imports/ui-refs/ref-status-badges.png`](imports/ui-refs/ref-status-badges.png), recoloured.

| State | IT label | Hue |
|---|---|---|
| Draft | Bozza | off-white |
| Generating | In elaborazione | off-white |
| To review | Da approvare | blue tint, `{colors.info}` text |
| Approved | Approvato | lime |

*Bozza* and *In elaborazione* look the same and are told apart by their label.

- **Focus indicator:** 2px `{colors.focus-ring}` lime outline (17.8:1 on black, 15.5:1 on panels).
- **Selectable card** (library multi-select; [Sprint Change Proposal 2026-10-16, client intro and collections](../../sprint-change-proposal-2026-10-16-client-intro-and-collections.md)): a checkbox in the card's top-left corner. Selected cards get `{colors.surface-selected}` and a 1px `{colors.border-strong}` border. No new token.
- **Sortable list row** (client overview and collection left panes): a row with a drag handle on the left and an overflow menu with *Sposta su* / *Sposta giù* as the keyboard alternative; the focused row shows the focus indicator. No new token.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Pair every status colour with its text label | Rely on colour alone for state |
| Keep the tool chrome quieter than the case study canvas | Restyle template output with tool UI tokens |
| Use lime for main calls to action and the few listed details | Add lime elsewhere, or use it as a background or panel fill |
| Use blue for secondary emphasis (favourite, progress, *Da approvare*, links) | Put blue text on a blue tint or on `surface-selected` |
| Keep button labels text-only | Add arrows or icons to buttons unasked |
| Build depth with the grey ramp | Use navy, gradients or drop shadows on panels |
| Use black text on red and lime fills | Put white text on red, or muted grey on `surface-selected` |
| Keep logo files in their own palette | Recolour the logo to the screen palette |
