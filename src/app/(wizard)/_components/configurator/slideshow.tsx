"use client";

import type { ReactNode } from "react";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { SLIDE_WIDTH } from "./styles";

export interface SlideshowProps {
  formatId: keyof typeof SLIDE_WIDTH;
  /** The page shown, 0-based. */
  index: number;
  count: number;
  /** The shown page's name, for the caption. */
  name: string;
  /** The shown page's key: a new page enters with a short fade. */
  pageKey: string;
  onStep: (delta: -1 | 1) => void;
  /** Reduced motion: the pages switch without a transition. */
  still: boolean;
  /** The rendered page, and anything drawn over it. */
  children: ReactNode;
}

/** The round ‹ › button (also the approved case page's pager). */
export const NAV =
  "grid size-[52px] shrink-0 place-items-center rounded-full bg-foreground-strong font-label text-[26px] leading-none text-surface shadow-popover transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-accent-foreground active:scale-[0.97] aria-disabled:cursor-default aria-disabled:bg-surface-control aria-disabled:text-foreground-muted aria-disabled:shadow-none aria-disabled:hover:bg-surface-control aria-disabled:hover:text-foreground-muted aria-disabled:active:scale-100";

/**
 * Anteprima of Carosello and Video (C37, mockup `.social`): one page at a time, as big
 * as the screen allows, as on social. ‹ › step through the pages (disabled at the ends),
 * the dots and "{i} di {n} · {name}" say where you are; the arrow keys are the
 * configurator's.
 */
export function Slideshow({ formatId, index, count, name, pageKey, onStep, still, children }: SlideshowProps) {
  // `aria-disabled`, not `disabled`: the button keeps focus when it reaches an end.
  const atStart = index <= 0;
  const atEnd = index >= count - 1;
  return (
    <div data-slideshow="" className="mt-2 flex w-full flex-col items-center gap-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label={it.configurator.preview.previous}
          aria-keyshortcuts="ArrowLeft"
          aria-disabled={atStart}
          onClick={() => !atStart && onStep(-1)}
          className={NAV}
        >
          <span aria-hidden="true">‹</span>
        </button>
        <div key={pageKey} data-slide={pageKey} className={cn("relative shrink-0 shadow-page", SLIDE_WIDTH[formatId], !still && "animate-enter")}>
          {children}
        </div>
        <button
          type="button"
          aria-label={it.configurator.preview.next}
          aria-keyshortcuts="ArrowRight"
          aria-disabled={atEnd}
          onClick={() => !atEnd && onStep(1)}
          className={NAV}
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <i key={i} data-on={i === index ? "" : undefined} className="size-[7px] rounded-full bg-border-strong data-on:bg-accent" />
        ))}
      </div>
      <p aria-live="polite" className="font-label text-[12.5px] text-foreground-muted">
        {fill(it.configurator.preview.slide, { i: index + 1, n: count, name })}
      </p>
    </div>
  );
}
