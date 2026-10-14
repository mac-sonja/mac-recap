/**
 * Class names for the main call to action (DESIGN.md primary button): lime fill,
 * black label at 400 weight, `rounded-md`. Shared by links and buttons.
 */
export const PRIMARY_ACTION =
  "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-label text-sm text-primary-foreground hover:opacity-90";

/**
 * Added to a primary button that can be inactive: with `aria-disabled="true"` it
 * reads as a control-grey button with a muted label and no hover change.
 */
export const PRIMARY_ACTION_INACTIVE =
  "aria-disabled:bg-surface-control aria-disabled:text-foreground-muted aria-disabled:hover:opacity-100";
