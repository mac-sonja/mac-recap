"use client";

import { memo, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent, type RefObject } from "react";
import type { Page } from "@/modules/generation";
import { measureOverflow, renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { useInPlaceText } from "./in-place-text";
import type { Axis } from "./grid-resize";
import { INSTAGRAM_VIEWS, InstagramOverlay, type InstagramView } from "./instagram-overlay";
import { MEDIA_DRAG_TYPE } from "./media-files";
import type { MediaTarget } from "./page-editing";
import { ResizeHandles } from "./resize-handles";
import { selectionAt, type Selection } from "./selection";
import { Slideshow } from "./slideshow";
import { PAGE_WIDTH, PREVIEW_WIDTH, SEG, SEG_BUTTON } from "./styles";

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
  /** Anteprima (C37): no editing tools, no selection; Carosello and Video as a slideshow. */
  preview: boolean;
  /** The slideshow's page, 0-based (Anteprima of Carosello and Video). */
  slide: number;
  onStep: (delta: -1 | 1) => void;
  /** Instagram's interface over a Video page in Anteprima (C34). */
  instagram: InstagramView;
  onInstagram: (view: InstagramView) => void;
  /** The Reel's caption: the case name. */
  caption: string;
  /** The Video editor's **Animazione testi** switch; Anteprima always animates. */
  animateTexts: boolean;
  onAnimateTexts: (on: boolean) => void;
  /** Reduced motion: the slideshow switches without a transition. */
  reducedMotion: boolean;
  /** Texts can be typed in (Story 4.3a): a `working` head of an In revisione case. */
  editable: boolean;
  /** The text being edited in the editor, if any. */
  editing: { pageKey: string; elementId: string } | null;
  /** A double-click on an element: the configurator decides whether it can be edited. */
  onEditRequest: (pageKey: string, elementId: string) => void;
  /** The words of a text as typed so far. */
  onTextInput: (pageKey: string, elementId: string, text: string) => void;
  /** A text editing session ended. */
  onTextDone: (pageKey: string, elementId: string) => void;
  /** A border dragged and released (Story 4.4b): the page's new track sizes on `axis`. */
  onResize: (pageKey: string, axis: Axis, sizes: number[]) => void;
  /** A Media tile dropped on a page (Story 4.5b): where, and its asset id. Undefined: the canvas takes no drop. */
  onPlaceMedia?: (target: MediaTarget, assetId: string) => void;
}

/** What a page needs to let its texts be typed in. */
type TextEditing = Pick<CanvasProps, "editable" | "onTextInput" | "onTextDone">;

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

/** A text open for typing in the editor: a text cursor, and no browser outline (the selection frames it). */
const TYPING = "[&_[contenteditable]]:cursor-text [&_[contenteditable]]:outline-none";
/** In Anteprima no selection frames it: the focused text gets the focus ring. */
const TYPING_PREVIEW =
  "[&_[contenteditable]]:cursor-text [&_[contenteditable]]:outline-none [&_[contenteditable]:focus]:outline-2 [&_[contenteditable]:focus]:outline-offset-2 [&_[contenteditable]:focus]:outline-focus-ring";

const sameBoxes = (a: readonly Box[], b: readonly Box[]) =>
  a.length === b.length && a.every((x, i) => x.top === b[i]!.top && x.left === b[i]!.left && x.width === b[i]!.width && x.height === b[i]!.height);

/** One page drawn by the format's renderer (Story 3.5). Memoised: a selection change never redraws it. */
export const RenderedPage = memo(function RenderedPage({
  formatId,
  template,
  page,
  number,
  assets,
  values,
  animateTexts,
}: {
  formatId: FormatId;
  template: string;
  page: Page;
  number: number;
  assets: Readonly<Record<string, RenderAsset>>;
  values: BoundValues;
  /** Video's text loop; off, the texts stand still (`options.animateTexts: false`). */
  animateTexts: boolean;
}) {
  return renderFormat(template, formatId, { pages: [page], assets, values, options: { startPage: number, animateTexts } });
});

/**
 * A page on the canvas with its selection frames: the selected block framed, with the
 * "⠿ Sposta" handle when the block itself is selected; a selected element outlined and
 * its block framed. The frames are measured from the rendered page, so the template's
 * markup stays the renderer's alone. In Anteprima it draws no frames and a click selects
 * nothing.
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
  preview,
  animateTexts,
  editable,
  editing,
  onEditRequest,
  onTextInput,
  onTextDone,
  onResize,
  onPlaceMedia,
}: Pick<CanvasProps, "formatId" | "template" | "assets" | "values" | "onSelect" | "preview" | "animateTexts" | "onEditRequest" | "onResize" | "onPlaceMedia"> &
  TextEditing & {
    page: Page;
    number: number;
    selection: Selection;
    /** The element of this page being edited in the editor. */
    editing: string | null;
  }) {
  const host = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLDivElement>(null);
  const { shown, renderKey } = useInPlaceText({
    host,
    page,
    mode: !editable ? null : preview ? { kind: "preview" } : { kind: "editor", editing },
    onInput: (elementId, text) => onTextInput(page.pageKey, elementId, text),
    onDone: (elementId) => onTextDone(page.pageKey, elementId),
  });
  // Video's texts mid-loop are translated: its overflow is measured on a still copy (renderer's rule).
  const measureStill = formatId === "video_9_16" && animateTexts && !preview;
  const [overflow, setOverflow] = useState<Box[]>([]);

  useLayoutEffect(() => {
    const el = host.current;
    if (el === null || preview) return;
    const root = measureStill ? still.current : el;
    if (root === null) return;
    const measure = () => {
      const report = measureOverflow(root);
      const boxes: Box[] = [];
      for (const pageReport of report.pages) {
        for (const block of pageReport.blocks) {
          if (!block.overflow) continue;
          const node = root.querySelector(`[data-block-id="${block.blockId}"]`);
          if (node !== null) boxes.push(boxIn(el, node));
        }
      }
      setOverflow((prev) => (sameBoxes(prev, boxes) ? prev : boxes));
    };
    measure();
    // Web fonts arriving change the text's size without resizing the page.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) measure();
    });
    // Typing reflows the text in place; a resize reflows the whole page.
    el.addEventListener("input", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      live = false;
      el.removeEventListener("input", measure);
      observer?.disconnect();
    };
  }, [page, renderKey, formatId, preview, measureStill]);
  // An empty block (no elements, no photo) says what to do with it, in the editor only (Story 4.3c).
  const [empty, setEmpty] = useState<Box[]>([]);
  useLayoutEffect(() => {
    const el = host.current;
    const ids = preview ? [] : page.blocks.filter((b) => b.elements.length === 0 && b.background.kind !== "image").map((b) => b.blockId);
    if (el === null || ids.length === 0) {
      setEmpty((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const measure = () => {
      const boxes = ids.flatMap((id) => {
        const node = el.querySelector(`[data-block-id="${id}"]`);
        return node === null ? [] : [boxIn(el, node)];
      });
      setEmpty((prev) => (sameBoxes(prev, boxes) ? prev : boxes));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page, renderKey, formatId, preview]);
  // Anteprima shows no frames; the selection is kept and shows again in the editor.
  const mine = !preview && selection !== null && selection.pageKey === page.pageKey ? selection : null;
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
    // A click inside the text being typed in moves the caret; it selects nothing new.
    if ((event.target as Element).closest?.("[contenteditable]")) return;
    onSelect(selectionAt(event.target as Element, page.pageKey));
  }

  function onDoubleClick(event: MouseEvent<HTMLDivElement>) {
    // A double-click inside the text being typed in selects a word; it opens nothing.
    if ((event.target as Element).closest?.("[contenteditable]")) return;
    const target = selectionAt(event.target as Element, page.pageKey);
    if (target.elementId !== undefined) onEditRequest(page.pageKey, target.elementId);
  }

  // A Media tile dragged over the page (Story 4.5b): the block it would go in framed; off every block, no frame.
  const dropsMedia = !preview && onPlaceMedia !== undefined;
  const [dropFrame, setDropFrame] = useState<Box | null>(null);
  const takes = (event: DragEvent<HTMLDivElement>) => dropsMedia && event.dataTransfer.types.includes(MEDIA_DRAG_TYPE);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!takes(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const el = host.current;
    const block = (event.target as Element).closest?.("[data-block-id]");
    const box = el === null || block === null || block === undefined ? null : boxIn(el, block);
    setDropFrame((prev) => (prev === null || box === null ? box : sameBoxes([prev], [box]) ? prev : box));
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Leaving for a child is not leaving the page.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDropFrame(null);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!takes(event)) return;
    event.preventDefault();
    setDropFrame(null);
    const assetId = event.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (assetId !== "") onPlaceMedia?.(selectionAt(event.target as Element, page.pageKey), assetId);
  }

  const pageSelected = mine !== null && blockId === undefined;
  const width = preview ? PREVIEW_WIDTH : PAGE_WIDTH[formatId];
  return (
    <>
      <div className={cn("mt-3.5 flex w-full items-center font-label text-[12.5px] text-foreground-muted", width)}>
        <span className="truncate">{fill(it.configurator.canvas.pageLabel, { n: number, name: page.name })}</span>
      </div>
      <div
        ref={host}
        id={`page-${page.pageKey}`}
        data-canvas-page={page.pageKey}
        data-selected={pageSelected ? "" : undefined}
        onClick={preview ? undefined : onClick}
        onDoubleClick={preview ? undefined : onDoubleClick}
        onDragOver={dropsMedia ? onDragOver : undefined}
        onDragLeave={dropsMedia ? onDragLeave : undefined}
        onDrop={dropsMedia ? onDrop : undefined}
        className={cn(
          "relative w-full shrink-0 shadow-page transition-shadow duration-150 data-selected:ring-2 data-selected:ring-accent",
          // The text being typed in is framed by the selection; no second outline (mockup).
          preview ? TYPING_PREVIEW : TYPING,
          !preview && "cursor-pointer",
          width,
        )}
      >
        <RenderedPage
          key={renderKey}
          formatId={formatId}
          template={template}
          page={shown}
          number={number}
          assets={assets}
          values={values}
          animateTexts={animateTexts}
        />
        {measureStill && (
          <div ref={still} aria-hidden="true" inert className="pointer-events-none invisible absolute inset-0 overflow-hidden">
            <RenderedPage formatId={formatId} template={template} page={page} number={number} assets={assets} values={values} animateTexts={false} />
          </div>
        )}
        {!preview &&
          overflow.map((box, i) => (
            <div
              key={i}
              aria-hidden="true"
              data-frame="overflow"
              className="pointer-events-none absolute z-10 rounded-lg border-2 border-warning"
              style={{ top: box.top - 2, left: box.left - 2, width: box.width + 4, height: box.height + 4 }}
            >
              <span className="absolute bottom-1.5 left-1.5 inline-flex h-[22px] items-center rounded-full bg-warning px-2.5 font-label text-[11.5px] leading-none font-semibold whitespace-nowrap text-warning-foreground shadow-control">
                {it.configurator.overflow}
              </span>
            </div>
          ))}
        {empty.map((box, i) => (
          <div
            key={i}
            aria-hidden="true"
            data-frame="empty"
            className="pointer-events-none absolute flex items-center justify-center font-label text-xs font-medium text-foreground-muted"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          >
            {it.configurator.edit.emptyBlock}
          </div>
        ))}
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
        {!preview && editable && (
          <ResizeHandles host={host} page={page} formatId={formatId} template={template} onResize={(axis, sizes) => onResize(page.pageKey, axis, sizes)} />
        )}
        {dropFrame !== null && (
          <div
            aria-hidden="true"
            data-frame="drop"
            className="pointer-events-none absolute z-10 rounded-lg border-2 border-dashed border-accent bg-accent/5"
            style={{ top: dropFrame.top - 2, left: dropFrame.left - 2, width: dropFrame.width + 4, height: dropFrame.height + 4 }}
          />
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
 * under the pointer. It reports the page nearest its middle as the page in view. A Media
 * tile dragged over a page frames the block it would go in, and dropped puts its file
 * there (Story 4.5b).
 *
 * Above the Video pages sits the meta row: **Animazione testi** in the editor, the
 * Instagram switch in Anteprima. Anteprima of Presentazione stacks the pages at up to
 * 1600 px; Anteprima of Carosello and Video is a slideshow.
 */
export function Canvas({
  formatId,
  template,
  pages,
  assets,
  values,
  selection,
  onSelect,
  onPageInView,
  trial,
  scrollRef,
  preview,
  slide,
  onStep,
  instagram,
  onInstagram,
  caption,
  animateTexts,
  onAnimateTexts,
  reducedMotion,
  editable,
  editing,
  onEditRequest,
  onTextInput,
  onTextDone,
  onResize,
  onPlaceMedia,
}: CanvasProps) {
  const frame = useRef<number | null>(null);
  const video = formatId === "video_9_16";
  // Anteprima always animates Video's texts; the switch is the editor's.
  const animate = preview || animateTexts;
  const width = preview && formatId === "presentazione_16_9" ? PREVIEW_WIDTH : PAGE_WIDTH[formatId];
  const slideshow = preview && formatId !== "presentazione_16_9" && pages.length > 0;

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
        // A click on the canvas around the pages clears the selection (never in Anteprima).
        if (!preview && event.target === event.currentTarget) onSelect(null);
      }}
      className="flex h-full min-h-0 flex-col items-center overflow-auto px-7 pt-5 pb-20"
    >
      {video && (
        <div data-canvas-meta="" className="mb-3 flex w-full justify-center">
          {preview ? <InstagramSwitch value={instagram} onChange={onInstagram} /> : <TextAnimationSwitch on={animateTexts} onChange={onAnimateTexts} />}
        </div>
      )}
      {trial && (
        <p className={cn("w-full rounded-lg bg-surface-raised px-4 py-3 font-label text-[13px] text-foreground shadow-card", width)}>
          <b className="mr-1.5 font-semibold text-foreground-strong">{it.configurator.trial.title}</b>
          {it.configurator.trial.body}
        </p>
      )}
      {pages.length === 0 && <p className="mt-10 font-label text-sm text-foreground-muted">{it.configurator.canvas.empty}</p>}
      {slideshow && (
        <SlideshowOf
          formatId={formatId}
          template={template}
          pages={pages}
          assets={assets}
          values={values}
          slide={slide}
          onStep={onStep}
          instagram={video ? instagram : "off"}
          caption={caption}
          reducedMotion={reducedMotion}
          editable={editable}
          onTextInput={onTextInput}
          onTextDone={onTextDone}
        />
      )}
      {/* The editor, and Anteprima of Presentazione: the pages stacked. */}
      {(slideshow ? [] : pages).map((page, i) => {
        // A section label before the first page of each run of pages in one section.
        const heading =
          i === 0 || pages[i - 1]?.section !== page.section ? (
            <div
              key={`section-${i}`}
              className={cn(
                "mt-7 flex w-full items-center gap-2.5 font-label text-[11.5px] font-semibold tracking-[0.06em] text-foreground-muted uppercase first:mt-2",
                width,
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
            preview={preview}
            animateTexts={animate}
            editable={editable}
            editing={editing !== null && editing.pageKey === page.pageKey ? editing.elementId : null}
            onEditRequest={onEditRequest}
            onTextInput={onTextInput}
            onTextDone={onTextDone}
            onResize={onResize}
            onPlaceMedia={onPlaceMedia}
          />,
        ];
      })}
    </section>
  );
}

/** The slideshow of Carosello and Video in Anteprima, with Instagram's interface over a Video page. */
function SlideshowOf({
  formatId,
  template,
  pages,
  assets,
  values,
  slide,
  onStep,
  instagram,
  caption,
  reducedMotion,
  editable,
  onTextInput,
  onTextDone,
}: Pick<CanvasProps, "template" | "pages" | "assets" | "values" | "slide" | "onStep" | "instagram" | "caption" | "reducedMotion"> &
  TextEditing & {
    formatId: Exclude<FormatId, "presentazione_16_9">;
  }) {
  const index = Math.max(0, Math.min(pages.length - 1, slide));
  const page = pages[index]!;
  return (
    <Slideshow formatId={formatId} index={index} count={pages.length} name={page.name} pageKey={page.pageKey} onStep={onStep} still={reducedMotion}>
      <Slide
        key={page.pageKey}
        formatId={formatId}
        template={template}
        page={page}
        number={index + 1}
        assets={assets}
        values={values}
        editable={editable}
        onTextInput={onTextInput}
        onTextDone={onTextDone}
      />
      {instagram !== "off" && <InstagramOverlay view={instagram} caption={caption} />}
    </Slideshow>
  );
}

/** One slide of Anteprima: its texts take a click and typing (C37). */
function Slide({
  formatId,
  template,
  page,
  number,
  assets,
  values,
  editable,
  onTextInput,
  onTextDone,
}: Pick<CanvasProps, "formatId" | "template" | "assets" | "values"> & TextEditing & { page: Page; number: number }) {
  const host = useRef<HTMLDivElement>(null);
  const { shown, renderKey } = useInPlaceText({
    host,
    page,
    mode: editable ? { kind: "preview" } : null,
    onInput: (elementId, text) => onTextInput(page.pageKey, elementId, text),
    onDone: (elementId) => onTextDone(page.pageKey, elementId),
  });
  return (
    <div ref={host} data-canvas-page={page.pageKey} className={TYPING_PREVIEW}>
      <RenderedPage key={renderKey} formatId={formatId} template={template} page={shown} number={number} assets={assets} values={values} animateTexts />
    </div>
  );
}

/** Anteprima of Video: Nessuna, Reel or Storia over the page (mockup `.ig-switch`). */
export function InstagramSwitch({ value, onChange }: { value: InstagramView; onChange: (view: InstagramView) => void }) {
  const copy = it.configurator.preview.instagram;
  return (
    <div
      role="group"
      aria-labelledby="configurator-instagram"
      className="inline-flex items-center gap-2 font-label text-[12.5px] font-medium whitespace-nowrap text-foreground-muted"
    >
      <span id="configurator-instagram">{copy.label}</span>
      <div className={SEG}>
        {INSTAGRAM_VIEWS.map((view) => (
          <button key={view} type="button" aria-pressed={view === value} onClick={() => onChange(view)} className={cn(SEG_BUTTON, "h-6 px-2.5 text-[12px]")}>
            {copy[view]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Video editor's **Animazione testi** switch (mockup `.tswitch`): on by default. */
function TextAnimationSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 font-label text-[12.5px] font-medium whitespace-nowrap text-foreground">
      <input type="checkbox" role="switch" checked={on} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-[18px] w-[30px] rounded-full bg-surface-control shadow-control transition-colors duration-150 peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring peer-checked:[&>span]:translate-x-3"
      >
        <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-surface-raised shadow-control transition-transform duration-150 ease-out" />
      </span>
      {it.configurator.textAnimation}
    </label>
  );
}
