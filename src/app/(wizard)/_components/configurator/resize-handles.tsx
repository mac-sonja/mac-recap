"use client";

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Page } from "@/modules/generation";
import { layouts, type FormatId } from "@/modules/rendering";
import { cn } from "@/shared/utils";
import { borders, resizeTracks, trackPixels, tracksCss, type Axis, type Border } from "./grid-resize";

/** The grid as measured on the canvas, in px within the page. */
interface Measure {
  top: number;
  left: number;
  width: number;
  height: number;
  gapX: number;
  gapY: number;
}

/** The narrowest a handle is to grab, in px. */
const GRAB = 10;

/** The border being dragged: its sizes so far, and whether the last move was refused or held at 12%. */
interface Drag {
  key: string;
  axis: Axis;
  sizes: number[];
  warn: boolean;
}

const gapOf = (value: string) => {
  const px = parseFloat(value);
  return Number.isFinite(px) ? px : 0;
};

const overflows = (el: Element) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

/**
 * The border handles of one page in the editor (Story 4.4b, mockup `placeHandles`). Each
 * covers the gap between two blocks; a drag moves its line on the rendered grid as the
 * pointer goes, refuses a move that overflows a text or takes a track under 12% (the
 * handle turns orange), and on release reports the new track sizes once. Only for a
 * page laid out on one of the format's layouts.
 */
export function ResizeHandles({
  host,
  page,
  formatId,
  template,
  onResize,
}: {
  host: RefObject<HTMLDivElement | null>;
  page: Page;
  formatId: FormatId;
  template: string;
  onResize: (axis: Axis, sizes: number[]) => void;
}) {
  const layout = layouts(formatId, template).find((l) => l.layoutId === page.grid.layoutId);
  const fits =
    layout !== undefined &&
    layout.areas.length === page.blocks.length &&
    layout.rows.length === page.grid.rows.length &&
    layout.cols.length === page.grid.cols.length;
  const areas = fits ? layout.areas : null;
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const session = useRef<{ pointerId: number; start: number; base: number[]; good: number[]; original: string; applied: string; bento: HTMLElement; blocks: HTMLElement[]; was: boolean[] } | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    const bento = el?.querySelector<HTMLElement>(".mr-bento");
    // No layout grid: nothing is drawn (checked before `measure` below).
    if (el == null || bento == null || areas === null) return;
    const read = () => {
      const outer = el.getBoundingClientRect();
      const inner = bento.getBoundingClientRect();
      const style = getComputedStyle(bento);
      const next = {
        top: inner.top - outer.top,
        left: inner.left - outer.left,
        width: inner.width,
        height: inner.height,
        gapX: gapOf(style.columnGap),
        gapY: gapOf(style.rowGap),
      };
      setMeasure((prev) => (prev !== null && Object.entries(next).every(([k, v]) => prev[k as keyof Measure] === v) ? prev : next));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    observer.observe(bento);
    return () => observer.disconnect();
  }, [host, areas, page]);

  // A drag ends without saving when the page changes under it (undo, Mescola) or the handles go
  // (Anteprima, another format): the renderer's grid style is put back.
  useEffect(
    () => () => {
      const s = session.current;
      if (s === null) return;
      session.current = null;
      // Unless the renderer has already drawn the new page's grid over the drag's.
      if (s.bento.style.gridTemplate === s.applied) s.bento.style.gridTemplate = s.original;
    },
    [page],
  );

  if (areas === null || measure === null || measure.width <= 0 || measure.height <= 0) return null;

  const rows = drag?.axis === "row" ? drag.sizes : page.grid.rows;
  const cols = drag?.axis === "col" ? drag.sizes : page.grid.cols;
  const rowPx = trackPixels(rows, measure.height, measure.gapY);
  const colPx = trackPixels(cols, measure.width, measure.gapX);
  const sum = (px: readonly number[], to: number) => px.slice(0, to).reduce((a, b) => a + b, 0);

  /** A handle's box: over the gap after track `index`, along the cross tracks of its span. */
  function boxOf({ axis, index, span: [from, to] }: Border) {
    const [main, cross, gapMain, gapCross] = axis === "col" ? [colPx, rowPx, measure!.gapX, measure!.gapY] : [rowPx, colPx, measure!.gapY, measure!.gapX];
    const at = sum(main, index + 1) + index * gapMain;
    const thick = Math.max(gapMain, GRAB);
    const start = sum(cross, from) + from * gapCross;
    const length = sum(cross, to + 1) - sum(cross, from) + (to - from) * gapCross;
    const offset = at + gapMain / 2 - thick / 2;
    return axis === "col"
      ? { left: measure!.left + offset, top: measure!.top + start, width: thick, height: length }
      : { top: measure!.top + offset, left: measure!.left + start, height: thick, width: length };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>, border: Border, key: string) {
    if (event.button !== 0 || session.current !== null) return;
    const bento = host.current?.querySelector<HTMLElement>(".mr-bento");
    if (bento == null) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const base = [...(border.axis === "col" ? page.grid.cols : page.grid.rows)];
    const blocks = Array.from(bento.querySelectorAll<HTMLElement>(":scope > [data-block-id]"));
    session.current = {
      pointerId: event.pointerId,
      start: border.axis === "col" ? event.clientX : event.clientY,
      base,
      good: base,
      original: bento.style.gridTemplate,
      applied: bento.style.gridTemplate,
      bento,
      blocks,
      was: blocks.map(overflows),
    };
    setDrag({ key, axis: border.axis, sizes: base, warn: false });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>, border: Border) {
    const s = session.current;
    if (s === null || drag === null || event.pointerId !== s.pointerId) return;
    const delta = (border.axis === "col" ? event.clientX : event.clientY) - s.start;
    const length = border.axis === "col" ? measure!.width : measure!.height;
    const gap = border.axis === "col" ? measure!.gapX : measure!.gapY;
    const { sizes, held } = resizeTracks(s.base, border.index, delta, length, gap);
    const apply = (next: readonly number[]) => {
      const r = border.axis === "row" ? next : page.grid.rows;
      const c = border.axis === "col" ? next : page.grid.cols;
      s.bento.style.gridTemplate = `${tracksCss(r)} / ${tracksCss(c)}`;
      s.applied = s.bento.style.gridTemplate;
    };
    apply(sizes);
    // A text that fitted when the drag started must still fit: otherwise stay where it was good.
    if (s.blocks.some((b, i) => !s.was[i] && overflows(b))) {
      apply(s.good);
      setDrag({ ...drag, sizes: s.good, warn: true });
      return;
    }
    s.good = sizes;
    setDrag({ ...drag, sizes, warn: held });
  }

  /** Release saves the last good sizes; a cancel (or lost capture) drops the drag. */
  function onPointerEnd(event: PointerEvent<HTMLDivElement>, border: Border, save: boolean) {
    const s = session.current;
    if (s === null || event.pointerId !== s.pointerId) return;
    session.current = null;
    // The renderer owns the grid's style: put it back, and let the saved sizes redraw it.
    s.bento.style.gridTemplate = s.original;
    setDrag(null);
    if (save && s.good.some((v, i) => v !== s.base[i])) onResize(border.axis, s.good);
  }

  return (
    <>
      {borders(areas, page.grid.rows.length, page.grid.cols.length).map((border) => {
        const key = `${border.axis}-${border.index}-${border.span[0]}`;
        const active = drag?.key === key;
        return (
          <div
            key={key}
            aria-hidden="true"
            data-resize={key}
            data-warn={active && drag.warn ? "" : undefined}
            data-active={active ? "" : undefined}
            onPointerDown={(event) => onPointerDown(event, border, key)}
            onPointerMove={(event) => onPointerMove(event, border)}
            onPointerUp={(event) => onPointerEnd(event, border, true)}
            onPointerCancel={(event) => onPointerEnd(event, border, false)}
            onLostPointerCapture={(event) => onPointerEnd(event, border, false)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            className={cn(
              "group absolute z-20 flex touch-none items-center justify-center",
              border.axis === "col" ? "cursor-col-resize" : "cursor-row-resize",
            )}
            style={boxOf(border)}
          >
            <span
              className={cn(
                "rounded-full bg-accent opacity-0 transition-[opacity,background-color] duration-150 group-hover:opacity-100 group-data-active:opacity-100 group-data-warn:bg-warning",
                border.axis === "col" ? "h-full w-[3px]" : "h-[3px] w-full",
              )}
            />
          </div>
        );
      })}
    </>
  );
}
