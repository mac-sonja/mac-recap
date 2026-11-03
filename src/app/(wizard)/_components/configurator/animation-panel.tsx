"use client";

import { useId } from "react";
import { SECONDARY_ACTION } from "@/app/_components/button-styles";
import { ANIMATIONS, type AnimationElement, type AnimationId } from "@/modules/generation";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { EYEBROW, PANEL_SECTION, SEG, SEG_BUTTON, SOON_ID } from "./styles";

export interface AnimationPanelProps {
  element: AnimationElement;
  /** False on an approved case or the trial pages: the values show, the controls say they arrive soon. */
  editable: boolean;
  onType: (animation: AnimationId) => void;
  /** **Cambia animazione o media**: the Animazione dialog for this animation. */
  onChange: () => void;
  onFit: (fit: AnimationElement["fit"]) => void;
  /** The Dimensione slider moved: the size in percent (50–150). */
  onSize: (size: number) => void;
  /** The Dimensione slider let go: the slide is one undo step. */
  onSizeDone: () => void;
  onSoon: (tool: string) => void;
}

/**
 * A selected animation's settings (Story 4.5c, mockup `renderBlockProps` anim branch):
 * **Tipo**, the number of media, **Cambia animazione o media** (the dialog), then
 * **Adattamento** (Adatta or Riempi) and **Dimensione** from 50 to 150 %.
 */
export function AnimationPanel({ element, editable, onType, onChange, onFit, onSize, onSizeDone, onSoon }: AnimationPanelProps) {
  const t = it.configurator.tools.animation;
  const names = it.configurator.animationDialog.names;
  const fits = it.configurator.tools.fit;
  const typeId = useId();
  const sizeId = useId();
  const size = element.size ?? 100;
  const locked = editable ? undefined : ({ "aria-disabled": true, "aria-describedby": SOON_ID } as const);
  return (
    <section className={PANEL_SECTION} aria-label={t.heading}>
      <p className={EYEBROW}>{t.heading}</p>
      <div className="flex items-center gap-2.5">
        <label htmlFor={typeId} className="w-[84px] shrink-0 font-label text-[12.5px] text-foreground-muted">
          {t.type}
        </label>
        <select
          id={typeId}
          value={element.animation}
          disabled={!editable}
          aria-describedby={editable ? undefined : SOON_ID}
          onChange={(event) => onType(event.target.value as AnimationId)}
          className="h-8 min-w-0 flex-1 rounded-md bg-surface-control px-2 font-label text-[13px] text-foreground shadow-control disabled:opacity-60"
        >
          {ANIMATIONS.map((id) => (
            <option key={id} value={id}>
              {names[id]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex items-center gap-2.5 font-label text-[12.5px]">
        <span className="w-[84px] shrink-0 text-foreground-muted">{t.media}</span>
        <span data-animation-count className="text-foreground">
          {fill(t.mediaCount, { n: element.assetIds.length })}
        </span>
      </div>
      <button
        type="button"
        onClick={editable ? onChange : () => onSoon(t.change)}
        {...locked}
        className={cn(SECONDARY_ACTION, "mt-3 h-7 w-full text-[12.5px]", !editable && "cursor-default aria-disabled:opacity-60")}
      >
        {t.change}
      </button>

      <p className={cn(EYEBROW, "mt-4")}>{t.fit}</p>
      <div role="group" aria-label={t.fit} className={cn(SEG, "flex")}>
        {(["fit", "fill"] as const).map((fit) => (
          <button
            key={fit}
            type="button"
            aria-pressed={element.fit === fit}
            onClick={editable ? () => onFit(fit) : () => onSoon(t.fit)}
            {...locked}
            className={cn(SEG_BUTTON, "flex-1 px-1.5")}
          >
            {fits[fit]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <label htmlFor={sizeId} className="w-[84px] shrink-0 font-label text-[12.5px] text-foreground-muted">
          {t.size}
        </label>
        <input
          id={sizeId}
          type="range"
          min={50}
          max={150}
          step={5}
          value={size}
          aria-valuetext={fill(t.sizeValue, { n: size })}
          disabled={!editable}
          aria-describedby={editable ? undefined : SOON_ID}
          onChange={(event) => onSize(Number(event.target.value))}
          onPointerUp={editable ? onSizeDone : undefined}
          onKeyUp={editable ? onSizeDone : undefined}
          onBlur={editable ? onSizeDone : undefined}
          className="min-w-0 flex-1 accent-accent disabled:opacity-50"
        />
        <span aria-hidden="true" className="w-11 shrink-0 text-right font-mono text-xs text-foreground-muted">
          {fill(t.sizeValue, { n: size })}
        </span>
      </div>
    </section>
  );
}
