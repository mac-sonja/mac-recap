"use client";

import { Film, ImageIcon } from "lucide-react";
import { useState } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { ANIMATIONS, type AnimationElement, type AnimationId, type Page } from "@/modules/generation";
import type { ListedAsset } from "@/modules/material";
import { renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { BACKGROUND_SWATCHES, MAX_ANIMATION_MEDIA, type AnimationChoice } from "./page-editing";
import { ASPECT, EYEBROW } from "./styles";

const copy = it.configurator.animationDialog;

/** A one-block page holding only `el`: what an animation looks like in this format, drawn by the renderer. */
function previewPage(el: AnimationElement): Page {
  return {
    pageKey: "preview",
    name: copy.title,
    role: "body",
    section: "output",
    // The template's page white (a template value).
    background: { kind: "colour", value: BACKGROUND_SWATCHES[0] },
    grid: { layoutId: "column", rows: [1], cols: [1] },
    blocks: [{ blockId: "0000a17e-0000-4000-8000-0000000000b1", name: copy.title, background: { kind: "transparent" }, elements: [el] }],
  };
}

export interface AnimationDialogProps {
  open: boolean;
  formatId: FormatId;
  template: string;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** The case's images and videos, oldest first, then the client's (Story 4.5c-2): what can go in. */
  files: readonly ListedAsset[];
  /** The animation being changed (**Salva**; its fit and size shape the previews), or null for a new one (**Inserisci**). */
  initial: (AnimationChoice & Pick<AnimationElement, "fit" | "size">) | null;
  onSubmit: (choice: AnimationChoice) => void;
  onClose: () => void;
}

/**
 * The "Animazione" dialog (Story 4.5c, C35, mockup `openAnim`/`drawAnim`): Carousel 01, 03,
 * 04 and Wheel 02, each previewed with the chosen media by the shared renderer; the case's
 * images and videos picked in order (numbered; a second click takes one out). **Inserisci**
 * (a new animation) or **Salva** (an existing one) stays disabled until a file is chosen.
 * Each opening starts from `initial`; Annulla or Esc changes nothing.
 */
export function AnimationDialog(props: AnimationDialogProps) {
  // Mounted only while open, so the choice starts afresh at each opening.
  return props.open ? <OpenAnimationDialog {...props} /> : null;
}

function OpenAnimationDialog({ formatId, template, assets, values, files, initial, onSubmit, onClose }: AnimationDialogProps) {
  const media = files.filter((file) => file.kind === "image" || file.kind === "video");
  const [animation, setAnimation] = useState<AnimationId>(initial?.animation ?? ANIMATIONS[0]);
  // Only files the picker shows, once each: one no longer listed could not be taken out.
  const [picked, setPicked] = useState<readonly string[]>(() => [...new Set(initial?.assetIds ?? [])].filter((id) => media.some((f) => f.id === id)));
  const full = picked.length >= MAX_ANIMATION_MEDIA;
  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= MAX_ANIMATION_MEDIA ? current : [...current, id]));
  const action = initial === null ? copy.insert : copy.save;
  const ready = picked.length > 0;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={copy.title}
      description={copy.lead}
      actions={
        <>
          <button type="button" onClick={onClose} className={cn(SECONDARY_ACTION, "h-9 px-4")}>
            {copy.cancel}
          </button>
          <button
            type="button"
            disabled={!ready}
            title={ready ? undefined : copy.needMedia}
            onClick={() => onSubmit({ animation, assetIds: picked })}
            className={cn(PRIMARY_ACTION, "disabled:cursor-not-allowed disabled:opacity-50")}
          >
            {action}
          </button>
        </>
      }
    >
      <div role="group" aria-label={it.configurator.tools.animation.type} className="grid grid-cols-4 gap-2">
        {ANIMATIONS.map((id) => (
          <button
            key={id}
            type="button"
            data-animation-option={id}
            aria-pressed={animation === id}
            onClick={() => setAnimation(id)}
            className="flex min-w-0 flex-col gap-1.5 rounded-lg p-1.5 text-left font-label text-[12.5px] font-medium text-foreground transition-colors duration-150 hover:bg-surface-hover aria-pressed:bg-surface-selected aria-pressed:outline-2 aria-pressed:outline-accent"
          >
            <span aria-hidden="true" className={cn("pointer-events-none block w-full overflow-hidden rounded-md bg-surface-raised shadow-card", ASPECT[formatId])}>
              {renderFormat(template, formatId, {
                pages: [
                  previewPage({
                    elementId: "0000a17e-0000-4000-8000-0000000000e1",
                    type: "animation",
                    animation: id,
                    assetIds: [...picked],
                    fit: initial?.fit ?? "fit",
                    ...(initial?.size === undefined ? {} : { size: initial.size }),
                  }),
                ],
                assets,
                values,
                options: { startPage: 1 },
              })}
            </span>
            {copy.names[id]}
          </button>
        ))}
      </div>

      <p className={cn(EYEBROW, "mt-5")}>
        {copy.fromMedia}
        {picked.length > 0 && (
          <span className="font-label text-[11px] font-medium tracking-normal text-foreground-muted normal-case">
            {picked.length === 1 ? copy.chosenOne : fill(copy.chosenMany, { n: picked.length })}
          </span>
        )}
      </p>
      {media.length === 0 ? (
        <p className="font-label text-[12.5px] text-foreground-muted">{copy.noMedia}</p>
      ) : (
        <div role="group" aria-label={copy.fromMedia} className="grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto p-0.5">
          {media.map((file) => {
            const at = picked.indexOf(file.id);
            return (
              <button
                key={file.id}
                type="button"
                data-pick={file.id}
                aria-pressed={at >= 0}
                // At the limit only a chosen file can still be clicked (to take it out).
                disabled={full && at < 0}
                aria-label={at >= 0 ? fill(copy.picked, { name: file.originalFileName, n: at + 1 }) : file.originalFileName}
                title={file.originalFileName}
                onClick={() => toggle(file.id)}
                className="relative grid aspect-square place-items-center overflow-hidden rounded-md bg-surface-control text-foreground-muted shadow-control aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                {file.thumbnailUrl !== null ? (
                  // A presigned GET of the thumbnail, as in the Media tab; no next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={file.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : file.kind === "video" ? (
                  <Film aria-hidden="true" className="size-4" />
                ) : (
                  <ImageIcon aria-hidden="true" className="size-4" />
                )}
                {file.kind === "video" && file.thumbnailUrl !== null && (
                  <span aria-hidden="true" className="absolute bottom-1 left-1 rounded-[4px] bg-scrim/60 px-1 font-mono text-[10px] text-surface-inverse-foreground">
                    ▶
                  </span>
                )}
                {at >= 0 && (
                  <b aria-hidden="true" className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-accent font-label text-[11px] text-accent-foreground">
                    {at + 1}
                  </b>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
