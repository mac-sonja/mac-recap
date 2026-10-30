import { describe, expect, it } from "vitest";
import { caseHistoryV2, validateNewDocument, type Block, type Page, type TextElement, type TextGroupElement } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { ownTextIds } from "./in-place-text";
import { isOwnText, parseColour, shownColour, textElementAt, withGroupAlign, withText, withTextSettings } from "./text-editing";

const pages = (): Page[] => caseHistoryV2(FORMAT_IDS).formats.presentazione_16_9!.pages;

/** Every text of `pages` (inside groups and rows too), with its page. */
function texts(list: readonly Page[]): { pageKey: string; el: TextElement }[] {
  const out: { pageKey: string; el: TextElement }[] = [];
  for (const page of list) {
    const walk = (elements: Page["blocks"][number]["elements"]) => {
      for (const el of elements) {
        if (el.type === "text") out.push({ pageKey: page.pageKey, el });
        if (el.type === "text_group" || el.type === "row") walk(el.items);
      }
    };
    for (const block of page.blocks) walk(block.elements);
  }
  return out;
}

describe("withText", () => {
  it("sets an own text and marks a generated one human_edited, leaving every other page as it was", () => {
    const before = pages();
    const target = texts(before).find(({ el }) => isOwnText(el) && el.provenance === "generated")!;
    const after = withText(before, target.pageKey, target.el.elementId, "Nuove parole\nsu due righe");
    expect(textElementAt(after, target.pageKey, target.el.elementId)).toMatchObject({ text: "Nuove parole\nsu due righe", provenance: "human_edited" });
    expect(textElementAt(before, target.pageKey, target.el.elementId)?.text).toBe(target.el.text);
    for (const [i, page] of after.entries()) if (page.pageKey !== target.pageKey) expect(page).toBe(before[i]);
  });

  it("keeps human_added", () => {
    const before = pages();
    const target = texts(before).find(({ el }) => isOwnText(el))!;
    target.el.provenance = "human_added";
    const after = withText(before, target.pageKey, target.el.elementId, "x");
    expect(textElementAt(after, target.pageKey, target.el.elementId)?.provenance).toBe("human_added");
  });

  it("returns the same pages for the same words, a bound text or an unknown id", () => {
    const before = pages();
    const own = texts(before).find(({ el }) => isOwnText(el))!;
    expect(withText(before, own.pageKey, own.el.elementId, own.el.text!)).toBe(before);
    const bound = texts(before).find(({ el }) => !isOwnText(el));
    if (bound) expect(withText(before, bound.pageKey, bound.el.elementId, "x")).toBe(before);
    expect(withText(before, own.pageKey, "99999999-0000-4000-8000-000000000000", "x")).toBe(before);
  });
});

describe("ownTextIds", () => {
  it("lists exactly the texts holding their own words, inside groups and rows too", () => {
    for (const page of pages()) {
      const expected = texts([page]).filter(({ el }) => isOwnText(el)).map(({ el }) => el.elementId);
      expect(ownTextIds(page)).toEqual(expected);
    }
  });
});

/** Every Testi group of `pages`, with its page. */
function groups(list: readonly Page[]): { pageKey: string; el: TextGroupElement }[] {
  return list.flatMap((page) =>
    page.blocks.flatMap((block) => block.elements.filter((el): el is TextGroupElement => el.type === "text_group").map((el) => ({ pageKey: page.pageKey, el }))),
  );
}

describe("withTextSettings", () => {
  it("changes the style, drops the template size and keeps the words and provenance", () => {
    const before = pages();
    const target = texts(before).find(({ el }) => el.size !== undefined)!;
    const style = target.el.style === "text" ? "title" : "text";
    const after = withTextSettings(before, target.pageKey, target.el.elementId, { style });
    const el = textElementAt(after, target.pageKey, target.el.elementId)!;
    expect(el).toMatchObject({ style, provenance: target.el.provenance, text: target.el.text });
    expect(el.size).toBeUndefined();
    expect(textElementAt(before, target.pageKey, target.el.elementId)?.size).toBe(target.el.size);
  });

  it("sets and clears align and columns, and sets a colour", () => {
    const before = pages();
    const { pageKey, el } = texts(before).find(({ el }) => el.align === undefined && el.columns === undefined)!;
    let after = withTextSettings(before, pageKey, el.elementId, { align: "centre" });
    after = withTextSettings(after, pageKey, el.elementId, { columns: 2 });
    after = withTextSettings(after, pageKey, el.elementId, { colour: "#defe56" });
    expect(textElementAt(after, pageKey, el.elementId)).toMatchObject({ align: "centre", columns: 2, colour: "#defe56" });
    after = withTextSettings(after, pageKey, el.elementId, { align: "left" });
    after = withTextSettings(after, pageKey, el.elementId, { columns: 1 });
    const back = textElementAt(after, pageKey, el.elementId)!;
    expect("align" in back).toBe(false);
    expect("columns" in back).toBe(false);
  });

  it("restyles a bound text without touching its binding", () => {
    const before = pages();
    const bound = texts(before).find(({ el }) => !isOwnText(el))!;
    const after = withTextSettings(before, bound.pageKey, bound.el.elementId, { align: "right" });
    const el = textElementAt(after, bound.pageKey, bound.el.elementId)!;
    expect(el).toMatchObject({ align: "right", provenance: bound.el.provenance });
    expect(el.binding ?? el.bindings).toEqual(bound.el.binding ?? bound.el.bindings);
  });

  it("returns the same pages when nothing changes", () => {
    const before = pages();
    const { pageKey, el } = texts(before)[0]!;
    expect(withTextSettings(before, pageKey, el.elementId, { style: el.style })).toBe(before);
    expect(withTextSettings(before, pageKey, el.elementId, { align: el.align ?? "left" })).toBe(before);
    expect(withTextSettings(before, pageKey, "99999999-0000-4000-8000-000000000000", { columns: 2 })).toBe(before);
  });

  it("treats a template colour in upper case, and an explicit left or one column, as no change", () => {
    const own = pages();
    const { pageKey, el } = texts(own)[0]!;
    el.colour = "#DEFE56";
    el.align = "left";
    el.columns = 1;
    expect(withTextSettings(own, pageKey, el.elementId, { colour: "#defe56" })).toBe(own);
    expect(withTextSettings(own, pageKey, el.elementId, { align: "left" })).toBe(own);
    expect(withTextSettings(own, pageKey, el.elementId, { columns: 1 })).toBe(own);
  });
});

describe("withGroupAlign", () => {
  it("splits with the first text on top, and drops splitAt otherwise; the result stays valid", () => {
    const before = pages();
    const { pageKey, el } = groups(before).find(({ el }) => el.align !== "split" && el.items.length > 1)!;
    const split = withGroupAlign(before, pageKey, el.elementId, "split");
    expect(groups(split).find((g) => g.el.elementId === el.elementId)!.el).toMatchObject({ align: "split", splitAt: 1 });
    const top = withGroupAlign(split, pageKey, el.elementId, "bottom");
    const back = groups(top).find((g) => g.el.elementId === el.elementId)!.el;
    expect(back.align).toBe("bottom");
    expect("splitAt" in back).toBe(false);
    const doc = caseHistoryV2(FORMAT_IDS);
    doc.formats.presentazione_16_9!.pages = [...split];
    expect(validateNewDocument(doc)).toMatchObject({ ok: true });
  });

  it("keeps a split group's splitAt, and returns the same pages for the same alignment", () => {
    const before = pages();
    const { pageKey, el } = groups(before).find(({ el }) => el.items.length > 1)!;
    const split = withGroupAlign(before, pageKey, el.elementId, "split");
    const g = groups(split).find((x) => x.el.elementId === el.elementId)!.el;
    g.splitAt = 2;
    expect(withGroupAlign(split, pageKey, el.elementId, "split")).toBe(split);
    expect(withGroupAlign(before, pageKey, el.elementId, el.align)).toBe(before);
  });
});

describe("parseColour", () => {
  it.each([
    ["2977ff", "#2977ff"],
    ["#DEFE56", "#defe56"],
    [" #01223499 ", "#01223499"],
    ["Trasparente", "transparent"],
    ["blu", undefined],
    ["#12345", undefined],
  ])("%s → %s", (typed, expected) => {
    expect(parseColour(typed)).toBe(expected);
  });
});

describe("shownColour", () => {
  const text = { colour: undefined } as unknown as TextElement;
  const block = (over: Partial<Block>) => ({ background: { kind: "colour", value: "#ededf0" }, ...over }) as Block;
  it("is the text's colour, else the block's ink, else white on a photo, else the template's ink", () => {
    expect(shownColour({ ...text, colour: "#2977ff" }, block({}))).toBe("#2977ff");
    expect(shownColour(text, block({ ink: "#ffffff" }))).toBe("#ffffff");
    expect(shownColour(text, block({ background: { kind: "image", assetId: "99999999-0000-4000-8000-000000000000" } }))).toBe("#ffffff");
    expect(shownColour(text, block({}))).toBe("#012234");
  });
});
