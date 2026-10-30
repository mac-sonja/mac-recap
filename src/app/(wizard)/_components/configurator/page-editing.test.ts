import { describe, expect, it } from "vitest";
import {
  blockSchema,
  caseHistoryV2,
  pageSchema,
  validateNewDocument,
  type Block,
  type DocumentElement,
  type Page,
  type TextElement,
  type TextGroupElement,
} from "@/modules/generation";
import { FORMAT_IDS, layouts, starterPages, type FormatId } from "@/modules/rendering";
import { it as dict } from "@/shared/i18n/it";
import {
  addBlock,
  addElement,
  COLUMN_LAYOUT_ID,
  MAX_BLOCKS_PER_PAGE,
  MAX_ELEMENTS_PER_BLOCK,
  NEW_BLOCK_COLOUR,
  NEW_ELEMENTS,
  pasteBlock,
  removeSelection,
  restartGrid,
  withFreshIds,
  type PageEdit,
} from "./page-editing";
import { findElement } from "./selection";

const TEMPLATE = "mac-case@1";

/** Sequential uuids, distinct from the fixtures' ids. */
function ids() {
  let n = 0;
  return () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/** A format's starter pages, with ids of their own. */
function starter(formatId: FormatId): Page[] {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  return starterPages(TEMPLATE, "case_history", formatId, { newId, texts: {}, images: [], resultRows: 2, hasTestimonial: true });
}

/** A copy of `page` cut to its first `n` blocks (`n` ≤ its blocks), its grid restarted. */
function withBlocks(page: Page, n: number, formatId: FormatId): Page {
  const copy = structuredClone(page);
  copy.blocks = copy.blocks.slice(0, n);
  restartGrid(copy, formatId, TEMPLATE);
  return copy;
}

/** A page with `n` empty blocks in `formatId`. */
function emptyPage(n: number, formatId: FormatId, newId = ids()): Page {
  const page = structuredClone(starter(formatId)[0]!);
  page.blocks = Array.from({ length: n }, () => ({ blockId: newId(), name: "B", background: { kind: "colour", value: "#ffffff" }, elements: [] }));
  restartGrid(page, formatId, TEMPLATE);
  return page;
}

function ok(edit: PageEdit): Extract<PageEdit, { ok: true }> {
  if (!edit.ok) throw new Error(`refused: ${edit.reason}`);
  return edit;
}

/** `pages` as Presentazione in an otherwise valid document, through the server's check. */
function expectValid(pages: readonly Page[], formatId: FormatId = "presentazione_16_9") {
  const doc = caseHistoryV2(FORMAT_IDS);
  doc.formats[formatId] = { pages: [...pages] };
  expect(validateNewDocument(doc)).toMatchObject({ ok: true });
}

const firstBlock = (pages: readonly Page[]) => ({ pageKey: pages[0]!.pageKey, blockId: pages[0]!.blocks[0]!.blockId });

describe("limits", () => {
  it("mirror the document schema's", () => {
    const page = emptyPage(MAX_BLOCKS_PER_PAGE + 1, "carosello_1_1");
    expect(pageSchema.safeParse(page).success).toBe(false);
    page.blocks.pop();
    expect(pageSchema.safeParse(page).success).toBe(true);
    const block: Block = { ...page.blocks[0]!, elements: [] };
    const text = (i: number): DocumentElement => ({ elementId: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`, type: "text", style: "text", text: "x", provenance: "human_added" });
    block.elements = Array.from({ length: MAX_ELEMENTS_PER_BLOCK }, (_, i) => text(i));
    expect(blockSchema.safeParse(block).success).toBe(true);
    block.elements.push(text(99));
    expect(blockSchema.safeParse(block).success).toBe(false);
  });
});

describe("addElement", () => {
  it.each(NEW_ELEMENTS)("appends a new %s to the selected block, selects it, and the document stays valid", (kind) => {
    const before = starter("presentazione_16_9");
    const at = firstBlock(before);
    const edit = ok(addElement(before, at, kind, ids()));
    const block = edit.pages[0]!.blocks[0]!;
    expect(block.elements).toHaveLength(before[0]!.blocks[0]!.elements.length + 1);
    const added = block.elements.at(-1)!;
    expect(edit.selection).toEqual({ ...at, elementId: added.elementId });
    // Only the edited page is a new object.
    for (const [i, page] of edit.pages.entries()) if (i > 0) expect(page).toBe(before[i]);
    expect(before[0]!.blocks[0]!.elements).not.toContain(added);
    expectValid(edit.pages);
  });

  it("gives new texts their placeholder words, style and human_added", () => {
    const before = starter("presentazione_16_9");
    const words = dict.configurator.newTexts;
    const cases = [
      ["title", "title", words.title],
      ["text", "text", words.text],
      ["number", "num", words.number],
      ["quote", "quote", words.quote],
      ["label", "lab", words.label],
    ] as const;
    for (const [kind, style, text] of cases) {
      const added = ok(addElement(before, firstBlock(before), kind, ids())).pages[0]!.blocks[0]!.elements.at(-1);
      expect(added).toMatchObject({ type: "text", style, text, provenance: "human_added" });
    }
  });

  it("makes Testi a split group (first text on top) of Etichetta, Titolo and Testo, and media empty", () => {
    const before = starter("presentazione_16_9");
    const group = ok(addElement(before, firstBlock(before), "group", ids())).pages[0]!.blocks[0]!.elements.at(-1) as TextGroupElement;
    expect(group).toMatchObject({ type: "text_group", align: "split", splitAt: 1 });
    expect(group.items.map((t) => [t.style, t.text, t.provenance])).toEqual([
      ["lab", dict.configurator.newTexts.label, "human_added"],
      ["title", dict.configurator.newTexts.groupTitle, "human_added"],
      ["text", dict.configurator.newTexts.text, "human_added"],
    ]);
    for (const kind of ["image", "video"] as const) {
      expect(ok(addElement(before, firstBlock(before), kind, ids())).pages[0]!.blocks[0]!.elements.at(-1)).toMatchObject({ type: kind, assetId: null, fit: "fill" });
    }
  });

  it("adds to the selected element's block too", () => {
    const before = starter("presentazione_16_9");
    const block = before[0]!.blocks[1]!;
    const edit = ok(addElement(before, { pageKey: before[0]!.pageKey, blockId: block.blockId, elementId: block.elements[0]!.elementId }, "title", ids()));
    expect(edit.pages[0]!.blocks[1]!.elements).toHaveLength(block.elements.length + 1);
    expect(edit.selection.blockId).toBe(block.blockId);
  });

  it("refuses with no block selected, and at 30 elements", () => {
    const before = starter("presentazione_16_9");
    expect(addElement(before, null, "text", ids())).toEqual({ ok: false, reason: "noBlock" });
    expect(addElement(before, { pageKey: before[0]!.pageKey }, "text", ids())).toEqual({ ok: false, reason: "noBlock" });
    let pages: readonly Page[] = [emptyPage(1, "presentazione_16_9")];
    const at = firstBlock(pages);
    const newId = ids();
    for (let i = 0; i < MAX_ELEMENTS_PER_BLOCK; i++) pages = ok(addElement(pages, at, "label", newId)).pages;
    expect(addElement(pages, at, "label", newId)).toEqual({ ok: false, reason: "blockFull" });
  });
});

describe("addBlock and the grid", () => {
  it("adds an empty grey block after the selected one and restarts the grid from the first layout for that count", () => {
    const page = emptyPage(2, "carosello_1_1");
    expect(page.grid.layoutId).toBe("two");
    const edit = ok(addBlock([page], page.pageKey, page.blocks[0]!.blockId, "carosello_1_1", TEMPLATE, ids()));
    const next = edit.pages[0]!;
    expect(next.blocks.map((b) => b.blockId)).toEqual([page.blocks[0]!.blockId, edit.selection.blockId, page.blocks[1]!.blockId]);
    expect(next.blocks[1]).toMatchObject({ name: dict.configurator.edit.newBlock, background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [] });
    const threeA = layouts("carosello_1_1", TEMPLATE).find((l) => l.layoutId === "three_a")!;
    expect(next.grid).toEqual({ layoutId: "three_a", rows: [...threeA.rows], cols: [...threeA.cols] });
    expect(edit.selection).toEqual({ pageKey: page.pageKey, blockId: next.blocks[1]!.blockId });
  });

  it("adds at the end with no block selected", () => {
    const page = emptyPage(2, "carosello_1_1");
    const edit = ok(addBlock([page], page.pageKey, undefined, "carosello_1_1", TEMPLATE, ids()));
    expect(edit.pages[0]!.blocks.at(-1)!.blockId).toBe(edit.selection.blockId);
  });

  it("refuses a 7th block", () => {
    const page = emptyPage(MAX_BLOCKS_PER_PAGE, "presentazione_16_9");
    expect(addBlock([page], page.pageKey, undefined, "presentazione_16_9", TEMPLATE, ids())).toEqual({ ok: false, reason: "pageFull" });
  });

  it("stacks the blocks in one column for a count the format has no layout for, and leaves an empty page's grid", () => {
    const one = emptyPage(1, "presentazione_16_9");
    expect(one.grid).toEqual({ layoutId: COLUMN_LAYOUT_ID, rows: [1], cols: [1] });
    expect(layouts("presentazione_16_9", TEMPLATE).some((l) => l.layoutId === COLUMN_LAYOUT_ID)).toBe(false);
    expect(emptyPage(5, "carosello_1_1").grid).toEqual({ layoutId: COLUMN_LAYOUT_ID, rows: [1, 1, 1, 1, 1], cols: [1] });
    expect(emptyPage(6, "video_9_16").grid.layoutId).toBe(COLUMN_LAYOUT_ID);
    // Presentazione's first 3-block layout is Risultati e testimonial's.
    expect(emptyPage(3, "presentazione_16_9").grid.layoutId).toBe("results");
    const page = emptyPage(2, "carosello_1_1");
    const grid = page.grid;
    page.blocks = [];
    restartGrid(page, "carosello_1_1", TEMPLATE);
    expect(page.grid).toBe(grid);
    expectValid([one]);
  });
});

describe("pasteBlock and withFreshIds", () => {
  it("pastes a copy with fresh ids after the selected block, selected", () => {
    const before = starter("presentazione_16_9");
    const source = before[0]!.blocks.find((b) => b.elements.some((e) => e.type === "row" || e.type === "text_group"))!;
    const target = withBlocks(before[1]!, 1, "presentazione_16_9");
    const pages = [before[0]!, target, ...before.slice(2)];
    const edit = ok(pasteBlock(pages, { pageKey: target.pageKey, blockId: target.blocks[0]!.blockId }, source, "presentazione_16_9", TEMPLATE, ids()));
    const pasted = edit.pages[1]!.blocks[1]!;
    expect(edit.selection).toEqual({ pageKey: target.pageKey, blockId: pasted.blockId });
    expect(pasted.blockId).not.toBe(source.blockId);
    expect(edit.pages[1]!.grid.layoutId).toBe("content_1");
    const all = (els: readonly DocumentElement[]): string[] =>
      els.flatMap((e) => (e.type === "text_group" || e.type === "row" ? [e.elementId, ...all(e.items)] : [e.elementId]));
    const sourceIds = new Set(all(source.elements));
    expect(all(pasted.elements).some((id) => sourceIds.has(id))).toBe(false);
    expect(all(pasted.elements)).toHaveLength(sourceIds.size);
    expectValid(edit.pages);
  });

  it("pastes at the end of a page selected alone, and refuses on a full page or with nothing selected", () => {
    const page = emptyPage(2, "carosello_1_1");
    const block = page.blocks[0]!;
    const edit = ok(pasteBlock([page], { pageKey: page.pageKey }, block, "carosello_1_1", TEMPLATE, ids()));
    expect(edit.pages[0]!.blocks).toHaveLength(3);
    expect(edit.pages[0]!.blocks[2]!.blockId).toBe(edit.selection.blockId);
    const full = emptyPage(MAX_BLOCKS_PER_PAGE, "presentazione_16_9");
    expect(pasteBlock([full], { pageKey: full.pageKey }, block, "presentazione_16_9", TEMPLATE, ids())).toEqual({ ok: false, reason: "pageFull" });
    expect(pasteBlock([page], null, block, "carosello_1_1", TEMPLATE, ids())).toEqual({ ok: false, reason: "nothing" });
  });

  it("leaves the block it copies untouched", () => {
    const block = starter("presentazione_16_9")[0]!.blocks[0]!;
    const before = structuredClone(block);
    withFreshIds(block, ids());
    expect(block).toEqual(before);
  });
});

describe("removeSelection", () => {
  it("removes the selected element and selects its block", () => {
    const before = starter("presentazione_16_9");
    const block = before[0]!.blocks[0]!;
    const element = block.elements[0]!;
    const edit = ok(removeSelection(before, { pageKey: before[0]!.pageKey, blockId: block.blockId, elementId: element.elementId }, "presentazione_16_9", TEMPLATE));
    expect(findElement(edit.pages[0]!.blocks[0]!.elements, element.elementId)).toBeUndefined();
    expect(edit.selection).toEqual({ pageKey: before[0]!.pageKey, blockId: block.blockId });
    expectValid(edit.pages);
  });

  it("removes a row with its last item, and clamps a split group's splitAt", () => {
    const page = emptyPage(1, "presentazione_16_9");
    const text = (id: string): TextElement => ({ elementId: id, type: "text", style: "text", text: "x", provenance: "human_added" });
    const T1 = "eeeeeeee-0000-4000-8000-0000000000a1";
    const T2 = "eeeeeeee-0000-4000-8000-0000000000a2";
    const T3 = "eeeeeeee-0000-4000-8000-0000000000a3";
    const ROW = "eeeeeeee-0000-4000-8000-0000000000b1";
    const GROUP = "eeeeeeee-0000-4000-8000-0000000000b2";
    page.blocks[0]!.elements = [
      { elementId: ROW, type: "row", align: "centre", items: [text(T1)] },
      { elementId: GROUP, type: "text_group", align: "split", splitAt: 2, items: [text(T2), text(T3)] },
    ];
    const at = { pageKey: page.pageKey, blockId: page.blocks[0]!.blockId };
    const noRow = ok(removeSelection([page], { ...at, elementId: T1 }, "presentazione_16_9", TEMPLATE)).pages;
    expect(noRow[0]!.blocks[0]!.elements.map((e) => e.elementId)).toEqual([GROUP]);
    const clamped = ok(removeSelection(noRow, { ...at, elementId: T3 }, "presentazione_16_9", TEMPLATE)).pages;
    expect(clamped[0]!.blocks[0]!.elements[0]).toMatchObject({ splitAt: 1, items: [{ elementId: T2 }] });
    expectValid(clamped);
    const none = ok(removeSelection(clamped, { ...at, elementId: T2 }, "presentazione_16_9", TEMPLATE)).pages;
    expect(none[0]!.blocks[0]!.elements).toEqual([]);
  });

  it("removes the selected block, selects its page and restarts the grid", () => {
    const page = emptyPage(3, "carosello_1_1");
    const removed = page.blocks[1]!.blockId;
    const edit = ok(removeSelection([page], { pageKey: page.pageKey, blockId: removed }, "carosello_1_1", TEMPLATE));
    expect(edit.pages[0]!.blocks.map((b) => b.blockId)).toEqual([page.blocks[0]!.blockId, page.blocks[2]!.blockId]);
    expect(edit.pages[0]!.grid.layoutId).toBe("two");
    expect(edit.selection).toEqual({ pageKey: page.pageKey });
  });

  it("removes nothing for a page alone, nothing selected or an unknown id", () => {
    const page = emptyPage(2, "carosello_1_1");
    for (const selection of [null, { pageKey: page.pageKey }, { pageKey: page.pageKey, blockId: "99999999-0000-4000-8000-000000000000" }]) {
      expect(removeSelection([page], selection, "carosello_1_1", TEMPLATE)).toEqual({ ok: false, reason: "nothing" });
    }
    expect(removeSelection([page], { pageKey: page.pageKey, blockId: page.blocks[0]!.blockId, elementId: "99999999-0000-4000-8000-000000000000" }, "carosello_1_1", TEMPLATE)).toEqual({
      ok: false,
      reason: "nothing",
    });
  });
});
