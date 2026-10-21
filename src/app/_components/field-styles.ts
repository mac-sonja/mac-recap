/**
 * A search field: a filled, borderless control with a magnifier slot on the left
 * (the caller places the icon). Focus draws the focus-ring border (globals.css).
 */
export const SEARCH_FIELD =
  "h-9 w-full rounded-full border border-transparent bg-surface-control pr-3 pl-9 font-body text-sm text-foreground transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-foreground-muted hover:bg-surface-selected focus-visible:bg-surface-raised [&::-webkit-search-cancel-button]:hidden";

/** The magnifier inside a `SEARCH_FIELD`. */
export const SEARCH_ICON = "pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-foreground-muted";

/** A white card that holds a table or a list (hairline + soft shadow, no solid border). */
export const CARD = "rounded-xl bg-surface-raised shadow-card";

/** A label at the top of a white card: small caps, muted ("01 — PROGETTO"). */
export const CARD_LABEL = "font-label text-[11px] font-semibold tracking-[0.12em] text-foreground-muted uppercase";

/** The line under a wizard step's heading. */
export const STEP_INTRO = "max-w-[60ch] font-body text-sm leading-relaxed text-foreground";

/** A table header cell. */
export const TH = "whitespace-nowrap px-4 py-3 font-label text-xs font-medium text-foreground-muted";

/**
 * A form field (input or select), everywhere (owner's mock, 2026-10-21): a grey
 * filled control with no hairline, 14 px text, 38 px tall; focus turns it white
 * with a grey hairline and a soft lime halo (globals.css).
 */
export const FIELD =
  "w-full rounded-md border border-transparent bg-field px-3.5 py-2 font-body text-sm text-foreground transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-foreground-muted aria-invalid:border-danger";

/** A long-text field: the same look as `FIELD`, taller, resizable. */
export const TEXTAREA = `${FIELD} min-h-[100px] resize-y leading-relaxed`;

/** A field's label: small, medium weight, readable on every surface. */
export const FIELD_LABEL = "font-label text-[13px] font-medium text-foreground";

/** A field's hint or counter under it. */
export const FIELD_HINT = "font-label text-xs text-foreground-muted";

/** A step's section heading inside a wizard. */
export const STEP_HEADING = "font-heading text-xl font-semibold tracking-[-0.015em] text-foreground-strong";
