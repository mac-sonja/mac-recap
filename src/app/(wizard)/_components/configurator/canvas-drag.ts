import type { FormatId } from "@/modules/rendering";
import { it } from "@/shared/i18n/it";

// Dragging on the canvas (Story 4.3e): each drag has a type of its own, so the Media tiles'
// and the Pagine thumbnails' drops ignore them, and they ignore those.

/** An element of a page dragged to another place: `{ formatId, pageKey, elementId }` as JSON. */
export const ELEMENT_DRAG_TYPE = "application/x-mac-element";
/** A block dragged by "⠿ Sposta" (or by its only element): `{ formatId, pageKey, blockId }` as JSON. */
export const BLOCK_DRAG_TYPE = "application/x-mac-block";
/** An Elementi button dragged onto the canvas: its key. */
export const NEW_ELEMENT_DRAG_TYPE = "application/x-mac-new-element";

/** An Elementi button's key (Testo, Immagine, Blocco, Animazione…). */
export type ElementKey = keyof typeof it.configurator.elements;

/** What is being dragged on the canvas. */
export type CanvasDrag =
  | { kind: "element"; formatId: FormatId; pageKey: string; elementId: string }
  | { kind: "block"; formatId: FormatId; pageKey: string; blockId: string }
  | { kind: "new"; element: ElementKey };

const TYPES = { element: ELEMENT_DRAG_TYPE, block: BLOCK_DRAG_TYPE, new: NEW_ELEMENT_DRAG_TYPE } as const;

/** Puts `drag` on a drag's data, in its own type. */
export function writeDrag(data: Pick<DataTransfer, "setData">, drag: CanvasDrag): void {
  if (drag.kind === "new") data.setData(NEW_ELEMENT_DRAG_TYPE, drag.element);
  else {
    const { kind, ...rest } = drag;
    data.setData(TYPES[kind], JSON.stringify(rest));
  }
}

/** The kind of canvas drag a drag's types carry (readable while it moves, unlike its data); null for any other drag. */
export function canvasDragKind(types: readonly string[]): CanvasDrag["kind"] | null {
  if (types.includes(ELEMENT_DRAG_TYPE)) return "element";
  if (types.includes(BLOCK_DRAG_TYPE)) return "block";
  if (types.includes(NEW_ELEMENT_DRAG_TYPE)) return "new";
  return null;
}

const isElementKey = (key: string): key is ElementKey => Object.hasOwn(it.configurator.elements, key);
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/**
 * The canvas drag a drop carries, read from its data; `fallback` (the drag this page
 * started) when the data can't be read but its kind matches. Null for anything else.
 */
export function readDrag(data: Pick<DataTransfer, "types" | "getData">, fallback: CanvasDrag | null): CanvasDrag | null {
  const kind = canvasDragKind([...data.types]);
  if (kind === null) return null;
  const raw = data.getData(TYPES[kind]);
  if (raw === "") return fallback?.kind === kind ? fallback : null;
  if (kind === "new") return isElementKey(raw) ? { kind, element: raw } : null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const { formatId, pageKey, elementId, blockId } = parsed as Record<string, unknown>;
  if (!isText(formatId) || !isText(pageKey)) return null;
  if (kind === "element") return isText(elementId) ? { kind, formatId: formatId as FormatId, pageKey, elementId } : null;
  return isText(blockId) ? { kind, formatId: formatId as FormatId, pageKey, blockId } : null;
}
