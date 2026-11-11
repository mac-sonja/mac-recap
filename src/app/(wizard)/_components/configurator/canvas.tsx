"use client";

import { Trash2 } from "lucide-react";
import { Fragment, memo, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { Crop, Page } from "@/modules/generation";
import { measureOverflow, renderFormat, type BoundValues, type FormatId, type RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { useInPlaceText } from "./in-place-text";
import type { Axis } from "./grid-resize";
import { INSTAGRAM_VIEWS, InstagramOverlay, type InstagramView } from "./instagram-overlay";
import { canvasDragKind, readDrag, writeDrag, type CanvasDrag } from "./canvas-drag";
import { MEDIA_DRAG_TYPE } from "./media-files";
import type { DropTarget, MediaTarget } from "./page-editing";
import { ResizeHandles } from "./resize-handles";
import { findElement, selectionAt, type Selection } from "./selection";
import { groupLabelOf, type PageGroups } from "./page-groups";
import { Slideshow } from "./slideshow";
import { PAGE_WIDTH, PREVIEW_WIDTH, SEG, SEG_BUTTON } from "./styles";

/**
 * A run of pages under one heading (Story 4.12a, the client's file): a part's pages, drawn
 * with that part's template and bound values.
 */
export interface CanvasGroup {
  /** Unique in the file; the heading carries it as `data-canvas-group`. */
  key: string;
  label: string;
  template: string;
  values: BoundValues;
  pages: readonly Page[];
  /** Under the heading (a case's copy not yet published, with its link). */
  note?: ReactNode;
  /** Shown in place of the pages when the group has none (an intro not ready yet). */
  empty?: string;
  /** Story 5.11a: drawn before a page of the group (by its key): a collection's hidden pages, where they sat. */
  before?: ReadonlyMap<string, ReactNode>;
  /** Story 5.11a: drawn after the group's last page. */
  after?: ReactNode;
}

export interface CanvasProps {
  formatId: FormatId;
  template: string;
  /** Every page shown, in order (with `groups`: theirs, flattened). */
  pages: readonly Page[];
  /** How the pages are labelled in groups: by section (a case), by role (client mode, Story 4.11a). */
  pageGroups?: PageGroups;
  /**
   * Story 4.12a: the pages in explicit groups, each with its own template and values, numbered
   * on from one group to the next; `pages`, `template` and `values` then only stand in.
   */
  groups?: readonly CanvasGroup[];
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
  /** The text being edited in the editor, if any; `bound`: a client or case field's stored words (Story 4.3d). */
  editing: { pageKey: string; elementId: string; bound?: string } | null;
  /** A double-click on an element: the configurator decides whether it can be edited. */
  onEditRequest: (pageKey: string, elementId: string) => void;
  /** The words of a text as typed so far. */
  onTextInput: (pageKey: string, elementId: string, text: string) => void;
  /** A text editing session ended. */
  onTextDone: (pageKey: string, elementId: string) => void;
  /** A bound text's typing ended (Story 4.3d): what was typed, or null when Esc cancelled it. */
  onFieldCommit?: (pageKey: string, elementId: string, text: string | null) => void;
  /** Anteprima: a click on an element (Story 4.3d: a client or case field says where to change it). */
  onPreviewPick?: (pageKey: string, elementId: string) => void;
  /** A border dragged and released (Story 4.4b): the page's new track sizes on `axis`. Undefined: no resize handles (Story 5.11a, a collection). */
  onResize?: (pageKey: string, axis: Axis, sizes: number[]) => void;
  /**
   * Story 5.11a: drawn over each page in the editor (not in Anteprima), inside the page's box,
   * given the page's key and its rendered host (to place marks by its elements).
   */
  pageExtras?: (pageKey: string, host: RefObject<HTMLElement | null>) => ReactNode;
  /** A Media tile dropped on a page (Story 4.5b): where, and its asset id. Undefined: the canvas takes no drop. */
  onPlaceMedia?: (target: MediaTarget, assetId: string) => void;
  /** Ritaglia's drag (Story 4.5b-3): the selected cropped image's or video's crop while it moves. */
  onCrop?: (pageKey: string, elementId: string, crop: Crop) => void;
  /** The drag let go after moving: the gesture is one undo step. */
  onCropDone?: () => void;
  /** The bin on a page's label (Story 4.13); undefined: no bin. */
  onDeletePage?: (pageKey: string) => void;
  /** **+ Aggiungi pagina** after the last page (Story 4.13); undefined: no button. */
  onAddPage?: () => void;
  /** The canvas drag in progress (Story 4.3e), started here or from Elementi; null: none. */
  dragging?: CanvasDrag | null;
  /** A drag on the canvas starts (its source) or ends (null). Undefined: nothing on the canvas drags. */
  onDragSource?: (drag: CanvasDrag | null) => void;
  /** An element, a block or an Elementi button dropped on a page. Undefined: the canvas takes no such drop. */
  onCanvasDrop?: (drag: CanvasDrag, target: DropTarget) => void;
}

/** What a page needs to let its texts be typed in. */
type TextEditing = Pick<CanvasProps, "editable" | "onTextInput" | "onTextDone" | "onFieldCommit" | "onPreviewPick">;

/** How far (px) a press moves before it is a Ritaglia drag. */
const CROP_DEAD_ZONE_PX = 3;
/** How far one arrow key moves Ritaglia's focal point (of the 0–1 range). */
const CROP_KEY_STEP = 0.05;

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

/** The top-level element node of `block` holding element `elementId` (itself or inside it), or null. */
function topLevelNode(block: Element, elementId: string | undefined): Element | null {
  if (elementId === undefined) return null;
  let node = block.querySelector(`[data-element-id="${elementId}"]`);
  if (node === null) return null;
  for (let up = node.parentElement?.closest("[data-element-id]"); up !== null && up !== undefined && block.contains(up); up = up.parentElement?.closest("[data-element-id]")) {
    node = up;
  }
  return node;
}

/** Story 5.11a: what the canvas's owner draws over a page (its `pageExtras`), given the page's rendered host. */
function PageExtrasSlot({ render, pageKey, host }: { render: NonNullable<CanvasProps["pageExtras"]>; pageKey: string; host: RefObject<HTMLElement | null> }) {
  return render(pageKey, host);
}

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
  editingBound,
  onEditRequest,
  onTextInput,
  onTextDone,
  onFieldCommit,
  onPreviewPick,
  onResize,
  pageExtras,
  onPlaceMedia,
  onCrop,
  onCropDone,
  onDeletePage,
  dragging = null,
  onDragSource,
  onCanvasDrop,
}: Pick<
  CanvasProps,
  | "formatId"
  | "template"
  | "assets"
  | "values"
  | "onSelect"
  | "preview"
  | "animateTexts"
  | "onEditRequest"
  | "onResize"
  | "pageExtras"
  | "onPlaceMedia"
  | "onCrop"
  | "onCropDone"
  | "onDeletePage"
  | "dragging"
  | "onDragSource"
  | "onCanvasDrop"
> &
  TextEditing & {
    page: Page;
    number: number;
    selection: Selection;
    /** The element of this page being edited in the editor. */
    editing: string | null;
    /** A bound text's stored words, when `editing` is one (Story 4.3d). */
    editingBound?: string;
  }) {
  const host = useRef<HTMLDivElement>(null);
  const still = useRef<HTMLDivElement>(null);
  const { shown, renderKey } = useInPlaceText({
    host,
    page,
    mode: !editable ? null : preview ? { kind: "preview" } : { kind: "editor", editing, ...(editingBound === undefined ? {} : { bound: editingBound }) },
    onInput: (elementId, text) => onTextInput(page.pageKey, elementId, text),
    onDone: (elementId) => onTextDone(page.pageKey, elementId),
    onCommit: (elementId, text) => onFieldCommit?.(page.pageKey, elementId, text),
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
  // Elements, blocks and Elementi dragged on the canvas (Story 4.3e): in the editor of an editable case only.
  const drags = !preview && editable && onDragSource !== undefined && onCanvasDrop !== undefined;
  const [dropFrame, setDropFrame] = useState<Box | null>(null);
  /** The line before the element a drop would go before. */
  const [dropLine, setDropLine] = useState<Box | null>(null);
  /** The page itself framed: a block or Blocco dropped here goes at its end. */
  const [dropPage, setDropPage] = useState(false);
  const takesMedia = (event: DragEvent<HTMLDivElement>) => dropsMedia && event.dataTransfer.types.includes(MEDIA_DRAG_TYPE);
  const canvasKind = (event: DragEvent<HTMLDivElement>) => (drags ? canvasDragKind([...event.dataTransfer.types]) : null);

  function clearMarks() {
    setDropFrame(null);
    setDropLine(null);
    setDropPage(false);
  }

  /** `node`'s box in the page, or null. */
  const boxOf = (node: Element | null | undefined) => (host.current === null || node === null || node === undefined ? null : boxIn(host.current, node));
  const sameBox = (prev: Box | null, box: Box | null) => (prev === null || box === null ? box : sameBoxes([prev], [box]) ? prev : box);

  // Every element of the page drags, but not the text being typed in, nor what holds it. Rerun on
  // everything the renderer draws from: a new rendition or bound value can redraw the element nodes.
  useLayoutEffect(() => {
    const el = host.current;
    if (el === null) return;
    for (const node of el.querySelectorAll<HTMLElement>("[data-element-id]")) {
      if (!drags || node.closest("[inert]") !== null) {
        node.removeAttribute("draggable");
        continue;
      }
      const typing = editing !== null && (node.dataset.elementId === editing || node.querySelector(`[data-element-id="${editing}"]`) !== null);
      node.setAttribute("draggable", typing ? "false" : "true");
    }
  }, [drags, editing, page, shown, renderKey, formatId, template, number, assets, values, animateTexts]);

  /** A drag starting on an element: the element, or its block when it is the block's only element (mockup `renderItem`). */
  function onDragStart(event: DragEvent<HTMLDivElement>) {
    if (!drags) return;
    const node = (event.target as Element).closest?.("[data-element-id]");
    if (node === null || node === undefined || node.closest("[inert]") !== null) return;
    const at = selectionAt(node, page.pageKey);
    const block = page.blocks.find((b) => b.blockId === at.blockId);
    if (block === undefined || at.elementId === undefined) return;
    if (editing !== null && (at.elementId === editing || node.querySelector(`[data-element-id="${editing}"]`) !== null)) {
      event.preventDefault();
      return;
    }
    const only = block.elements.length === 1 && block.elements[0]!.elementId === at.elementId;
    const drag: CanvasDrag = only
      ? { kind: "block", formatId, pageKey: page.pageKey, blockId: block.blockId }
      : { kind: "element", formatId, pageKey: page.pageKey, elementId: at.elementId };
    writeDrag(event.dataTransfer, drag);
    event.dataTransfer.effectAllowed = "move";
    onDragSource?.(drag);
  }

  /** "⠿ Sposta" dragged: its block. */
  function onGripDragStart(event: DragEvent<HTMLSpanElement>) {
    if (!drags || blockId === undefined) return;
    event.stopPropagation();
    const drag: CanvasDrag = { kind: "block", formatId, pageKey: page.pageKey, blockId };
    writeDrag(event.dataTransfer, drag);
    event.dataTransfer.effectAllowed = "move";
    const node = host.current?.querySelector(`[data-block-id="${blockId}"]`);
    if (node !== null && node !== undefined) event.dataTransfer.setDragImage?.(node, 24, 24);
    onDragSource?.(drag);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    const kind = canvasKind(event);
    if (kind === null) {
      if (!takesMedia(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      const target = dropTarget(event.target as Element);
      const block = target.blockId === undefined ? null : host.current?.querySelector(`[data-block-id="${target.blockId}"]`);
      setDropFrame((prev) => sameBox(prev, boxOf(block)));
      return;
    }
    const target = canvasTarget(event.target as Element);
    const from = dragging !== null && dragging.kind === kind ? dragging : null;
    // A block (or Blocco) goes on a block to swap with it, or at the end of the page; never on itself, nor its own page's end.
    const asBlock = kind === "block" || (from?.kind === "new" && from.element === "block");
    const own = from?.kind === "block" && from.pageKey === page.pageKey && (target.blockId === undefined || from.blockId === target.blockId);
    if (own) {
      clearMarks();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = kind === "new" ? "copy" : "move";
    const blockNode = target.blockId === undefined || (asBlock && kind === "new") ? null : host.current?.querySelector(`[data-block-id="${target.blockId}"]`);
    setDropPage(asBlock && (blockNode === null || blockNode === undefined));
    setDropFrame((prev) => sameBox(prev, boxOf(blockNode)));
    // Elements go before the top-level element under the pointer: a line marks it.
    const before = asBlock || blockNode === null || blockNode === undefined ? null : topLevelNode(blockNode, target.beforeElementId);
    const box = boxOf(before);
    setDropLine((prev) => sameBox(prev, box === null ? null : { top: box.top, left: box.left, width: box.width, height: 0 }));
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Leaving for a child is not leaving the page.
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    clearMarks();
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (canvasKind(event) !== null) {
      event.preventDefault();
      clearMarks();
      const drag = readDrag(event.dataTransfer, dragging);
      if (drag !== null) onCanvasDrop?.(drag, canvasTarget(event.target as Element));
      return;
    }
    if (!takesMedia(event)) return;
    event.preventDefault();
    clearMarks();
    const assetId = event.dataTransfer.getData(MEDIA_DRAG_TYPE);
    if (assetId !== "") onPlaceMedia?.(dropTarget(event.target as Element), assetId);
  }

  /** What a drop at `target` aims at: the Ritaglia frame stands for the selected element under it. */
  function dropTarget(target: Element): MediaTarget {
    if (target.closest?.('[data-frame="crop"]') && blockId !== undefined && elementId !== undefined) return { pageKey: page.pageKey, blockId, elementId };
    return selectionAt(target, page.pageKey);
  }

  /** Where a canvas drag at `target` lands: "⠿ Sposta" stands for its block. */
  function canvasTarget(target: Element): DropTarget {
    const grip = target.closest?.("[data-grip]")?.getAttribute("data-grip");
    if (grip !== null && grip !== undefined) return { pageKey: page.pageKey, blockId: grip };
    const at = dropTarget(target);
    return {
      pageKey: page.pageKey,
      ...(at.blockId === undefined ? {} : { blockId: at.blockId }),
      ...(at.elementId === undefined ? {} : { beforeElementId: at.elementId }),
    };
  }

  // Ritaglia (Story 4.5b-3): the selected cropped image or video is dragged to choose what shows.
  const block = blockId === undefined ? undefined : page.blocks.find((b) => b.blockId === blockId);
  const selected = block === undefined || elementId === undefined ? undefined : findElement(block.elements, elementId);
  const cropped = selected !== undefined && (selected.type === "image" || selected.type === "video") && selected.fit === "crop" ? selected : undefined;
  const crops = !preview && editable && onCrop !== undefined && cropped !== undefined;
  const drag = useRef<{ pointerId: number; x: number; y: number; from: Crop; moved: boolean } | null>(null);
  const cropFrom = (): Crop => cropped?.crop ?? { x: 0.5, y: 0.5, zoom: 1 };

  /** Ends the drag in progress; a drag that moved closes its undo step. */
  const endDrag = useRef(() => {});
  useLayoutEffect(() => {
    endDrag.current = () => {
      const start = drag.current;
      drag.current = null;
      if (start?.moved === true) onCropDone?.();
    };
  });
  // The frame going away mid-drag (another selection, an undo, a fit change) still ends the gesture.
  const croppedId = crops ? cropped.elementId : null;
  useLayoutEffect(() => () => endDrag.current(), [croppedId]);

  function onCropDown(event: PointerEvent<HTMLDivElement>) {
    if (cropped === undefined || event.button !== 0 || drag.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, from: cropFrom(), moved: false };
  }

  function onCropMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const box = frames.element;
    if (start === null || event.pointerId !== start.pointerId || box === null || box.width <= 0 || box.height <= 0 || cropped === undefined) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A press that wobbles a pixel or two is not a drag.
    if (!start.moved && Math.hypot(dx, dy) < CROP_DEAD_ZONE_PX) return;
    start.moved = true;
    // Crossing the whole element moves the focal point from one edge to the other, opposite the pointer.
    onCrop?.(page.pageKey, cropped.elementId, { x: start.from.x - dx / box.width, y: start.from.y - dy / box.height, zoom: start.from.zoom });
  }

  function onCropUp(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    endDrag.current();
  }

  /** Arrow keys on the focused Ritaglia frame move the focal point by one step each (one undo step per press). */
  function onCropKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (step === undefined || cropped === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const from = cropFrom();
    onCrop?.(page.pageKey, cropped.elementId, { x: from.x + step[0]! * CROP_KEY_STEP, y: from.y + step[1]! * CROP_KEY_STEP, zoom: from.zoom });
    onCropDone?.();
  }

  const pageSelected = mine !== null && blockId === undefined;
  const width = preview ? PREVIEW_WIDTH : PAGE_WIDTH[formatId];
  return (
    <>
      <div className={cn("mt-3.5 flex w-full items-center justify-between gap-2 font-label text-[12.5px] text-foreground-muted", width)}>
        <span className="truncate">{fill(it.configurator.canvas.pageLabel, { n: number, name: page.name })}</span>
        {!preview && onDeletePage !== undefined && (
          <button
            type="button"
            data-delete-page={page.pageKey}
            onClick={() => onDeletePage(page.pageKey)}
            aria-label={fill(it.configurator.pages.deleteLabel, { n: number })}
            title={it.configurator.tools.deletePage}
            className="grid size-[26px] shrink-0 place-items-center rounded-lg text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
          >
            <Trash2 aria-hidden="true" className="size-[15px]" />
          </button>
        )}
      </div>
      <div
        ref={host}
        id={`page-${page.pageKey}`}
        data-canvas-page={page.pageKey}
        data-selected={pageSelected ? "" : undefined}
        onClick={preview ? (event) => previewPick(event, page.pageKey, onPreviewPick) : onClick}
        onDoubleClick={preview ? undefined : onDoubleClick}
        data-drop-over={dropPage ? "" : undefined}
        onDragStart={drags ? onDragStart : undefined}
        onDragEnd={drags ? () => onDragSource?.(null) : undefined}
        onDragOver={dropsMedia || drags ? onDragOver : undefined}
        onDragLeave={dropsMedia || drags ? onDragLeave : undefined}
        onDrop={dropsMedia || drags ? onDrop : undefined}
        className={cn(
          "relative w-full shrink-0 shadow-page transition-shadow duration-150 data-selected:ring-2 data-selected:ring-accent data-drop-over:ring-[3px] data-drop-over:ring-accent",
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
              <span
                // Dragged onto another block, the two swap; onto another page, the block goes at its end (Story 4.3e).
                data-grip={drags ? blockId : undefined}
                draggable={drags}
                title={drags ? it.configurator.canvas.moveHint : undefined}
                onDragStart={drags ? onGripDragStart : undefined}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "absolute -top-[11px] left-1/2 inline-flex h-[22px] -translate-x-1/2 items-center rounded-full bg-accent px-2.5 font-label text-[11.5px] leading-none font-semibold whitespace-nowrap text-accent-foreground shadow-control",
                  drags && "pointer-events-auto cursor-grab active:cursor-grabbing",
                )}
              >
                {it.configurator.canvas.move}
              </span>
            )}
          </div>
        )}
        {!preview && editable && onResize !== undefined && (
          <ResizeHandles host={host} page={page} formatId={formatId} template={template} onResize={(axis, sizes) => onResize(page.pageKey, axis, sizes)} />
        )}
        {!preview && pageExtras !== undefined && <PageExtrasSlot render={pageExtras} pageKey={page.pageKey} host={host} />}
        {dropFrame !== null && (
          <div
            aria-hidden="true"
            data-frame="drop"
            className="pointer-events-none absolute z-10 rounded-lg border-2 border-dashed border-accent bg-accent/5"
            style={{ top: dropFrame.top - 2, left: dropFrame.left - 2, width: dropFrame.width + 4, height: dropFrame.height + 4 }}
          />
        )}
        {dropLine !== null && (
          <div
            aria-hidden="true"
            data-frame="drop-line"
            className="pointer-events-none absolute z-10 h-[3px] rounded-full bg-accent"
            style={{ top: dropLine.top - 3, left: dropLine.left, width: dropLine.width }}
          />
        )}
        {crops && frames.element !== null && (
          <div
            role="slider"
            tabIndex={0}
            aria-label={it.configurator.tools.fit.cropFrame}
            aria-valuetext={fill(it.configurator.tools.fit.cropPosition, { x: Math.round(cropFrom().x * 100), y: Math.round(cropFrom().y * 100) })}
            data-frame="crop"
            onPointerDown={onCropDown}
            onPointerMove={onCropMove}
            onPointerUp={onCropUp}
            onPointerCancel={onCropUp}
            onLostPointerCapture={onCropUp}
            onKeyDown={onCropKey}
            // The page would take the click and select itself; the element stays selected.
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className="absolute z-10 cursor-grab touch-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:cursor-grabbing"
            style={{ top: frames.element.top, left: frames.element.left, width: frames.element.width, height: frames.element.height }}
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
 * there (Story 4.5b). In the editor of an editable case its elements and "⠿ Sposta" drag,
 * and its blocks and pages take those drops and the Elementi buttons' (Story 4.3e).
 *
 * Above the Video pages sits the meta row: **Animazione testi** in the editor, the
 * Instagram switch in Anteprima. Anteprima of Presentazione stacks the pages at up to
 * 1600 px; Anteprima of Carosello and Video is a slideshow.
 */
export function Canvas({
  formatId,
  template,
  pages,
  pageGroups = "section",
  groups: given,
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
  onFieldCommit,
  onPreviewPick,
  onResize,
  pageExtras,
  onPlaceMedia,
  onCrop,
  onCropDone,
  onDeletePage,
  onAddPage,
  dragging = null,
  onDragSource,
  onCanvasDrop,
}: CanvasProps) {
  const frame = useRef<number | null>(null);
  const video = formatId === "video_9_16";
  // Anteprima always animates Video's texts; the switch is the editor's.
  const animate = preview || animateTexts;
  const width = preview && formatId === "presentazione_16_9" ? PREVIEW_WIDTH : PAGE_WIDTH[formatId];
  const slideshow = preview && formatId !== "presentazione_16_9" && pages.length > 0;
  // A case or an intro: runs of one section (or role) each, labelled as before.
  const groups = given ?? runsOfPages(pages, pageGroups, template, values);
  /** Each page's template and values, by page key (the slideshow's pages cross groups). */
  const partOf = new Map(groups.flatMap((g) => g.pages.map((p) => [p.pageKey, g] as const)));

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
      {pages.length === 0 && given === undefined && <p className="mt-10 font-label text-sm text-foreground-muted">{it.configurator.canvas.empty}</p>}
      {slideshow && (
        <SlideshowOf
          formatId={formatId}
          template={template}
          pages={pages}
          partOf={partOf}
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
          onPreviewPick={onPreviewPick}
        />
      )}
      {/* The editor, and Anteprima of Presentazione: the pages stacked, under their groups' labels. */}
      {(slideshow ? [] : numberedGroups(groups)).map(({ group, start }) => [
        // A label before the first page of each group (a run of one section, or a part of the client's file).
        <div
          key={`group-${group.key}`}
          data-canvas-group={given === undefined ? undefined : group.key}
          className={cn(
            "mt-7 flex w-full items-center gap-2.5 font-label text-[11.5px] font-semibold tracking-[0.06em] text-foreground-muted uppercase first:mt-2",
            width,
          )}
        >
          {group.label}
          <span aria-hidden="true" className="h-px flex-1 bg-border-strong" />
        </div>,
        group.note === undefined ? null : (
          <div key={`note-${group.key}`} className={cn("mt-2 flex w-full flex-wrap items-center gap-x-3 gap-y-1 font-label text-[12.5px] text-foreground-muted", width)}>
            {group.note}
          </div>
        ),
        group.pages.length === 0 && group.empty !== undefined ? (
          <p key={`empty-${group.key}`} className={cn("mt-3 w-full rounded-lg bg-surface-raised px-4 py-3 font-label text-[13px] text-foreground-muted shadow-card", width)}>
            {group.empty}
          </p>
        ) : null,
        ...group.pages.map((page, j) => {
          const i = start + j;
          const before = group.before?.get(page.pageKey);
          return [
            before === undefined ? null : <Fragment key={`before-${page.pageKey}`}>{before}</Fragment>,
            <CanvasPage
              key={page.pageKey}
              formatId={formatId}
              template={group.template}
              page={page}
              number={i + 1}
              assets={assets}
              values={group.values}
              selection={selection}
              onSelect={onSelect}
              preview={preview}
              animateTexts={animate}
              editable={editable}
              editing={editing !== null && editing.pageKey === page.pageKey ? editing.elementId : null}
              editingBound={editing !== null && editing.pageKey === page.pageKey ? editing.bound : undefined}
              onEditRequest={onEditRequest}
              onTextInput={onTextInput}
              onTextDone={onTextDone}
              onFieldCommit={onFieldCommit}
              onPreviewPick={onPreviewPick}
              onResize={onResize}
              pageExtras={pageExtras}
              onPlaceMedia={onPlaceMedia}
              onCrop={onCrop}
              onCropDone={onCropDone}
              dragging={dragging}
              onDragSource={onDragSource}
              onCanvasDrop={onCanvasDrop}
              onDeletePage={
                onDeletePage === undefined
                  ? undefined
                  : (pageKey) => {
                      // The bin goes with its page: focus moves to the next page's bin, else the previous one's, else Aggiungi pagina.
                      const next = pages[i + 1]?.pageKey ?? pages[i - 1]?.pageKey;
                      onDeletePage(pageKey);
                      requestAnimationFrame(() => {
                        const root = scrollRef.current;
                        const target =
                          (next === undefined ? null : root?.querySelector<HTMLElement>(`[data-delete-page="${next}"]`)) ??
                          root?.querySelector<HTMLElement>("[data-add-page]");
                        target?.focus();
                      });
                    }
              }
            />,
          ];
        }),
        group.after === undefined ? null : <Fragment key={`after-${group.key}`}>{group.after}</Fragment>,
      ])}
      {!preview && onAddPage !== undefined && (
        <button
          type="button"
          data-add-page
          onClick={onAddPage}
          className={cn(
            "mt-6 mb-8 h-11 w-full rounded-xl border-[1.5px] border-dashed border-border-strong font-label text-[13.5px] font-semibold text-foreground-muted transition-colors duration-150 hover:border-accent hover:text-foreground",
            width,
          )}
        >
          {it.configurator.pages.add}
        </button>
      )}
    </section>
  );
}

/** The slideshow of Carosello and Video in Anteprima, with Instagram's interface over a Video page. */
function SlideshowOf({
  formatId,
  template,
  pages,
  partOf,
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
  onPreviewPick,
}: Pick<CanvasProps, "template" | "pages" | "assets" | "values" | "slide" | "onStep" | "instagram" | "caption" | "reducedMotion"> &
  TextEditing & {
    formatId: Exclude<FormatId, "presentazione_16_9">;
    /** Each page's group: its template and values. */
    partOf: ReadonlyMap<string, Pick<CanvasGroup, "template" | "values">>;
  }) {
  const index = Math.max(0, Math.min(pages.length - 1, slide));
  const page = pages[index]!;
  const part = partOf.get(page.pageKey);
  return (
    <Slideshow formatId={formatId} index={index} count={pages.length} name={page.name} pageKey={page.pageKey} onStep={onStep} still={reducedMotion}>
      <Slide
        key={page.pageKey}
        formatId={formatId}
        template={part?.template ?? template}
        page={page}
        number={index + 1}
        assets={assets}
        values={part?.values ?? values}
        editable={editable}
        onTextInput={onTextInput}
        onTextDone={onTextDone}
        onPreviewPick={onPreviewPick}
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
  onPreviewPick,
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
    <div
      ref={host}
      data-canvas-page={page.pageKey}
      className={TYPING_PREVIEW}
      onClick={(event) => previewPick(event, page.pageKey, onPreviewPick)}
    >
      <RenderedPage key={renderKey} formatId={formatId} template={template} page={shown} number={number} assets={assets} values={values} animateTexts />
    </div>
  );
}

/**
 * Anteprima: a click on an element not being typed in tells the configurator (it selects
 * nothing). Only a double-click's first click reports, so its message shows once.
 */
function previewPick(event: MouseEvent<HTMLDivElement>, pageKey: string, onPreviewPick: CanvasProps["onPreviewPick"]) {
  if (onPreviewPick === undefined || event.detail > 1 || (event.target as Element).closest?.("[contenteditable]")) return;
  const elementId = selectionAt(event.target as Element, pageKey).elementId;
  if (elementId !== undefined) onPreviewPick(pageKey, elementId);
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

/** The pages cut into runs of one section (or role) each, as a case or an intro groups them: a page moved into another section's place keeps its own label. */
function runsOfPages(pages: readonly Page[], pageGroups: PageGroups, template: string, values: BoundValues): CanvasGroup[] {
  const runs: CanvasGroup[] = [];
  pages.forEach((page, i) => {
    const label = groupLabelOf(page, pageGroups);
    const last = runs.at(-1);
    if (last !== undefined && last.label === label) (last.pages as Page[]).push(page);
    else runs.push({ key: `section-${i}`, label, template, values, pages: [page] });
  });
  return runs;
}

/** Each group with the index of its first page in the whole list. */
function numberedGroups(groups: readonly CanvasGroup[]): { group: CanvasGroup; start: number }[] {
  let start = 0;
  return groups.map((group) => {
    const at = start;
    start += group.pages.length;
    return { group, start: at };
  });
}
