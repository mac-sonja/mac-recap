import { describe, expect, it } from "vitest";
import type { Page } from "@/modules/generation";
import { FORMAT_IDS, type FormatId } from "@/modules/rendering";
import {
  collectionSegments,
  EMPTY_VALUES,
  freeTextIn,
  matchesTags,
  movedPageOrder,
  NO_EDITS,
  partOfKey,
  shownPagesOfPart,
  withCaseMoved,
  withGroupMoved,
  type CollectionGroup,
  type PartPages,
  type ViewEdits,
} from "./collection-file";

const page = (pageKey: string, role: string): Page => ({ pageKey, name: pageKey, role, section: "output", blocks: [] }) as unknown as Page;

/** A document with the same pages in every format. */
function part(pages: Page[]): PartPages {
  return {
    template: "mac-case@1",
    formats: Object.fromEntries(FORMAT_IDS.map((id) => [id, pages])) as unknown as Record<FormatId, readonly Page[]>,
    values: EMPTY_VALUES,
  };
}
const casePart = (id: string) => part([page(`${id}-intro`, "intro"), page(`${id}-body`, "body"), page("closing", "outro")]);
const introPart = () => part([page("hello", "intro"), page("bye", "outro")]);

const group = (clientId: string, cases: string[], intro: PartPages | null, unavailable: string[] = []): CollectionGroup => ({
  clientId,
  clientName: clientId.toUpperCase(),
  intro,
  cases: cases.map((caseId) => ({ caseId, name: caseId, code: caseId.toUpperCase(), part: unavailable.includes(caseId) ? null : casePart(caseId) })),
});

const shape = (groups: CollectionGroup[], formatId: FormatId = "presentazione_16_9") =>
  collectionSegments(groups, formatId).map((s) => `${s.key}:${s.pages.map((p) => p.pageKey.split("|")[1]).join(",")}`);

describe("a collection's pages (Story 5.10a)", () => {
  it("wraps a client with 2+ cases and an approved intro in its intro and closing, dropping the cases' own intros", () => {
    expect(shape([group("a", ["a1", "a2"], introPart()), group("b", ["b1"], introPart())])).toEqual([
      "client_intro:a:hello",
      "case:a1:a1-body,closing",
      "case:a2:a2-body,closing",
      "client_closing:a:bye",
      // B has one case: whole, with its own intro, and B's intro never shows.
      "case:b1:b1-intro,b1-body,closing",
    ]);
  });

  it("drops each case's own Chiusura in Carosello when wrapped", () => {
    expect(shape([group("a", ["a1", "a2"], introPart())], "carosello_1_1")).toEqual(["client_intro:a:hello", "case:a1:a1-body", "case:a2:a2-body", "client_closing:a:bye"]);
  });

  it("keeps each case whole without an approved intro", () => {
    expect(shape([group("a", ["a1", "a2"], null)])).toEqual(["case:a1:a1-intro,a1-body,closing", "case:a2:a2-intro,a2-body,closing"]);
  });

  it("lists a case with no approved revision where it sits, with no pages, and counts it out of the intro rule", () => {
    const segments = collectionSegments([group("a", ["a1", "a2"], introPart(), ["a2"])], "presentazione_16_9");
    expect(segments.map((s) => `${s.key}:${s.kind}:${s.pages.length}`)).toEqual(["case:a1:case:3", "case:a2:unavailable:0"]);
  });

  it("prefixes page keys with their segment, so repeated keys stay unique", () => {
    const keys = collectionSegments([group("a", ["a1"], null), group("b", ["b1"], null)], "presentazione_16_9").flatMap((s) => s.pages.map((p) => p.pageKey));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("case:a1|closing");
    expect(keys).toContain("case:b1|closing");
  });

  it("moves a group, and a case only within its group", () => {
    const groups = [group("a", ["a1", "a2"], null), group("b", ["b1"], null)];
    expect(withGroupMoved(groups, "b", 0).map((g) => g.clientId)).toEqual(["b", "a"]);
    expect(withGroupMoved(groups, "a", 0)).toBe(groups);
    expect(withCaseMoved(groups, "a1", 1)[0]!.cases.map((c) => c.caseId)).toEqual(["a2", "a1"]);
    expect(withCaseMoved(groups, "a1", 5)[0]!.cases.map((c) => c.caseId)).toEqual(["a2", "a1"]);
    expect(withCaseMoved(groups, "b1", 0)).toBe(groups);
  });

  it("matches a candidate on a business line or its client's industry", () => {
    const candidate = { id: "x", name: "X", code: "X", clientName: "C", clientCode: "C", businessLines: ["video"] as const, industry: "moda" };
    expect(matchesTags(candidate, { businessLines: ["video"], industries: [] })).toBe(true);
    expect(matchesTags(candidate, { businessLines: [], industries: ["moda"] })).toBe(true);
    expect(matchesTags(candidate, { businessLines: ["branding"], industries: ["food"] })).toBe(false);
  });
});

describe("a collection's own edits over its pages (Story 5.11a)", () => {
  const F: FormatId = "presentazione_16_9";
  const textPage = (pageKey: string): Page =>
    ({
      pageKey,
      name: pageKey,
      role: "body",
      section: "output",
      blocks: [
        {
          blockId: "b1",
          elements: [
            { elementId: "free", type: "text", text: "Originale" },
            { elementId: "bound", type: "text", binding: { record: "client", field: "name" } },
          ],
        },
      ],
    }) as unknown as Page;
  const words = (p: Page, id: string) => freeTextIn(p, id);

  it("lays the collection's words over free texts only, never touching the revision's page", () => {
    const original = textPage("x");
    const groups = [{ clientId: "a", clientName: "A", intro: null, cases: [{ caseId: "a1", name: "a1", code: "A1", part: part([original]) }] }];
    const edits: ViewEdits = {
      ...NO_EDITS,
      texts: [
        { partKey: "case:a1", formatId: F, pageKey: "x", elementId: "free", text: "Mia", originalChanged: false },
        { partKey: "case:a1", formatId: F, pageKey: "x", elementId: "bound", text: "Mai", originalChanged: false },
      ],
    };
    const [segment] = collectionSegments(groups, F, edits);
    expect(words(segment!.pages[0]!, "free")).toBe("Mia");
    expect(freeTextIn(segment!.pages[0]!, "bound")).toBeNull();
    expect(words(original, "free")).toBe("Originale");
    // Another format keeps the original words.
    expect(words(collectionSegments(groups, "carosello_1_1", edits)[0]!.pages[0]!, "free")).toBe("Originale");
    // The same edits give the same page object (an untouched page keeps its drawing).
    expect(collectionSegments(groups, F, edits)[0]!.pages[0]).toBe(segment!.pages[0]);
  });

  it("orders a part's pages as saved and keeps hidden pages as entries, out of the pages shown", () => {
    const groups = [group("a", ["a1", "a2"], introPart())];
    const edits: ViewEdits = {
      ...NO_EDITS,
      orders: [{ partKey: "case:a1", formatId: F, pageKeys: ["closing", "a1-body", "a1-intro"] }],
      hidden: [{ partKey: "client_intro:a", formatId: F, pageKey: "bye" }],
    };
    const segments = collectionSegments(groups, F, edits);
    const a1 = segments.find((s) => s.key === "case:a1")!;
    expect(a1.pages.map((p) => p.pageKey)).toEqual(["case:a1|closing", "case:a1|a1-body"]);
    const closing = segments.find((s) => s.key === "client_closing:a")!;
    expect(closing.partKey).toBe("client_intro:a");
    expect(closing.pages).toEqual([]);
    expect(closing.entries.map((e) => [e.pageKey, e.hidden])).toEqual([["bye", true]]);
    expect(shownPagesOfPart(segments, "client_intro:a")).toBe(1);
  });

  it("never shows a part with no page: when every page it would show is hidden, it shows them", () => {
    // A1's body and closing hidden: shown whole it keeps its intro; wrapped, it would show none.
    const edits: ViewEdits = {
      ...NO_EDITS,
      hidden: ["a1-body", "closing"].map((pageKey) => ({ partKey: "case:a1", formatId: F, pageKey })),
    };
    const whole = collectionSegments([group("a", ["a1"], null)], F, edits).find((s) => s.key === "case:a1")!;
    expect(whole.pages.map((p) => p.pageKey)).toEqual(["case:a1|a1-intro"]);
    const wrapped = collectionSegments([group("a", ["a1", "a2"], introPart())], F, edits).find((s) => s.key === "case:a1")!;
    expect(wrapped.pages.map((p) => p.pageKey)).toEqual(["case:a1|a1-body", "case:a1|closing"]);
    expect(wrapped.entries.every((e) => !e.hidden)).toBe(true);
  });

  it("moves a page within its run, keeping the part's other pages in place", () => {
    expect(movedPageOrder(["i", "b1", "b2", "c"], ["b1", "b2", "c"], 0, 1)).toEqual(["i", "b2", "b1", "c"]);
    expect(movedPageOrder(["i", "b1", "b2", "c"], ["b1", "b2", "c"], 2, 0)).toEqual(["i", "c", "b1", "b2"]);
    expect(movedPageOrder(["a", "b"], ["a", "b"], 1, 5)).toBeNull();
    expect(movedPageOrder(["a", "b"], ["a", "b"], 0, 0)).toBeNull();
  });

  it("names a part from its key", () => {
    expect(partOfKey("case:a1")).toEqual({ kind: "case", id: "a1" });
    expect(partOfKey("client_intro:c-1")).toEqual({ kind: "client_intro", id: "c-1" });
  });
});
