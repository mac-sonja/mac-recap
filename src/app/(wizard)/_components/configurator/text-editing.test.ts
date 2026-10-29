import { describe, expect, it } from "vitest";
import { caseHistoryV2, type Page, type TextElement } from "@/modules/generation";
import { FORMAT_IDS } from "@/modules/rendering";
import { ownTextIds } from "./in-place-text";
import { isOwnText, textElementAt, withText } from "./text-editing";

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
