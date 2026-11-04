"use client";

import { Film, ImageIcon } from "lucide-react";
import { useId, useState } from "react";
import { MEDIA_FITS, type ImageElement, type MediaFit, type VideoElement } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { EYEBROW, PANEL_SECTION, SEG, SEG_BUTTON, SOON_ID } from "./styles";

export interface MediaPanelProps {
  element: ImageElement | VideoElement;
  /** The case's images and videos, then the client's (Story 4.5c-2): the element's file, by id. */
  files: readonly ListedAsset[];
  /** False on an approved case or the trial pages: the file shows, the button says it arrives soon. */
  editable: boolean;
  /** **Sostituisci dai Media** / **Scegli dai Media**: shows the right panel's Media tab. */
  onOpenMedia: () => void;
  onSoon: (tool: string) => void;
  /** An **Adattamento** button (Story 4.5b-3). */
  onFit: (fit: MediaFit) => void;
  /** The Zoom slider moved: the zoom (1–4). */
  onZoom: (zoom: number) => void;
  /** The Zoom slider let go: the gesture is one undo step. */
  onZoomDone: () => void;
}

/**
 * A selected image's or video's file (Story 4.5b, mockup `mediaPicker`): its thumbnail and
 * name ("Nessun file" when empty, "Non più nei Media" when its file is no longer listed), and **Sostituisci
 * dai Media** (**Scegli dai Media** when empty), which opens the Media tab: a click on a
 * tile there fills the selected element. Then **Adattamento** (Story 4.5b-3, mockup `#fit`):
 * Riempi, Adatta or Ritaglia; with Ritaglia, **Zoom** (100–400 %) and the hint that a drag
 * on the canvas chooses what shows.
 */
export function MediaPanel({ element, files, editable, onOpenMedia, onSoon, onFit, onZoom, onZoomDone }: MediaPanelProps) {
  const f = it.configurator.tools.fit;
  const zoomId = useId();
  const zoom = Math.round((element.crop?.zoom ?? 1) * 100);
  const locked = editable ? undefined : ({ "aria-disabled": true, "aria-describedby": SOON_ID } as const);
  const t = it.configurator.tools.file;
  const id = element.assetId?.toLowerCase();
  const file = id === undefined ? undefined : files.find((f) => f.id.toLowerCase() === id);
  const heading = element.type === "video" ? t.video : it.configurator.tools.image;
  const label = element.assetId === null ? t.choose : t.replace;
  const Placeholder = element.type === "video" ? Film : ImageIcon;
  // An expired or broken thumbnail URL falls back to the type icon (as the Media tab).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumbnail = file?.thumbnailUrl != null && file.thumbnailUrl !== brokenUrl ? file.thumbnailUrl : null;
  const name = file?.originalFileName ?? (element.assetId === null ? t.none : t.gone);
  return (
    <section className={PANEL_SECTION} aria-label={heading}>
      <p className={EYEBROW}>{heading}</p>
      <div className="flex items-center gap-2.5">
        <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-control text-foreground-muted">
          {thumbnail !== null ? (
            // A presigned GET of the thumbnail, as in the Media tab; no next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt="" onError={() => setBrokenUrl(thumbnail)} className="absolute inset-0 size-full object-cover" />
          ) : (
            <Placeholder aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <div data-media-name className="truncate font-label text-[13px] font-medium text-foreground-strong">
            {name}
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
      <p className={cn(EYEBROW, "mt-4")}>{f.heading}</p>
      <div role="group" aria-label={f.heading} className={cn(SEG, "flex")}>
        {MEDIA_FITS.map((fit) => (
          <button
            key={fit}
            type="button"
            aria-pressed={element.fit === fit}
            onClick={editable ? () => onFit(fit) : () => onSoon(f.heading)}
            {...locked}
            className={cn(SEG_BUTTON, "flex-1 px-1.5")}
          >
            {f[fit]}
          </button>
        ))}
      </div>
      {element.fit === "crop" && (
        <>
          <div className="mt-3 flex items-center gap-2.5">
            <label htmlFor={zoomId} className="w-12 shrink-0 font-label text-[12.5px] text-foreground-muted">
              {f.zoom}
            </label>
            <input
              id={zoomId}
              type="range"
              min={100}
              max={400}
              step={5}
              value={zoom}
              aria-valuetext={fill(f.zoomValue, { n: zoom })}
              // Not editable: it can't move (the fit buttons above say why when pressed).
              disabled={!editable}
              aria-describedby={editable ? undefined : SOON_ID}
              onChange={(event) => onZoom(Number(event.target.value) / 100)}
              onPointerUp={editable ? onZoomDone : undefined}
              onKeyUp={editable ? onZoomDone : undefined}
              onBlur={editable ? onZoomDone : undefined}
              className="min-w-0 flex-1 accent-accent disabled:opacity-50"
            />
            <span aria-hidden="true" className="w-11 shrink-0 text-right font-mono text-xs text-foreground-muted">
              {fill(f.zoomValue, { n: zoom })}
            </span>
          </div>
          <p className="mt-2 font-label text-[12px] text-foreground-muted">{f.cropHint}</p>
        </>
      )}
    </section>
  );
}
