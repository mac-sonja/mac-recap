import { PRESSABLE } from "@/app/_components/button-styles";
import type { FormatId } from "@/modules/rendering";

/**
 * The configurator's shared class names (mockup `configurator.html`: `.seg`, `.btn.icon`,
 * `.eyebrow`), on the tool's tokens only.
 */

/** A segmented control's track. */
export const SEG = "inline-flex gap-0.5 rounded-md bg-surface-control p-[3px]";

/** One segment; pressed (`aria-pressed="true"`) it is raised. Inactive segments read muted. */
export const SEG_BUTTON =
  "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-3 font-label text-[13px] font-medium text-foreground-muted transition-[background-color,color] duration-150 hover:text-foreground aria-pressed:bg-surface-raised aria-pressed:text-foreground aria-pressed:shadow-control aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:text-foreground-muted";

/** A quiet icon button (hide panel, undo, redo). */
export const ICON_BUTTON = `inline-flex size-7 shrink-0 items-center justify-center rounded-full text-foreground-muted hover:bg-surface-hover hover:text-foreground aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-foreground-muted ${PRESSABLE}`;

/** A section's heading in a panel. */
export const EYEBROW =
  "mb-2.5 flex items-center justify-between gap-2 font-label text-[11.5px] font-semibold tracking-[0.06em] text-foreground-muted uppercase";

/** A panel section. */
export const PANEL_SECTION = "border-b border-border p-3.5 last:border-b-0";

/** The id of the hidden "Arriva presto" line every inactive tool points to (`aria-describedby`). */
export const SOON_ID = "configurator-soon";

/** The canvas width of a page in the editor, per format (mockup: 1280, 540 and 420 px). */
export const PAGE_WIDTH = {
  presentazione_16_9: "max-w-[1280px]",
  carosello_1_1: "max-w-[540px]",
  video_9_16: "max-w-[420px]",
} as const satisfies Record<FormatId, string>;

/** A format's shape, for thumbnails. */
export const ASPECT = {
  presentazione_16_9: "aspect-video",
  carosello_1_1: "aspect-square",
  video_9_16: "aspect-[9/16]",
} as const satisfies Record<FormatId, string>;
