/**
 * Press feedback shared by every button-like control (emilkowalski/skills): a
 * subtle scale on `:active` and short transitions on the exact properties that
 * change, never `transition: all`.
 */
export const PRESSABLE =
  "transition-[transform,background-color,color,box-shadow,opacity] duration-150 ease-out active:scale-[0.97] aria-disabled:active:scale-100";

/**
 * A small grey pill for a row-level action (**Scarica**, an Approvato row's **Modifica**).
 * Add `PRESSABLE` for the press feedback.
 */
export const ROW_PILL =
  "inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-control px-3 font-label text-[13px] font-medium whitespace-nowrap text-foreground hover:bg-surface-selected";

/**
 * Class names for the main call to action (DESIGN.md primary button): lime fill,
 * black label, `rounded-full`. Shared by links and buttons.
 */
export const PRIMARY_ACTION = `inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-4 font-label text-sm font-semibold text-primary-foreground shadow-primary hover:bg-primary-hover ${PRESSABLE}`;

/**
 * Added to a primary button that can be inactive: with `aria-disabled="true"` it
 * reads as a control-grey button with a muted label and no hover change.
 */
export const PRIMARY_ACTION_INACTIVE =
  "aria-disabled:bg-surface-control aria-disabled:text-foreground-muted aria-disabled:shadow-none aria-disabled:hover:bg-surface-control";

/** A quiet action next to the primary one: a raised surface with a hairline. */
export const SECONDARY_ACTION = `inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-surface-raised px-4 font-label text-sm font-medium text-foreground shadow-control hover:bg-surface-hover ${PRESSABLE}`;

/**
 * Class names for a destructive action (**Elimina cliente**, **Elimina**): deep red fill
 * (`--color-danger-strong`) with a white label (owner, 2026-10-20). Like the primary
 * button, it reads as inactive with `aria-disabled="true"`.
 */
export const DANGER_ACTION = `inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-danger-strong px-4 font-label text-sm font-semibold text-danger-strong-foreground hover:opacity-90 aria-disabled:bg-surface-control aria-disabled:text-foreground-muted aria-disabled:hover:opacity-100 ${PRESSABLE}`;
