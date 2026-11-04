import { describe, expect, it } from "vitest";
import { BLOCK_DRAG_TYPE, ELEMENT_DRAG_TYPE, NEW_ELEMENT_DRAG_TYPE, canvasDragKind, readDrag, writeDrag, type CanvasDrag } from "./canvas-drag";

/** A drag's data holding `entries`. */
function data(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  return { get types() { return [...store.keys()]; }, getData: (type: string) => store.get(type) ?? "", setData: (type: string, value: string) => void store.set(type, value) };
}

const ELEMENT: CanvasDrag = { kind: "element", formatId: "presentazione_16_9", pageKey: "p1", elementId: "e1" };
const BLOCK: CanvasDrag = { kind: "block", formatId: "carosello_1_1", pageKey: "p2", blockId: "b1" };

describe("canvas drags (Story 4.3e)", () => {
  it("round-trip an element, a block and an Elementi button in their own types", () => {
    for (const drag of [ELEMENT, BLOCK, { kind: "new", element: "text" } as const]) {
      const d = data();
      writeDrag(d, drag);
      expect(d.types).toHaveLength(1);
      expect(canvasDragKind(d.types)).toBe(drag.kind);
      expect(readDrag(d, null)).toEqual(drag);
    }
    expect(canvasDragKind(["application/x-mac-media", "application/x-mac-page", "Files"])).toBeNull();
  });

  it("read nothing from malformed JSON, a non-object, missing fields or an unknown Elementi key", () => {
    for (const raw of ["{", "null", "42", '"text"', "[]"]) expect(readDrag(data({ [ELEMENT_DRAG_TYPE]: raw }), null)).toBeNull();
    expect(readDrag(data({ [ELEMENT_DRAG_TYPE]: JSON.stringify({ formatId: "presentazione_16_9", pageKey: "p1" }) }), null)).toBeNull();
    expect(readDrag(data({ [ELEMENT_DRAG_TYPE]: JSON.stringify({ pageKey: "p1", elementId: "e1" }) }), null)).toBeNull();
    expect(readDrag(data({ [BLOCK_DRAG_TYPE]: JSON.stringify({ formatId: "carosello_1_1", pageKey: "p2", blockId: "" }) }), null)).toBeNull();
    expect(readDrag(data({ [BLOCK_DRAG_TYPE]: JSON.stringify({ formatId: "carosello_1_1", pageKey: "p2", elementId: "e1" }) }), null)).toBeNull();
    expect(readDrag(data({ [NEW_ELEMENT_DRAG_TYPE]: "sticker" }), null)).toBeNull();
    expect(readDrag(data({ [NEW_ELEMENT_DRAG_TYPE]: "toString" }), null)).toBeNull();
    expect(readDrag(data({ "application/x-mac-media": "a" }), ELEMENT)).toBeNull();
  });

  it("fall back to the drag this page started only when the data is unreadable and the kind matches", () => {
    expect(readDrag(data({ [ELEMENT_DRAG_TYPE]: "" }), ELEMENT)).toBe(ELEMENT);
    expect(readDrag(data({ [ELEMENT_DRAG_TYPE]: "" }), BLOCK)).toBeNull();
    expect(readDrag(data({ [BLOCK_DRAG_TYPE]: "" }), null)).toBeNull();
    // Readable data wins over the fallback.
    expect(readDrag(data({ [BLOCK_DRAG_TYPE]: JSON.stringify({ formatId: "presentazione_16_9", pageKey: "p9", blockId: "b9" }) }), BLOCK)).toEqual({
      kind: "block",
      formatId: "presentazione_16_9",
      pageKey: "p9",
      blockId: "b9",
    });
  });
});
