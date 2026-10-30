import { describe, expect, it } from "vitest";
import { caseHistoryV2, type Page } from "@/modules/generation";
import { FORMAT_IDS, layouts, type FormatId } from "@/modules/rendering";
import { borders, MIN_TRACK_SHARE, resizeTracks, setTracks, trackPixels, tracksCss } from "./grid-resize";

const TEMPLATE = "mac-case@1";
const layoutOf = (formatId: FormatId, layoutId: string) => layouts(formatId, TEMPLATE).find((l) => l.layoutId === layoutId)!;
const bordersOf = (formatId: FormatId, layoutId: string) => {
  const l = layoutOf(formatId, layoutId);
  return borders(l.areas, l.rows.length, l.cols.length);
};

describe("borders", () => {
  it("has one full-height column border for two blocks side by side", () => {
    expect(bordersOf("carosello_1_1", "two")).toEqual([{ axis: "col", index: 0, span: [0, 0] }]);
  });

  it("splits a row border where a tall block crosses it", () => {
    // three_a: two stacked blocks on the left, one tall block on the right.
    expect(bordersOf("carosello_1_1", "three_a")).toEqual([
      { axis: "col", index: 0, span: [0, 1] },
      { axis: "row", index: 0, span: [0, 0] },
    ]);
    // three_b: the tall block on the left.
    expect(bordersOf("carosello_1_1", "three_b")).toEqual([
      { axis: "col", index: 0, span: [0, 1] },
      { axis: "row", index: 0, span: [1, 1] },
    ]);
  });

  it("has a full column and a full row border for four blocks", () => {
    expect(bordersOf("carosello_1_1", "four")).toEqual([
      { axis: "col", index: 0, span: [0, 1] },
      { axis: "row", index: 0, span: [0, 1] },
    ]);
  });

  it("has none for one block, and only open stretches in Presentazione's Intro", () => {
    expect(bordersOf("carosello_1_1", "one")).toEqual([]);
    // Intro: a tall block on the left, a wide one on top right, two stacked below it and a tall one on the right.
    expect(bordersOf("presentazione_16_9", "intro")).toEqual([
      { axis: "col", index: 0, span: [0, 2] },
      { axis: "col", index: 1, span: [1, 2] },
      { axis: "row", index: 0, span: [1, 2] },
      { axis: "row", index: 1, span: [1, 1] },
    ]);
  });
});

describe("track sizes", () => {
  it("turns fractions into px without the gaps", () => {
    expect(trackPixels([1, 1], 1010, 10)).toEqual([500, 500]);
    expect(trackPixels([908, 442, 442], 1792, 0)).toEqual([908, 442, 442]);
  });

  it("moves a line: one track gives what the other takes, the total stays", () => {
    expect(resizeTracks([1, 1], 0, 100, 1000, 0)).toEqual({ sizes: [1.2, 0.8], held: false });
    expect(resizeTracks([1, 1], 0, -100, 1000, 0)).toEqual({ sizes: [0.8, 1.2], held: false });
    const three = resizeTracks([908, 442, 442], 1, 50, 1792, 0);
    expect(three.sizes[0]).toBe(908);
    expect(three.sizes[1]! + three.sizes[2]!).toBe(884);
    expect(three.sizes[1]).toBe(492);
  });

  it("leaves the gaps out when turning px into fractions", () => {
    expect(resizeTracks([1, 1], 0, 100, 1010, 10)).toEqual({ sizes: [1.2, 0.8], held: false });
    expect(resizeTracks([1, 1, 1], 1, 100, 1020, 10)).toEqual({ sizes: [1, 1.3, 0.7], held: false });
  });

  it("holds each track at 12% of the grid, and says so", () => {
    const left = resizeTracks([1, 1], 0, -1000, 1000, 0);
    expect(left).toEqual({ sizes: [2 * MIN_TRACK_SHARE, 2 - 2 * MIN_TRACK_SHARE], held: true });
    const right = resizeTracks([1, 1], 0, 1000, 1000, 0);
    expect(right.sizes[1]).toBeCloseTo(2 * MIN_TRACK_SHARE);
    expect(right.held).toBe(true);
  });

  it("never shrinks a track already under 12%, but lets it grow", () => {
    expect(resizeTracks([0.1, 1.9], 0, -50, 1000, 0)).toEqual({ sizes: [0.1, 1.9], held: true });
    expect(resizeTracks([0.1, 1.9], 0, 100, 1000, 0).sizes[0]).toBe(0.3);
  });

  it("rounds to 3 decimals and keeps an out-of-range line as it is", () => {
    const { sizes } = resizeTracks([1, 1, 1], 0, 1, 1000, 0);
    expect(sizes.every((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-9)).toBe(true);
    expect(sizes[0]).toBe(1.003);
    expect(resizeTracks([1, 1], 1, 50, 1000, 0)).toEqual({ sizes: [1, 1], held: false });
  });

  it("writes the renderer's track list", () => {
    expect(tracksCss([1.2, 0.8])).toBe("minmax(0,1.2fr) minmax(0,0.8fr)");
  });
});

describe("setTracks", () => {
  const pages = (): Page[] => caseHistoryV2(FORMAT_IDS).formats.carosello_1_1!.pages;

  it("sets one axis of one page, keeping its layout", () => {
    const before = pages();
    const page = before[0]!;
    const next = setTracks(before, page.pageKey, "col", [1.2, 0.8]);
    expect(next[0]!.grid).toEqual({ ...page.grid, cols: [1.2, 0.8] });
    expect(next[1]).toBe(before[1]);
  });

  it("sets the rows the same way", () => {
    const before = pages();
    const page = before[0]!;
    const rows = page.grid.rows.map((v, i) => (i === 0 ? v + 0.5 : v));
    const next = setTracks(before, page.pageKey, "row", rows);
    expect(next[0]!.grid).toEqual({ ...page.grid, rows });
  });

  it("keeps the pages for the same sizes, a different length or an unknown page", () => {
    const before = pages();
    const page = before[0]!;
    expect(setTracks(before, page.pageKey, "row", [...page.grid.rows])).toBe(before);
    expect(setTracks(before, page.pageKey, "row", [...page.grid.rows, 1])).toBe(before);
    expect(setTracks(before, "nope", "col", [1])).toBe(before);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(setTracks(before, page.pageKey, "row", page.grid.rows.map((v, i) => (i === 0 ? bad : v)))).toBe(before);
    }
  });
});
