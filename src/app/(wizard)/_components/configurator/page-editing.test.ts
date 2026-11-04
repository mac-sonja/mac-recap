import { describe, expect, it } from "vitest";
import {
  blockSchema,
  caseHistoryV2,
  formatPagesSchema,
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
  addPage,
  applyLayout,
  BACKGROUND_SWATCHES,
  clearAssets,
  COLUMN_LAYOUT_ID,
  deletePage,
  insertAnimation,
  insertNewElement,
  MAX_ANIMATION_MEDIA,
  MAX_BLOCKS_PER_PAGE,
  MAX_ELEMENTS_PER_BLOCK,
  MAX_PAGES_PER_FORMAT,
  moveBlockToPage,
  moveElement,
  movePage,
  NEW_BLOCK_COLOUR,
  NEW_ELEMENTS,
  newElement,
  parseBackground,
  pasteBlock,
  placeMedia,
  removeSelection,
  restartGrid,
  setBackground,
  shuffleChoices,
  shuffleLayout,
  swapBlocks,
  swatchBackground,
  withAnimation,
  withCrop,
  withFit,
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

/** Uuids for the blocks an edit adds, distinct from `ids()`'s. */
function otherIds() {
  let n = 0;
  return () => `ffffffff-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

const layoutOf = (formatId: FormatId, layoutId: string) => layouts(formatId, TEMPLATE).find((l) => l.layoutId === layoutId)!;

/** A page with `filled` blocks holding a title, then `empty` empty blocks, in `formatId`. */
function mixedPage(filled: number, empty: number, formatId: FormatId): Page {
  const newId = ids();
  const page = emptyPage(filled + empty, formatId, newId);
  page.blocks.slice(0, filled).forEach((b) => b.elements.push(newElement("title", newId)));
  return page;
}

describe("applyLayout", () => {
  it("appends empty grey blocks for more cells and selects the page", () => {
    const page = mixedPage(2, 0, "carosello_1_1");
    const four = layoutOf("carosello_1_1", "four");
    const edit = ok(applyLayout([page], page.pageKey, four, otherIds()));
    const next = edit.pages[0]!;
    expect(next.blocks).toHaveLength(4);
    expect(next.blocks.slice(0, 2)).toEqual(page.blocks);
    expect(next.blocks.slice(2).every((b) => b.elements.length === 0 && b.background.kind === "colour" && b.background.value === NEW_BLOCK_COLOUR)).toBe(true);
    expect(next.grid).toEqual({ layoutId: "four", rows: [...four.rows], cols: [...four.cols] });
    expect(edit.selection).toEqual({ pageKey: page.pageKey });
    expectValid(edit.pages, "carosello_1_1");
  });

  it("removes empty blocks, last first, for fewer cells", () => {
    const page = mixedPage(2, 2, "carosello_1_1");
    page.blocks.unshift(page.blocks.pop()!); // an empty block first: it stays, the last empty one goes
    const edit = ok(applyLayout([page], page.pageKey, layoutOf("carosello_1_1", "three_a"), ids()));
    expect(edit.pages[0]!.blocks.map((b) => b.blockId)).toEqual(page.blocks.slice(0, 3).map((b) => b.blockId));
    const two = ok(applyLayout([mixedPage(2, 2, "carosello_1_1")], page.pageKey, layoutOf("carosello_1_1", "two"), ids()));
    expect(two.pages[0]!.blocks.every((b) => b.elements.length === 1)).toBe(true);
    expect(two.pages[0]!.grid.layoutId).toBe("two");
  });

  it("refuses when filled blocks would have to go, saying how many are over", () => {
    const four = mixedPage(4, 0, "carosello_1_1");
    expect(applyLayout([four], four.pageKey, layoutOf("carosello_1_1", "two"), ids())).toEqual({ ok: false, reason: "over", over: 2 });
    const three = mixedPage(3, 0, "carosello_1_1");
    expect(applyLayout([three], three.pageKey, layoutOf("carosello_1_1", "two"), ids())).toEqual({ ok: false, reason: "over", over: 1 });
  });

  it("counts a block with an image background as filled", () => {
    const page = mixedPage(2, 1, "carosello_1_1");
    page.blocks[2]!.background = { kind: "image", assetId: "aaaaaaaa-0000-4000-8000-000000000001" };
    expect(applyLayout([page], page.pageKey, layoutOf("carosello_1_1", "two"), ids())).toEqual({ ok: false, reason: "over", over: 1 });
  });

  it("does nothing for the pressed layout with its own track sizes, and resets changed sizes", () => {
    const page = mixedPage(3, 0, "carosello_1_1");
    expect(page.grid.layoutId).toBe("three_a");
    expect(applyLayout([page], page.pageKey, layoutOf("carosello_1_1", "three_a"), ids())).toEqual({ ok: false, reason: "nothing" });
    page.grid.rows = [2, 1];
    const edit = ok(applyLayout([page], page.pageKey, layoutOf("carosello_1_1", "three_a"), ids()));
    expect(edit.pages[0]!.grid.rows).toEqual([...layoutOf("carosello_1_1", "three_a").rows]);
  });

  it("changes only the page it is given", () => {
    const pages = [mixedPage(2, 0, "carosello_1_1"), { ...mixedPage(1, 0, "carosello_1_1"), pageKey: "other" }];
    const edit = ok(applyLayout(pages, pages[0]!.pageKey, layoutOf("carosello_1_1", "four"), ids()));
    expect(edit.pages[1]).toBe(pages[1]);
  });
});

describe("Mescola", () => {
  it("cycles through the layouts with the page's number of blocks, in order", () => {
    const pages = [mixedPage(3, 0, "carosello_1_1")];
    const once = shuffleLayout(pages, pages[0]!.pageKey, "carosello_1_1", TEMPLATE);
    const threeB = layoutOf("carosello_1_1", "three_b");
    expect(once[0]!.grid).toEqual({ layoutId: "three_b", rows: [...threeB.rows], cols: [...threeB.cols] });
    expect(once[0]!.blocks).toEqual(pages[0]!.blocks);
    expect(shuffleLayout(once, pages[0]!.pageKey, "carosello_1_1", TEMPLATE)[0]!.grid.layoutId).toBe("three_a");
  });

  it("goes from intro to only_layout and back in Presentazione, and from two to stack in Carosello", () => {
    const five = [mixedPage(5, 0, "presentazione_16_9")];
    expect(five[0]!.grid.layoutId).toBe("intro");
    const once = shuffleLayout(five, five[0]!.pageKey, "presentazione_16_9", TEMPLATE);
    expect(once[0]!.grid.layoutId).toBe("only_layout");
    expect(shuffleLayout(once, five[0]!.pageKey, "presentazione_16_9", TEMPLATE)[0]!.grid.layoutId).toBe("intro");
    const two = [mixedPage(2, 0, "carosello_1_1")];
    expect(shuffleLayout(two, two[0]!.pageKey, "carosello_1_1", TEMPLATE)[0]!.grid.layoutId).toBe("stack");
  });

  it("starts from the first layout off a grid that isn't among them", () => {
    const page = mixedPage(3, 0, "carosello_1_1");
    page.grid = { layoutId: COLUMN_LAYOUT_ID, rows: [1, 1, 1], cols: [1] };
    expect(shuffleLayout([page], page.pageKey, "carosello_1_1", TEMPLATE)[0]!.grid.layoutId).toBe("three_a");
  });

  it("has nothing to cycle through with one layout or none for the count", () => {
    expect(shuffleChoices("video_9_16", TEMPLATE, 3)).toHaveLength(1);
    expect(shuffleChoices("presentazione_16_9", TEMPLATE, 2)).toHaveLength(1);
    expect(shuffleChoices("carosello_1_1", TEMPLATE, 5)).toHaveLength(0);
    const pages = [mixedPage(3, 0, "video_9_16")];
    expect(shuffleLayout(pages, pages[0]!.pageKey, "video_9_16", TEMPLATE)).toBe(pages);
  });
});

describe("Sfondo", () => {
  it("sets the selected block's background, else the page's, and a swatch replaces an image", () => {
    const page = mixedPage(2, 0, "carosello_1_1");
    const blockId = page.blocks[1]!.blockId;
    const blue = setBackground([page], page.pageKey, blockId, swatchBackground("#2977ff"));
    expect(blue[0]!.blocks[1]!.background).toEqual({ kind: "colour", value: "#2977ff" });
    expect(blue[0]!.background).toEqual(page.background);
    const clear = setBackground([page], page.pageKey, undefined, swatchBackground("transparent"));
    expect(clear[0]!.background).toEqual({ kind: "transparent" });
    page.blocks[0]!.background = { kind: "image", assetId: "aaaaaaaa-0000-4000-8000-000000000001" };
    expect(setBackground([page], page.pageKey, page.blocks[0]!.blockId, swatchBackground("#ededf0"))[0]!.blocks[0]!.background).toEqual({ kind: "colour", value: "#ededf0" });
    expectValid(blue, "carosello_1_1");
  });

  it("keeps the pages when the background already has that colour, or the target is unknown", () => {
    const page = mixedPage(1, 0, "carosello_1_1");
    page.background = { kind: "colour", value: "#FFFFFF" };
    const pages = [page];
    expect(setBackground(pages, page.pageKey, undefined, { kind: "colour", value: "#ffffff" })).toBe(pages);
    expect(setBackground(pages, page.pageKey, "ffffffff-0000-4000-8000-000000000000", { kind: "transparent" })).toBe(pages);
    expect(setBackground(pages, "nope", undefined, { kind: "transparent" })).toBe(pages);
  });

  it("offers the template's palette and transparent", () => {
    expect(BACKGROUND_SWATCHES).toEqual(["#ffffff", "#ededf0", "#012234", "#defe56", "#2977ff", "transparent"]);
  });

  it("reads a typed #rrggbb (with or without #, any case) or Trasparente, and nothing else", () => {
    expect(parseBackground("defe56")).toEqual({ kind: "colour", value: "#defe56" });
    expect(parseBackground(" #2977FF ")).toEqual({ kind: "colour", value: "#2977ff" });
    expect(parseBackground("Trasparente")).toEqual({ kind: "transparent" });
    for (const bad of ["blu", "#fff", "#2977ff80", "", "#gggggg"]) expect(parseBackground(bad)).toBeUndefined();
  });
});

describe("placeMedia (Story 4.5b)", () => {
  const FILE = "aaaaaaaa-0000-4000-8000-000000000001";
  const CLIP = "aaaaaaaa-0000-4000-8000-000000000002";
  const OLD = "aaaaaaaa-0000-4000-8000-000000000003";
  const P = "dddddddd-0000-4000-8000-000000000001";
  const B = "dddddddd-0000-4000-8000-000000000002";
  const IMG = "dddddddd-0000-4000-8000-000000000003";
  const TXT = "dddddddd-0000-4000-8000-000000000004";
  const GROUP = "dddddddd-0000-4000-8000-000000000005";
  const INNER = "dddddddd-0000-4000-8000-000000000006";

  function pages(): Page[] {
    const page = structuredClone(starter("presentazione_16_9")[0]!);
    page.pageKey = P;
    page.blocks = [
      {
        blockId: B,
        name: "Blocco",
        background: { kind: "colour", value: NEW_BLOCK_COLOUR },
        elements: [
          { elementId: TXT, type: "text", style: "text", text: "Ciao", provenance: "human_added" },
          { elementId: IMG, type: "image", assetId: OLD, fit: "crop", crop: { x: 0.2, y: 0.3, zoom: 2 } },
          {
            elementId: GROUP,
            type: "text_group",
            align: "top",
            items: [{ elementId: INNER, type: "text", style: "title", text: "Titolo", provenance: "human_added" }],
          },
        ],
      },
    ];
    restartGrid(page, "presentazione_16_9", TEMPLATE);
    return [page];
  }
  const elementsOf = (edit: PageEdit) => (edit.ok ? edit.pages[0]!.blocks[0]!.elements : []);

  it("replaces the image under the pointer, takes the file's kind, keeps the fit and drops the crop", () => {
    const edit = placeMedia(pages(), { pageKey: P, blockId: B, elementId: IMG }, { id: CLIP, kind: "video" }, "before", ids());
    expect(edit).toMatchObject({ ok: true, selection: { pageKey: P, blockId: B, elementId: IMG } });
    expect(elementsOf(edit)[1]).toEqual({ elementId: IMG, type: "video", assetId: CLIP, fit: "crop" });
    expect(elementsOf(edit)).toHaveLength(3);
    expect(() => pageSchema.parse((edit as Extract<PageEdit, { ok: true }>).pages[0])).not.toThrow();
  });

  it("drops a new element before the element under the pointer", () => {
    const edit = placeMedia(pages(), { pageKey: P, blockId: B, elementId: TXT }, { id: FILE, kind: "image" }, "before", ids());
    const placed = elementsOf(edit)[0]!;
    expect(placed).toMatchObject({ type: "image", assetId: FILE, fit: "fill" });
    expect(edit).toMatchObject({ ok: true, selection: { elementId: placed.elementId } });
    expect(elementsOf(edit)).toHaveLength(4);
  });

  it("goes before the Testi group a target inside it belongs to", () => {
    const edit = placeMedia(pages(), { pageKey: P, blockId: B, elementId: INNER }, { id: FILE, kind: "image" }, "before", ids());
    expect(elementsOf(edit).map((el) => el.type)).toEqual(["text", "image", "image", "text_group"]);
  });

  it("goes at the end of the block when dropped on no element, or when a click adds it", () => {
    const dropped = placeMedia(pages(), { pageKey: P, blockId: B }, { id: FILE, kind: "video" }, "before", ids());
    expect(elementsOf(dropped).at(-1)).toMatchObject({ type: "video", assetId: FILE });
    const clicked = placeMedia(pages(), { pageKey: P, blockId: B, elementId: TXT }, { id: FILE, kind: "image" }, "end", ids());
    expect(elementsOf(clicked).at(-1)).toMatchObject({ type: "image", assetId: FILE });
  });

  it("refuses a drop outside every block, a full block, and the same file again", () => {
    expect(placeMedia(pages(), { pageKey: P }, { id: FILE, kind: "image" }, "before", ids())).toEqual({ ok: false, reason: "offBlock" });
    const full = pages();
    full[0]!.blocks[0]!.elements = Array.from({ length: MAX_ELEMENTS_PER_BLOCK }, (_, i) => ({
      elementId: `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      type: "divider" as const,
    }));
    expect(placeMedia(full, { pageKey: P, blockId: B }, { id: FILE, kind: "image" }, "end", ids())).toEqual({ ok: false, reason: "blockFull" });
    expect(placeMedia(pages(), { pageKey: P, blockId: B, elementId: IMG }, { id: OLD, kind: "image" }, "before", ids())).toEqual({ ok: false, reason: "nothing" });
  });

  it("clearAssets empties every image or video showing a refused file, and leaves the rest", () => {
    const before = pages();
    const next = clearAssets(before, [OLD.toUpperCase()]);
    expect(next[0]!.blocks[0]!.elements[1]).toMatchObject({ elementId: IMG, assetId: null });
    expect(next[0]!.blocks[0]!.elements[0]).toBe(before[0]!.blocks[0]!.elements[0]);
    expect(clearAssets(before, [FILE])).toBe(before);
  });

  it("clearAssets sets a page or block background showing a refused file back to its default colour", () => {
    const before = pages();
    before[0]!.background = { kind: "image", assetId: OLD };
    before[0]!.blocks[0]!.background = { kind: "image", assetId: OLD };
    const next = clearAssets(before, [OLD]);
    expect(next[0]!.background).toEqual({ kind: "colour", value: "#ffffff" });
    expect(next[0]!.blocks[0]!.background).toEqual({ kind: "colour", value: NEW_BLOCK_COLOUR });
    expect(() => pageSchema.parse(next[0])).not.toThrow();
  });
});

describe("withFit and withCrop (Story 4.5b-3)", () => {
  const P = "dddddddd-0000-4000-8000-000000000011";
  const IMG = "dddddddd-0000-4000-8000-000000000012";
  const TXT = "dddddddd-0000-4000-8000-000000000013";
  const FILE = "aaaaaaaa-0000-4000-8000-000000000011";
  function pages(el: Partial<Extract<DocumentElement, { type: "image" }>> = {}): Page[] {
    const page = structuredClone(starter("presentazione_16_9")[0]!);
    page.pageKey = P;
    page.blocks = [
      {
        blockId: "dddddddd-0000-4000-8000-000000000014",
        name: "Blocco",
        background: { kind: "colour", value: NEW_BLOCK_COLOUR },
        elements: [
          { elementId: TXT, type: "text", style: "text", text: "Ciao", provenance: "human_added" },
          { elementId: IMG, type: "image", assetId: FILE, fit: "fill", ...el },
        ],
      },
    ];
    restartGrid(page, "presentazione_16_9", TEMPLATE);
    return [page];
  }
  const media = (next: readonly Page[]) => next[0]!.blocks[0]!.elements[1]!;

  it("sets the fit, and drops the crop when leaving Ritaglia", () => {
    expect(media(withFit(pages(), P, IMG, "fit"))).toEqual({ elementId: IMG, type: "image", assetId: FILE, fit: "fit" });
    const cropped = pages({ fit: "crop", crop: { x: 0.2, y: 0.3, zoom: 2 } });
    const filled = withFit(cropped, P, IMG, "fill");
    expect(media(filled)).toEqual({ elementId: IMG, type: "image", assetId: FILE, fit: "fill" });
    expect(() => pageSchema.parse(filled[0])).not.toThrow();
  });

  it("changes nothing for the same fit, a text, or an unknown element", () => {
    const before = pages();
    expect(withFit(before, P, IMG, "fill")).toBe(before);
    expect(withFit(before, P, TXT, "fit")).toBe(before);
    expect(withFit(before, P, "dddddddd-0000-4000-8000-000000000099", "fit")).toBe(before);
  });

  it("sets a cropped image's crop, clamped to the schema's range, and only with Ritaglia", () => {
    const cropped = pages({ fit: "crop" });
    const next = withCrop(cropped, P, IMG, { x: -0.5, y: 1.4, zoom: 9 });
    expect(media(next)).toMatchObject({ fit: "crop", crop: { x: 0, y: 1, zoom: 4 } });
    expect(() => pageSchema.parse(next[0])).not.toThrow();
    expect(withCrop(next, P, IMG, { x: 0, y: 1, zoom: 4 })).toBe(next);
    const filled = pages();
    expect(withCrop(filled, P, IMG, { x: 0.5, y: 0.5, zoom: 2 })).toBe(filled);
  });

  it("works on a video too", () => {
    const video = pages();
    video[0]!.blocks[0]!.elements[1] = { elementId: IMG, type: "video", assetId: FILE, fit: "fill" };
    const next = withCrop(withFit(video, P, IMG, "crop"), P, IMG, { x: 0.1, y: 0.9, zoom: 1.5 });
    expect(media(next)).toEqual({ elementId: IMG, type: "video", assetId: FILE, fit: "crop", crop: { x: 0.1, y: 0.9, zoom: 1.5 } });
  });
});

describe("insertAnimation and withAnimation (Story 4.5c)", () => {
  const P = "dddddddd-0000-4000-8000-000000000021";
  const B = "dddddddd-0000-4000-8000-000000000022";
  const A1 = "aaaaaaaa-0000-4000-8000-000000000021";
  const A2 = "aaaaaaaa-0000-4000-8000-000000000022";
  function pages(): Page[] {
    const page = structuredClone(starter("presentazione_16_9")[0]!);
    page.pageKey = P;
    page.blocks = [
      { blockId: B, name: "Blocco", background: { kind: "colour", value: NEW_BLOCK_COLOUR }, elements: [{ elementId: "dddddddd-0000-4000-8000-000000000023", type: "text", style: "text", text: "Ciao", provenance: "human_added" }] },
    ];
    restartGrid(page, "presentazione_16_9", TEMPLATE);
    return [page];
  }

  it("inserts the animation at the end of the block, Adatta, media in order, and selects it", () => {
    const edit = insertAnimation(pages(), P, B, { animation: "carousel_03", assetIds: [A2, A1] }, ids());
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    const added = edit.pages[0]!.blocks[0]!.elements[1]!;
    expect(added).toEqual({ elementId: expect.any(String), type: "animation", animation: "carousel_03", assetIds: [A2, A1], fit: "fit" });
    expect(edit.selection).toEqual({ pageKey: P, blockId: B, elementId: added.elementId });
    expect(() => pageSchema.parse(edit.pages[0])).not.toThrow();
  });

  it("MAX_ANIMATION_MEDIA is the schema's limit", () => {
    const ok = insertAnimation(pages(), P, B, { animation: "wheel_02", assetIds: Array.from({ length: MAX_ANIMATION_MEDIA }, () => A1) }, ids());
    if (!ok.ok) throw new Error("insert");
    expect(() => pageSchema.parse(ok.pages[0])).not.toThrow();
    const over = insertAnimation(pages(), P, B, { animation: "wheel_02", assetIds: Array.from({ length: MAX_ANIMATION_MEDIA + 1 }, () => A1) }, ids());
    if (!over.ok) throw new Error("insert");
    expect(() => pageSchema.parse(over.pages[0])).toThrow();
  });

  it("refuses an unknown block and a full one", () => {
    expect(insertAnimation(pages(), P, "dddddddd-0000-4000-8000-000000000099", { animation: "wheel_02", assetIds: [A1] }, ids())).toEqual({ ok: false, reason: "noBlock" });
    const full = pages();
    full[0]!.blocks[0]!.elements = Array.from({ length: MAX_ELEMENTS_PER_BLOCK }, (_, i) => ({ elementId: `cccccccc-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, type: "divider" as const }));
    expect(insertAnimation(full, P, B, { animation: "wheel_02", assetIds: [A1] }, ids())).toEqual({ ok: false, reason: "blockFull" });
  });

  it("patches type, media, fit and size (clamped), and changes nothing for the same values or another element", () => {
    const edit = insertAnimation(pages(), P, B, { animation: "carousel_01", assetIds: [A1] }, ids());
    if (!edit.ok) throw new Error("insert");
    const id = edit.selection.elementId!;
    const next = withAnimation(edit.pages, P, id, { animation: "wheel_02", assetIds: [A1, A2], fit: "fill", size: 200 });
    expect(next[0]!.blocks[0]!.elements[1]).toMatchObject({ animation: "wheel_02", assetIds: [A1, A2], fit: "fill", size: 150 });
    expect(withAnimation(next, P, id, { animation: "wheel_02", fit: "fill", size: 150 })).toBe(next);
    expect(withAnimation(next, P, "dddddddd-0000-4000-8000-000000000023", { fit: "fit" })).toBe(next);
  });
});

describe("addPage, deletePage and movePage (Story 4.13)", () => {
  const all = () => starter("presentazione_16_9");
  const sections = (pages: readonly Page[]) => pages.map((p) => p.section);

  it("adds Nuova pagina after the given page, in its section, white with one empty block, and selects it", () => {
    const pages = all();
    const at = pages.findIndex((p) => p.section === "intro");
    const edit = addPage(pages, pages[at]!.pageKey, "presentazione_16_9", TEMPLATE, ids());
    if (!edit.ok) throw new Error("add");
    const added = edit.pages[at + 1]!;
    expect(added).toMatchObject({ name: dict.configurator.pages.newPage, role: "body", section: "intro", background: { kind: "colour", value: BACKGROUND_SWATCHES[0] } });
    expect(added.blocks).toHaveLength(1);
    expect(added.blocks[0]!.elements).toEqual([]);
    expect(added.pageKey).toMatch(/^p-/);
    expect(edit.selection).toEqual({ pageKey: added.pageKey });
    expect(() => pageSchema.parse(added)).not.toThrow();
    expect(edit.pages).toHaveLength(pages.length + 1);
  });

  it("with no page given, adds at the end of Output, keeping the sections together", () => {
    const pages = all();
    const edit = addPage(pages, undefined, "presentazione_16_9", TEMPLATE, ids());
    if (!edit.ok) throw new Error("add");
    const order = sections(edit.pages);
    expect(order.lastIndexOf("output")).toBe(order.indexOf("risultati") - 1);
    expect(edit.pages[order.lastIndexOf("output")]!.name).toBe(dict.configurator.pages.newPage);
    const empty = addPage([], undefined, "presentazione_16_9", TEMPLATE, ids());
    expect(empty).toMatchObject({ ok: true });
  });

  it("MAX_PAGES_PER_FORMAT is the schema's limit", () => {
    const one = all()[0]!;
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...one, pageKey: `k${i}` }));
    expect(formatPagesSchema.safeParse({ pages: many(MAX_PAGES_PER_FORMAT) }).success).toBe(true);
    expect(formatPagesSchema.safeParse({ pages: many(MAX_PAGES_PER_FORMAT + 1) }).success).toBe(false);
  });

  it("with no Output page, adds after the last Intro page; an Intro page moved below Output doesn't pull it down", () => {
    const pages = all();
    const noOutput = pages.filter((pg) => pg.section !== "output");
    const edit = addPage(noOutput, undefined, "presentazione_16_9", TEMPLATE, ids());
    if (!edit.ok) throw new Error("add");
    const at = edit.pages.findIndex((pg) => pg.name === dict.configurator.pages.newPage);
    expect(at).toBe(noOutput.filter((pg) => pg.section === "intro").length);
    const intro = pages.find((pg) => pg.section === "intro")!;
    const moved = movePage(pages, intro.pageKey, pages.at(-1)!.pageKey);
    const after = addPage(moved, undefined, "presentazione_16_9", TEMPLATE, ids());
    if (!after.ok) throw new Error("add");
    const order = after.pages.map((pg) => pg.section);
    const added = after.pages.findIndex((pg) => pg.name === dict.configurator.pages.newPage);
    expect(order.slice(added + 1)).not.toContain("output");
    expect(order[added - 1]).toBe("output");
  });

  it("refuses a 51st page", () => {
    const one = all()[0]!;
    const full = Array.from({ length: MAX_PAGES_PER_FORMAT }, (_, i) => ({ ...one, pageKey: `k${i}` }));
    expect(addPage(full, undefined, "presentazione_16_9", TEMPLATE, ids())).toEqual({ ok: false, reason: "formatFull" });
  });

  it("deletes a page, and changes nothing for an unknown one", () => {
    const pages = all();
    const next = deletePage(pages, pages[1]!.pageKey);
    expect(next.map((p) => p.pageKey)).toEqual(pages.filter((_, i) => i !== 1).map((p) => p.pageKey));
    expect(deletePage(pages, "missing")).toBe(pages);
  });

  it("moves a page before a page above it or after a page below it, keeping its section", () => {
    const pages = all();
    const keys = pages.map((p) => p.pageKey);
    const down = movePage(pages, keys[0]!, keys[2]!);
    expect(down.map((p) => p.pageKey).slice(0, 3)).toEqual([keys[1], keys[2], keys[0]]);
    expect(down[2]!.section).toBe(pages[0]!.section);
    const up = movePage(pages, keys[2]!, keys[0]!);
    expect(up.map((p) => p.pageKey).slice(0, 3)).toEqual([keys[2], keys[0], keys[1]]);
    expect(movePage(pages, keys[1]!, keys[1]!)).toBe(pages);
  });
});

describe("drag-and-drop edits (Story 4.3e)", () => {
  const F: FormatId = "presentazione_16_9";
  const P1 = "p1";
  const P2 = "p2";
  const B1 = "ffffffff-0000-4000-8000-000000000001";
  const B2 = "ffffffff-0000-4000-8000-000000000002";
  const B3 = "ffffffff-0000-4000-8000-000000000003";
  const T1 = "ffffffff-0000-4000-8000-000000000011";
  const T2 = "ffffffff-0000-4000-8000-000000000012";
  const T3 = "ffffffff-0000-4000-8000-000000000013";
  const IMG = "ffffffff-0000-4000-8000-000000000014";
  const GROUP = "ffffffff-0000-4000-8000-000000000021";
  const G1 = "ffffffff-0000-4000-8000-000000000022";
  const G2 = "ffffffff-0000-4000-8000-000000000023";
  const ROW = "ffffffff-0000-4000-8000-000000000031";
  const R1 = "ffffffff-0000-4000-8000-000000000032";
  const text = (id: string): TextElement => ({ elementId: id, type: "text", style: "text", text: "x", provenance: "human_added" });
  const block = (blockId: string, elements: DocumentElement[], colour = NEW_BLOCK_COLOUR): Block => ({ blockId, name: "B", background: { kind: "colour", value: colour }, elements });

  /** Page 1: a block of three texts, a block with a split group, a row and an image. Page 2: one block of one text. */
  function pages(): Page[] {
    const base = starter(F)[0]!;
    const one: Page = {
      ...structuredClone(base),
      pageKey: P1,
      blocks: [
        block(B1, [text(T1), text(T2), text(T3)]),
        block(
          B2,
          [
            { elementId: GROUP, type: "text_group", align: "split", splitAt: 2, items: [text(G1), text(G2)] },
            { elementId: ROW, type: "row", align: "centre", items: [text(R1)] },
            { elementId: IMG, type: "image", assetId: null, fit: "fill" },
          ],
          "#2977ff",
        ),
      ],
    };
    const two: Page = { ...structuredClone(base), pageKey: P2, blocks: [block(B3, [text("ffffffff-0000-4000-8000-000000000041")])] };
    restartGrid(one, F, TEMPLATE);
    restartGrid(two, F, TEMPLATE);
    return [one, two];
  }
  const ids1 = (pages: readonly Page[], p: number, b: number) => pages[p]!.blocks[b]!.elements.map((e) => e.elementId);
  /** Every element id of a format's pages, groups and rows included. */
  const allIds = (pages: readonly Page[]) =>
    pages.flatMap((p) => [
      ...p.blocks.map((b) => b.blockId),
      ...p.blocks.flatMap((b) => b.elements.flatMap((e) => (e.type === "text_group" || e.type === "row" ? [e.elementId, ...e.items.map((i) => i.elementId)] : [e.elementId]))),
    ]);
  const expectUnique = (pages: readonly Page[]) => expect(new Set(allIds(pages)).size).toBe(allIds(pages).length);

  it("insertNewElement puts the new element before the top-level element under the pointer, else at the end, and selects it", () => {
    const before = pages();
    const edit = ok(insertNewElement(before, { pageKey: P1, blockId: B1, beforeElementId: T2 }, "text", ids()));
    const added = edit.pages[0]!.blocks[0]!.elements[1]!;
    expect(added).toMatchObject({ type: "text", text: dict.configurator.newTexts.text, provenance: "human_added" });
    expect(ids1(edit.pages, 0, 0)).toEqual([T1, added.elementId, T2, T3]);
    expect(edit.selection).toEqual({ pageKey: P1, blockId: B1, elementId: added.elementId });
    expect(edit.pages[1]).toBe(before[1]);
    // Inside a group: before the group.
    const inGroup = ok(insertNewElement(before, { pageKey: P1, blockId: B2, beforeElementId: G2 }, "image", ids()));
    expect(inGroup.pages[0]!.blocks[1]!.elements[0]!.type).toBe("image");
    expect(inGroup.pages[0]!.blocks[1]!.elements[1]!.elementId).toBe(GROUP);
    const atEnd = ok(insertNewElement(before, { pageKey: P1, blockId: B1 }, "group", ids()));
    expect(atEnd.pages[0]!.blocks[0]!.elements.at(-1)!.type).toBe("text_group");
    expectValid(atEnd.pages);
    expectUnique(atEnd.pages);
  });

  it("insertNewElement refuses off every block and in a full block", () => {
    const before = pages();
    expect(insertNewElement(before, { pageKey: P1 }, "text", ids())).toEqual({ ok: false, reason: "offBlock" });
    before[0]!.blocks[0]!.elements = Array.from({ length: MAX_ELEMENTS_PER_BLOCK }, (_, i) => text(`ffffffff-0000-4000-8000-1${String(i).padStart(11, "0")}`));
    expect(insertNewElement(before, { pageKey: P1, blockId: B1, beforeElementId: before[0]!.blocks[0]!.elements[1]!.elementId }, "text", ids())).toEqual({
      ok: false,
      reason: "blockFull",
    });
  });

  it("moveElement within a block: a target after the element shifts by one; in place is a no-op", () => {
    const before = pages();
    const from = { pageKey: P1, blockId: B1, elementId: T1 };
    const down = ok(moveElement(before, from, { pageKey: P1, blockId: B1, beforeElementId: T3 }));
    expect(ids1(down.pages, 0, 0)).toEqual([T2, T1, T3]);
    expect(down.selection).toEqual({ pageKey: P1, blockId: B1, elementId: T1 });
    const end = ok(moveElement(before, from, { pageKey: P1, blockId: B1 }));
    expect(ids1(end.pages, 0, 0)).toEqual([T2, T3, T1]);
    const up = ok(moveElement(before, { ...from, elementId: T3 }, { pageKey: P1, blockId: B1, beforeElementId: T1 }));
    expect(ids1(up.pages, 0, 0)).toEqual([T3, T1, T2]);
    for (const beforeElementId of [T1, T2]) expect(moveElement(before, from, { pageKey: P1, blockId: B1, beforeElementId })).toEqual({ ok: false, reason: "nothing" });
    expect(moveElement(before, { ...from, elementId: T3 }, { pageKey: P1, blockId: B1 })).toEqual({ ok: false, reason: "nothing" });
  });

  it("moveElement to another block and another page, removing it where it was", () => {
    const before = pages();
    const edit = ok(moveElement(before, { pageKey: P1, blockId: B1, elementId: T2 }, { pageKey: P2, blockId: B3 }));
    expect(ids1(edit.pages, 0, 0)).toEqual([T1, T3]);
    expect(ids1(edit.pages, 1, 0).at(-1)).toBe(T2);
    expect(edit.selection).toEqual({ pageKey: P2, blockId: B3, elementId: T2 });
    expectValid(edit.pages);
    expectUnique(edit.pages);
    const other = ok(moveElement(before, { pageKey: P1, blockId: B1, elementId: T1 }, { pageKey: P1, blockId: B2, beforeElementId: IMG }));
    expect(ids1(other.pages, 0, 1)).toEqual([GROUP, ROW, T1, IMG]);
    expect(other.pages[1]).toBe(before[1]);
  });

  it("moveElement takes a text out of a group (splitAt kept within its texts) and out of a row (an empty row goes)", () => {
    const before = pages();
    const out = ok(moveElement(before, { pageKey: P1, blockId: B2, elementId: G2 }, { pageKey: P1, blockId: B1, beforeElementId: T1 }));
    expect(ids1(out.pages, 0, 0)).toEqual([G2, T1, T2, T3]);
    expect(out.pages[0]!.blocks[1]!.elements[0]).toMatchObject({ elementId: GROUP, splitAt: 1, items: [{ elementId: G1 }] });
    expectValid(out.pages);
    const row = ok(moveElement(before, { pageKey: P1, blockId: B2, elementId: R1 }, { pageKey: P1, blockId: B2 }));
    expect(ids1(row.pages, 0, 1)).toEqual([GROUP, IMG, R1]);
    expectValid(row.pages);
    // Out of its group to just before the group, in the same block: it leaves the group.
    const front = ok(moveElement(before, { pageKey: P1, blockId: B2, elementId: G1 }, { pageKey: P1, blockId: B2, beforeElementId: G2 }));
    expect(ids1(front.pages, 0, 1)).toEqual([G1, GROUP, ROW, IMG]);
    expect((front.pages[0]!.blocks[1]!.elements[1] as TextGroupElement).items.map((i) => i.elementId)).toEqual([G2]);
    expectValid(front.pages);
    // The row's only text dropped after the row: the row goes, the text takes its place.
    const same = ok(moveElement(before, { pageKey: P1, blockId: B2, elementId: R1 }, { pageKey: P1, blockId: B2, beforeElementId: IMG }));
    expect(ids1(same.pages, 0, 1)).toEqual([GROUP, R1, IMG]);
    // A group dropped on its own text stays.
    expect(moveElement(before, { pageKey: P1, blockId: B2, elementId: GROUP }, { pageKey: P1, blockId: B2, beforeElementId: G1 })).toEqual({ ok: false, reason: "nothing" });
  });

  it("moveElement refuses a full target block, off every block, and an unknown element", () => {
    const before = pages();
    before[1]!.blocks[0]!.elements = Array.from({ length: MAX_ELEMENTS_PER_BLOCK }, (_, i) => text(`ffffffff-0000-4000-8000-2${String(i).padStart(11, "0")}`));
    const from = { pageKey: P1, blockId: B1, elementId: T1 };
    expect(moveElement(before, from, { pageKey: P2, blockId: B3 })).toEqual({ ok: false, reason: "blockFull" });
    expect(moveElement(before, from, { pageKey: P2 })).toEqual({ ok: false, reason: "offBlock" });
    expect(moveElement(before, { ...from, elementId: "missing" }, { pageKey: P1, blockId: B2 })).toEqual({ ok: false, reason: "nothing" });
    // Out of a group to the top level of a full block: refused.
    const full = pages();
    full[0]!.blocks[1]!.elements.push(...Array.from({ length: MAX_ELEMENTS_PER_BLOCK - 3 }, (_, i) => text(`ffffffff-0000-4000-8000-3${String(i).padStart(11, "0")}`)));
    expect(moveElement(full, { pageKey: P1, blockId: B2, elementId: G1 }, { pageKey: P1, blockId: B2 })).toEqual({ ok: false, reason: "blockFull" });
  });

  it("swapBlocks swaps two blocks on one page or across pages, each keeping its contents and background, the grids kept", () => {
    const before = pages();
    const same = ok(swapBlocks(before, { pageKey: P1, blockId: B1 }, { pageKey: P1, blockId: B2 }));
    expect(same.pages[0]!.blocks.map((b) => b.blockId)).toEqual([B2, B1]);
    expect(same.pages[0]!.blocks[0]).toEqual(before[0]!.blocks[1]);
    expect(same.pages[0]!.grid).toEqual(before[0]!.grid);
    expect(same.selection).toEqual({ pageKey: P1, blockId: B1 });
    const across = ok(swapBlocks(before, { pageKey: P1, blockId: B2 }, { pageKey: P2, blockId: B3 }));
    expect(across.pages[0]!.blocks.map((b) => b.blockId)).toEqual([B1, B3]);
    expect(across.pages[1]!.blocks[0]).toEqual(before[0]!.blocks[1]);
    expect(across.pages.map((p) => p.grid)).toEqual(before.map((p) => p.grid));
    expect(across.selection).toEqual({ pageKey: P2, blockId: B2 });
    expectValid(across.pages);
    expectUnique(across.pages);
    expect(swapBlocks(before, { pageKey: P1, blockId: B1 }, { pageKey: P1, blockId: B1 })).toEqual({ ok: false, reason: "nothing" });
    expect(swapBlocks(before, { pageKey: P1, blockId: "missing" }, { pageKey: P1, blockId: B1 })).toEqual({ ok: false, reason: "nothing" });
  });

  it("moveBlockToPage moves a block to another page's end and restarts both grids; refuses a full page and its own page", () => {
    const before = pages();
    const edit = ok(moveBlockToPage(before, { pageKey: P1, blockId: B1 }, P2, F, TEMPLATE));
    expect(edit.pages[0]!.blocks.map((b) => b.blockId)).toEqual([B2]);
    expect(edit.pages[1]!.blocks.map((b) => b.blockId)).toEqual([B3, B1]);
    for (const page of edit.pages) {
      const expected = structuredClone(page);
      restartGrid(expected, F, TEMPLATE);
      expect(page.grid).toEqual(expected.grid);
    }
    expect(edit.selection).toEqual({ pageKey: P2, blockId: B1 });
    expectValid(edit.pages);
    expect(moveBlockToPage(before, { pageKey: P1, blockId: B1 }, P1, F, TEMPLATE)).toEqual({ ok: false, reason: "nothing" });
    const full = pages();
    full[1] = { ...emptyPage(MAX_BLOCKS_PER_PAGE, F), pageKey: P2 };
    expect(moveBlockToPage(full, { pageKey: P1, blockId: B1 }, P2, F, TEMPLATE)).toEqual({ ok: false, reason: "pageFull" });
  });
});
