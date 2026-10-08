---
name: MAC Recap
description: Visual identity of the MAC Recap tool UI (not the case study templates). Skeleton only — token names fixed, values deferred until MAC UI brand guidelines exist.
status: final
created: 2026-10-08
updated: 2026-10-08
colors:
  # Values deferred. Names are the contract EXPERIENCE.md references.
  surface: TBD
  surface-raised: TBD
  foreground: TBD
  foreground-muted: TBD
  border: TBD
  primary: TBD
  primary-foreground: TBD
  focus-ring: TBD
  danger: TBD
  status-draft: TBD
  status-generating: TBD
  status-review: TBD
  status-approved: TBD
typography:
  display: { fontFamily: TBD }
  heading: { fontFamily: TBD }
  body: { fontFamily: TBD }
  label: { fontFamily: TBD }
  mono: { fontFamily: TBD, note: 'IDs, pixel sizes, zoom readouts' }
rounded:
  sm: TBD
  md: TBD
  full: 9999px
spacing:
  # Scale deferred.
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
  status-badge:
    note: 'Colour per state from {colors.status-*}; always paired with a text label'
  focus-indicator:
    color: '{colors.focus-ring}'
---

## Brand & Style

**Deferred.** No MAC UI brand guidelines exist yet (decision logged 2026-10-08). This file fixes token *names* so EXPERIENCE.md can reference them; values are filled in through Update mode when the guidelines arrive.

Known constraints that any future identity must respect:

- The tool UI and the case study templates are separate systems. The tool chrome must stay quiet enough that the case study canvas is the loudest thing on screen in the configurator and case study view.
- The A3 sketches' dark navy (~#0E1019) and acid-lime (~#E0F56E) look is recorded as an observation only, **not adopted**.

## Colors

Deferred. Required roles: surfaces, text, border, one primary action colour, focus ring, danger, and four lifecycle status colours (`status-draft`, `status-generating`, `status-review`, `status-approved`; names follow the option chosen for PRD open point 8). Status colours must be distinguishable from each other and must never be the only signal.

## Typography

Deferred. Required roles: display, heading, body, label, and a monospace role for IDs and dimensions. The tool UI's fonts are independent of the font pairings offered inside the configurator for templates.

## Components

Deferred. Components whose visuals EXPERIENCE.md depends on: primary button, status badge, focus indicator, deliverable row, format list item, claim-check list item, case study card, toast, dialog.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Pair every status colour with its text label | Rely on colour alone for state |
| Keep the tool chrome visually quieter than the case study canvas | Restyle template output with tool UI tokens |
