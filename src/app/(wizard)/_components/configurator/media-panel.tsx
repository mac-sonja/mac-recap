"use client";

import { Film, ImageIcon } from "lucide-react";
import type { ImageElement, VideoElement } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { EYEBROW, PANEL_SECTION, SOON_ID } from "./styles";

export interface MediaPanelProps {
  element: ImageElement | VideoElement;
  /** The case's images and videos: the element's file, by id. */
  files: readonly ListedAsset[];
  /** False on an approved case or the trial pages: the file shows, the button says it arrives soon. */
  editable: boolean;
  /** **Sostituisci dai Media** / **Scegli dai Media**: shows the right panel's Media tab. */
  onOpenMedia: () => void;
  onSoon: (tool: string) => void;
}

/**
 * A selected image's or video's file (Story 4.5b, mockup `mediaPicker`): its thumbnail and
 * name ("Nessun file" when empty, or when the file is no longer listed), and **Sostituisci
 * dai Media** (**Scegli dai Media** when empty), which opens the Media tab: a click on a
 * tile there fills the selected element.
 */
export function MediaPanel({ element, files, editable, onOpenMedia, onSoon }: MediaPanelProps) {
  const t = it.configurator.tools.file;
  const id = element.assetId?.toLowerCase();
  const file = id === undefined ? undefined : files.find((f) => f.id.toLowerCase() === id);
  const heading = element.type === "video" ? t.video : it.configurator.tools.image;
  const label = element.assetId === null ? t.choose : t.replace;
  const Placeholder = element.type === "video" ? Film : ImageIcon;
  return (
    <section className={PANEL_SECTION} aria-label={heading}>
      <p className={EYEBROW}>{heading}</p>
      <div className="flex items-center gap-2.5">
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-control text-foreground-muted">
          {file?.thumbnailUrl ? (
            // A presigned GET of the thumbnail, as in the Media tab; no next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
          ) : (
            <Placeholder aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <div data-media-name className="truncate font-label text-[13px] font-medium text-foreground-strong">
            {file?.originalFileName ?? t.none}
          </div>
          <button
            type="button"
            onClick={editable ? onOpenMedia : () => onSoon(label)}
            {...(editable ? {} : { "aria-disabled": true, "aria-describedby": SOON_ID })}
            className={cn(
              "font-label text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline",
              !editable && "cursor-default aria-disabled:opacity-60",
            )}
          >
            {label}
          </button>
        </div>
      </div>
    </section>
  );
}
