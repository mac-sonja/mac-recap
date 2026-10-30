import type { Page } from "@/modules/generation";
import type { GridArea } from "@/modules/rendering";

/**
 * Resizing a page's bento grid (Story 4.4b, mockup `placeHandles`): where its borders
 * are, and how a dragged border changes the track sizes. Pure; the canvas measures.
 */

export type Axis = "col" | "row";

/** A border between track `index` and `index + 1` on `axis`, over the cross tracks `span` (inclusive, 0-based). */
export interface Border {
  axis: Axis;
  index: number;
  span: readonly [number, number];
}

/** No track goes below this share of the grid's size on its axis. */
export const MIN_TRACK_SHARE = 0.12;

/**
 * The grid's borders: for each line between two tracks, one per stretch of cross tracks
 * where no block spans across the line (a tall block splits a row line, or removes it).
 * Areas are `[rowStart, colStart, rowEnd, colEnd]`, 1-based lines.
 */
export function borders(areas: readonly GridArea[], rows: number, cols: number): Border[] {
  const found: Border[] = [];
  for (const axis of ["col", "row"] as const) {
    const tracks = axis === "col" ? cols : rows;
    const cross = axis === "col" ? rows : cols;
    for (let index = 0; index < tracks - 1; index++) {
      const line = index + 2;
      const open = Array.from({ length: cross }, (_, c) =>
        !areas.some(([r1, c1, r2, c2]) =>
          axis === "col" ? c1 < line && line < c2 && r1 <= c + 1 && c + 1 < r2 : r1 < line && line < r2 && c1 <= c + 1 && c + 1 < c2,
        ),
      );
      let from = -1;
      open.forEach((isOpen, c) => {
        if (isOpen && from < 0) from = c;
        if (from >= 0 && (!isOpen || c === cross - 1)) {
          found.push({ axis, index, span: [from, isOpen ? c : c - 1] });
          from = -1;
        }
      });
    }
  }
  return found;
}

/** Track sizes (fractions) as px on a grid `length` px long with `gap` px between tracks. */
export function trackPixels(sizes: readonly number[], length: number, gap: number): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  const content = Math.max(0, length - gap * (sizes.length - 1));
  return sizes.map((v) => (total > 0 ? (v * content) / total : 0));
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Track `index` and the next one after moving the line between them by `deltaPx`: one
 * gives what the other takes, the others stay, the total stays. Neither goes below
 * `MIN_TRACK_SHARE` of `length` (a track already below it doesn't shrink); `held` when
 * the move was cut short there.
 */
export function resizeTracks(sizes: readonly number[], index: number, deltaPx: number, length: number, gap: number): { sizes: number[]; held: boolean } {
  const next = [...sizes];
  const content = length - gap * (sizes.length - 1);
  if (index < 0 || index >= sizes.length - 1 || content <= 0) return { sizes: next, held: false };
  const px = trackPixels(sizes, length, gap);
  const min = MIN_TRACK_SHARE * length;
  const a = px[index]!;
  const b = px[index + 1]!;
  const lo = Math.min(0, min - a);
  const hi = Math.max(0, b - min);
  const delta = Math.min(hi, Math.max(lo, deltaPx));
  const total = sizes.reduce((x, y) => x + y, 0);
  const pair = sizes[index]! + sizes[index + 1]!;
  const first = round(((a + delta) * total) / content);
  next[index] = first;
  next[index + 1] = round(pair - first);
  return { sizes: next, held: delta !== deltaPx };
}

/** The renderer's track list for `sizes` (as `render/page.tsx` writes it). */
export const tracksCss = (sizes: readonly number[]) => sizes.map((v) => `minmax(0,${v}fr)`).join(" ");

/** Page `pageKey` with its `axis` track sizes set to `sizes`; `pages` itself when they are the same. */
export function setTracks(pages: readonly Page[], pageKey: string, axis: Axis, sizes: readonly number[]): readonly Page[] {
  const index = pages.findIndex((p) => p.pageKey === pageKey);
  if (index < 0) return pages;
  const page = pages[index]!;
  const current = axis === "col" ? page.grid.cols : page.grid.rows;
  if (current.length !== sizes.length || current.every((v, i) => v === sizes[i])) return pages;
  if (!sizes.every((v) => Number.isFinite(v) && v > 0)) return pages;
  const grid = axis === "col" ? { ...page.grid, cols: [...sizes] } : { ...page.grid, rows: [...sizes] };
  return pages.map((p, i) => (i === index ? { ...page, grid } : p));
}
