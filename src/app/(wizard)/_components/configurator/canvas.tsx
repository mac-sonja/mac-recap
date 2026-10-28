"use client";

import { memo, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { Page } from "@/modules/generation";
import { renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { selectionAt, type Selection } from "./selection";
import { PAGE_WIDTH } from "./styles";

export interface CanvasProps {
  formatId: FormatId;
  template: string;
  pages: readonly Page[];
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** The page nearest the middle of the canvas changed (the page tools act on it when nothing is selected). */
  onPageInView: (pageKey: string) => void;
  /** The *Bozza di prova* note: a case with no revision yet. */
  trial: boolean;
  /** The scrolling canvas, for the configurator to scroll a page into view. */
  scrollRef: RefObject<HTMLElement | null>;
}

/** A frame's box in its page, in px. */
interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const boxIn = (host: HTMLElement, target: Element): Box => {
  const outer = host.getBoundingClientRect();
  const inner = target.getBoundingClientRect();
  return { top: inner.top - outer.top, left: inner.left - outer.left, width: inner.width, height: inner.height };
};

/** One page drawn by the format's renderer (Story 3.5). Memoised: a selection change never redraws it. */
const RenderedPage = memo(function RenderedPage({
  formatId,
  template,
  page,
  number,
  assets,
  values,
}: {
  formatId: FormatId;
  template: string;
  page: Page;
  number: number;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
}) {
  return renderFormat(template, formatId, { pages: [page], assets, values, options: { startPage: number } });
});

/**
 * A page on the canvas with its selection frames: the selected block framed, with the
 * "⠿ Sposta" handle when the block itself is selected; a selected element outlined and
 * its block framed. The frames are measured from the rendered page, so the template's
 * markup stays the renderer's alone.
 */
function CanvasPage({
  formatId,
  template,
  page,
  number,
  assets,
  values,
  selection,
  onSelect,
}: Omit<CanvasProps, "pages" | "onPageInView" | "trial" | "scrollRef" | "selection"> & { page: Page; number: number; selection: Selection }) {
  const host = useRef<HTMLDivElement>(null);
  const mine = selection !== null && selection.pageKey === page.pageKey ? selection : null;
  const blockId = mine?.blockId;
  const elementId = mine?.elementId;
  const [frames, setFrames] = useState<{ block: Box | null; element: Box | null }>({ block: null, element: null });

  useLayoutEffect(() => {
    const el = host.current;
    if (el === null) return;
    const block = blockId === undefined ? null : el.querySelector(`[data-block-id="${blockId}"]`);
    const element = elementId === undefined || block === null ? null : block.querySelector(`[data-element-id="${elementId}"]`);
    const measure = () => setFrames({ block: block === null ? null : boxIn(el, block), element: element === null ? null : boxIn(el, element) });
    measure();
    if (block === null || typeof ResizeObserver === "undefined") return;
    // The page, and the selected block and element themselves: they can reflow in a page of the same size.
    const observer = new ResizeObserver(measure);
    for (const node of [el, block, element]) if (node !== null) observer.observe(node);
    return () => observer.disconnect();
  }, [blockId, elementId, page, formatId]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    onSelect(selectionAt(event.target as Element, page.pageKey));
  }

  const pageSelected = mine !== null && blockId === undefined;
  return (
    <>
      <div className={cn("mt-3.5 flex w-full items-center font-label text-[12.5px] text-foreground-muted", PAGE_WIDTH[formatId])}>
        <span className="truncate">{fill(it.configurator.canvas.pageLabel, { n: number, name: page.name })}</span>
      </div>
      <div
        ref={host}
        id={`page-${page.pageKey}`}
        data-canvas-page={page.pageKey}
        data-selected={pageSelected ? "" : undefined}
        onClick={onClick}
        className={cn(
          "relative w-full shrink-0 cursor-pointer shadow-page transition-shadow duration-150 data-selected:ring-2 data-selected:ring-accent",
          PAGE_WIDTH[formatId],
        )}
      >
        <RenderedPage formatId={formatId} template={template} page={page} number={number} assets={assets} values={values} />
        {frames.block !== null && (
          <div
            aria-hidden="true"
            data-frame="block"
            className="pointer-events-none absolute z-10 rounded-lg border-2 border-accent"
            style={{ top: frames.block.top - 2, left: frames.block.left - 2, width: frames.block.width + 4, height: frames.block.height + 4 }}
          >
            {elementId === undefined && (
              <span className="absolute -top-[11px] left-1/2 inline-flex h-[22px] -translate-x-1/2 items-center rounded-full bg-accent px-2.5 font-label text-[11.5px] leading-none font-semibold whitespace-nowrap text-accent-foreground shadow-control">
                {it.configurator.canvas.move}
              </span>
            )}
          </div>
        )}
        {frames.element !== null && (
          <div
            aria-hidden="true"
            data-frame="element"
            className="pointer-events-none absolute z-10 rounded-sm outline-2 outline-accent"
            style={{ top: frames.element.top, left: frames.element.left, width: frames.element.width, height: frames.element.height }}
          />
        )}
      </div>
    </>
  );
}

/**
 * The canvas (mockup `.canvas`): the format's pages one under the other, grouped under
 * Intro, Output and Risultati and labelled "{n} · {name}", each drawn by the shared
 * renderer at the format's editor width. A click selects the element, block or page
 * under the pointer. It reports the page nearest its middle as the page in view.
 */
export function Canvas({ formatId, template, pages, assets, values, selection, onSelect, onPageInView, trial, scrollRef }: CanvasProps) {
  const frame = useRef<number | null>(null);

  function onScroll() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = scrollRef.current;
      if (el === null) return;
      const box = el.getBoundingClientRect();
      const middle = box.top + box.height / 2;
      let best: { key: string; distance: number } | null = null;
      for (const node of el.querySelectorAll<HTMLElement>("[data-canvas-page]")) {
        const r = node.getBoundingClientRect();
        const distance = r.top <= middle && r.bottom >= middle ? 0 : Math.min(Math.abs(r.top - middle), Math.abs(r.bottom - middle));
        if (best === null || distance < best.distance) best = { key: node.dataset.canvasPage ?? "", distance };
      }
      if (best !== null && best.key !== "") onPageInView(best.key);
    });
  }

  return (
    <section
      ref={scrollRef}
      aria-label={it.configurator.canvas.label}
      onScroll={onScroll}
      onClick={(event) => {
        // A click on the canvas around the pages clears the selection.
        if (event.target === event.currentTarget) onSelect(null);
      }}
      className="flex h-full min-h-0 flex-col items-center overflow-auto px-7 pt-5 pb-20"
    >
      {trial && (
        <p className={cn("w-full rounded-lg bg-surface-raised px-4 py-3 font-label text-[13px] text-foreground shadow-card", PAGE_WIDTH[formatId])}>
          <b className="mr-1.5 font-semibold text-foreground-strong">{it.configurator.trial.title}</b>
          {it.configurator.trial.body}
        </p>
      )}
      {pages.length === 0 && <p className="mt-10 font-label text-sm text-foreground-muted">{it.configurator.canvas.empty}</p>}
      {pages.map((page, i) => {
        // A section label before the first page of each run of pages in one section.
        const heading =
          i === 0 || pages[i - 1]?.section !== page.section ? (
            <div
              key={`section-${i}`}
              className={cn(
                "mt-7 flex w-full items-center gap-2.5 font-label text-[11.5px] font-semibold tracking-[0.06em] text-foreground-muted uppercase first:mt-2",
                PAGE_WIDTH[formatId],
              )}
            >
              {it.configurator.sections[page.section]}
              <span aria-hidden="true" className="h-px flex-1 bg-border-strong" />
            </div>
          ) : null;
        return [
          heading,
          <CanvasPage
            key={page.pageKey}
            formatId={formatId}
            template={template}
            page={page}
            number={i + 1}
            assets={assets}
            values={values}
            selection={selection}
            onSelect={onSelect}
          />,
        ];
      })}
    </section>
  );
}
