import type { FormatId } from "@/modules/rendering/domain/formats";
import type { GridArea, Layout } from "@/modules/rendering/templates/types";

/**
 * mac-case v1: each format's layout grids, from the Figma frames "MAC-TF-AI" as the
 * configurator mockup reproduces them (BENTO, `addLayout`, `PRESETS_BY_FMT`). This
 * is the only layout list: generation and the configurator's Layout read it. Track
 * sizes are fractions; `areas[i]` is block i's cell. New grids are appended; an id
 * never moves or changes within v1.
 */
const area = (rowStart: number, colStart: number, rowEnd: number, colEnd: number): GridArea =>
  Object.freeze([rowStart, colStart, rowEnd, colEnd] as const);

const layout = (layoutId: string, name: string, rows: number[], cols: number[], areas: GridArea[]): Layout =>
  Object.freeze({ layoutId, name, rows: Object.freeze(rows), cols: Object.freeze(cols), areas: Object.freeze(areas) });

// Grids shared by more than one format.
const ONE = (name: string) => layout("one", name, [1], [1], [area(1, 1, 2, 2)]);
/** Two blocks, one above the other (Carosello · Uno sopra l'altro; Video · Due blocchi). */
const STACK = (name: string) => layout("stack", name, [468, 460], [1], [area(1, 1, 2, 2), area(2, 1, 3, 2)]);
/** A tall block on the left, two on the right (Carosello · 3 immagini B; Presentazione · Risultati e testimonial). */
const THREE_B = (layoutId: string, name: string) =>
  layout(layoutId, name, [1, 1], [1, 1], [area(1, 1, 3, 2), area(1, 2, 2, 3), area(2, 2, 3, 3)]);

const PRESENTAZIONE: readonly Layout[] = Object.freeze([
  // Figma Intro: the project (tall, left), client, services, challenge, idea.
  layout("intro", "Intro", [147, 317, 488], [908, 442, 442], [area(1, 1, 4, 2), area(1, 2, 2, 4), area(2, 2, 3, 3), area(3, 2, 4, 3), area(2, 3, 4, 4)]),
  layout("content_1", "1 immagine", [1], [1373, 442], [area(1, 1, 2, 2), area(1, 2, 2, 3)]),
  layout("content_3", "3 immagini", [1, 1], [908, 442, 442], [area(1, 1, 3, 2), area(1, 2, 2, 3), area(2, 2, 3, 3), area(1, 3, 3, 4)]),
  layout("content_5", "5 immagini", [488, 147, 317], [442, 442, 442, 442], [
    area(1, 1, 3, 2),
    area(3, 1, 4, 2),
    area(1, 2, 4, 3),
    area(1, 3, 2, 4),
    area(2, 3, 4, 4),
    area(1, 4, 4, 5),
  ]),
  // The Intro's grid without images.
  layout("only_layout", "Solo layout", [488, 147, 317], [908, 442, 442], [area(1, 1, 3, 2), area(3, 1, 4, 2), area(1, 2, 4, 3), area(1, 3, 2, 4), area(2, 3, 4, 4)]),
  THREE_B("results", "Risultati e testimonial"),
]);

const CAROSELLO: readonly Layout[] = Object.freeze([
  ONE("1 immagine"),
  layout("two", "2 immagini", [1], [1, 1], [area(1, 1, 2, 2), area(1, 2, 2, 3)]),
  layout("three_a", "3 immagini · A", [1, 1], [1, 1], [area(1, 1, 2, 2), area(2, 1, 3, 2), area(1, 2, 3, 3)]),
  THREE_B("three_b", "3 immagini · B"),
  layout("four", "4 immagini", [1, 1], [1, 1], [area(1, 1, 2, 2), area(1, 2, 2, 3), area(2, 1, 3, 2), area(2, 2, 3, 3)]),
  STACK("Uno sopra l'altro"),
]);

const VIDEO: readonly Layout[] = Object.freeze([
  ONE("Un blocco"),
  STACK("Due blocchi"),
  // The project's info above, the animation below.
  layout("intro", "Intro", [820, 1028], [1], [area(1, 1, 2, 2), area(2, 1, 3, 2)]),
  // Info, results, testimonial.
  layout("results", "Risultati e testimonial", [720, 680, 424], [1], [area(1, 1, 2, 2), area(2, 1, 3, 2), area(3, 1, 4, 2)]),
]);

const BY_FORMAT: Readonly<Record<FormatId, readonly Layout[]>> = Object.freeze({
  presentazione_16_9: PRESENTAZIONE,
  carosello_1_1: CAROSELLO,
  video_9_16: VIDEO,
});

/** A format's layouts, in the configurator's order. */
export const layouts = (formatId: FormatId): readonly Layout[] => BY_FORMAT[formatId];

/** One layout of a format; throws for an id the format doesn't have (a bug in this template). */
export function layoutOf(formatId: FormatId, layoutId: string): Layout {
  const found = BY_FORMAT[formatId].find((l) => l.layoutId === layoutId);
  if (found === undefined) throw new Error(`mac-case@1 has no layout ${layoutId} in ${formatId}`);
  return found;
}
