import { describe, expect, it } from "vitest";
import type { CaseStudyDocument, Page } from "@/modules/generation";
import {
  applyCollectionEdits,
  collectionPartKey,
  freeTextIn,
  NO_COLLECTION_EDITS,
  orderedPages,
  wordedPage,
  type CollectionEditSet,
  type ComposePart,
  type FormatId,
} from "@/modules/rendering";

const P: FormatId = "presentazione_16_9";
const C: FormatId = "carosello_1_1";

const text = (elementId: string, words: string) => ({ elementId, type: "text", style: "body", text: words, provenance: "user" });
const bound = (elementId: string) => ({ elementId, type: "text", style: "body", binding: "client.name", provenance: "user" });

/** A page with a free text `title`, a bound text `name`, and a free text `deep` inside a row inside a Testi group. */
function page(pageKey: string, role: string): Page {
  return {
    pageKey,
    name: pageKey,
    role,
    section: "output",
    blocks: [
      {
        blockId: `${pageKey}-b`,
        elements: [
          text("title", `Titolo ${pageKey}`),
          bound("name"),
          { elementId: "group", type: "text_group", align: "top", items: [{ elementId: "row", type: "row", items: [text("deep", `Profondo ${pageKey}`)] }] },
        ],
      },
    ],
  } as unknown as Page;
}

const doc = (kind: "case_history" | "client_intro", pages: Page[]): CaseStudyDocument =>
  ({ schemaVersion: 2, kind, template: "mac-case@1", formats: { [P]: { pages }, [C]: { pages } } }) as unknown as CaseStudyDocument;

const VALUES = {
  client: { name: "", sector: "", description: "", logoUrl: null, results: [], testimonial: null },
  case: { year: null, services: [], results: [], testimonial: null },
};

/** Case `id` of client `client`: an intro page, two body pages and a closing. */
const casePart = (id: string, client = "k1"): ComposePart => ({
  kind: "case_history",
  caseId: id,
  clientId: client,
  doc: doc("case_history", [page(`${id}-intro`, "intro"), page(`${id}-1`, "body"), page(`${id}-2`, "body"), page(`${id}-end`, "outro")]),
  assets: {},
  values: VALUES,
});
const introPart = (client = "k1"): ComposePart => ({
  kind: "client_intro",
  clientId: client,
  doc: doc("client_intro", [page("hello", "intro"), page("bye", "outro")]),
  assets: {},
  values: VALUES,
});

const edits = (over: Partial<CollectionEditSet>): CollectionEditSet => ({ ...NO_COLLECTION_EDITS, ...over });
const keys = (file: { segments: readonly { pages: readonly Page[] }[] }) => file.segments.flatMap((s) => s.pages.map((p) => p.pageKey));
const pagesOf = (part: ComposePart, formatId: FormatId) => (part.doc.formats as Record<string, { pages: Page[] }>)[formatId]!.pages;

describe("applyCollectionEdits (Story 5.11b)", () => {
  it("leaves everything as it is with no edits: same pages, same objects, nothing effective", () => {
    const parts = [casePart("a")];
    const applied = applyCollectionEdits(parts, P, NO_COLLECTION_EDITS);
    expect(keys(applied.file)).toEqual(["a-intro", "a-1", "a-2", "a-end"]);
    expect(applied.file.segments[0]!.pages[1]).toBe(pagesOf(parts[0]!, P)[1]);
    expect(applied.effective).toEqual([]);
  });

  it("puts the collection's words on free texts only, inside groups and rows too, in that format only", () => {
    const parts = [casePart("a")];
    const original = structuredClone(parts[0]!.doc);
    const applied = applyCollectionEdits(
      parts,
      P,
      edits({
        texts: [
          { partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "title", text: "Nuovo titolo" },
          { partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "deep", text: "Nuovo profondo" },
          { partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "name", text: "Non un campo" },
          { partKey: "case:a", formatId: C, pageKey: "a-2", elementId: "title", text: "Solo Carosello" },
        ],
      }),
    );
    const edited = applied.file.segments[0]!.pages[1]!;
    expect(freeTextIn(edited, "title")).toBe("Nuovo titolo");
    expect(freeTextIn(edited, "deep")).toBe("Nuovo profondo");
    expect(JSON.stringify(edited)).toContain('"binding":"client.name"');
    expect(JSON.stringify(edited)).not.toContain("Non un campo");
    expect(freeTextIn(applied.file.segments[0]!.pages[2]!, "title")).toBe("Titolo a-2");
    // The originals are never changed.
    expect(parts[0]!.doc).toEqual(original);
    // Carosello: the Carosello edit only.
    const carosello = applyCollectionEdits(parts, C, edits({ texts: [{ partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "title", text: "X" }] }));
    expect(freeTextIn(carosello.file.segments[0]!.pages[1]!, "title")).toBe("Titolo a-1");
    expect(applied.effective).toEqual([
      { partKey: "case:a", texts: [["a-1", "deep", "Nuovo profondo"], ["a-1", "title", "Nuovo titolo"]], hidden: [], order: null },
    ]);
  });

  it("keeps the collection's words when the original changed since", () => {
    // The edit was saved against "Titolo a-1"; the case was updated since and its page now says otherwise.
    const part = casePart("a");
    const updated = pagesOf(part, P).map((p) => (p.pageKey === "a-1" ? wordedPage(p, [{ elementId: "title", text: "Titolo aggiornato" }]) : p));
    const changed: ComposePart = { ...part, doc: { ...part.doc, formats: { ...part.doc.formats, [P]: { pages: updated } } } as CaseStudyDocument };
    expect(freeTextIn(pagesOf(changed, P)[1]!, "title")).toBe("Titolo aggiornato");
    const applied = applyCollectionEdits([changed], P, edits({ texts: [{ partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "title", text: "Titolo a-1" }] }));
    expect(freeTextIn(applied.file.segments[0]!.pages[1]!, "title")).toBe("Titolo a-1");
    expect(applied.effective).toEqual([{ partKey: "case:a", texts: [["a-1", "title", "Titolo a-1"]], hidden: [], order: null }]);
  });

  it("follows the saved order first, then any page it doesn't name in the document's order", () => {
    const parts = [casePart("a")];
    const applied = applyCollectionEdits(parts, P, edits({ orders: [{ partKey: "case:a", formatId: P, pageKeys: ["a-2", "gone", "a-1"] }] }));
    expect(keys(applied.file)).toEqual(["a-2", "a-1", "a-intro", "a-end"]);
    expect(applied.effective).toEqual([{ partKey: "case:a", texts: [], hidden: [], order: ["a-2", "a-1", "a-intro", "a-end"] }]);
    expect(orderedPages(pagesOf(parts[0]!, P), "case:A", P, { orders: [{ partKey: "case:a", formatId: P, pageKeys: ["a-end"] }] }).map((p) => p.pageKey)).toEqual([
      "a-end",
      "a-intro",
      "a-1",
      "a-2",
    ]);
  });

  it("leaves hidden pages out of the file, page numbers running on", () => {
    const parts = [casePart("a"), casePart("b", "k2")];
    const applied = applyCollectionEdits(parts, C, edits({ hidden: [{ partKey: "case:a", formatId: C, pageKey: "a-1" }] }));
    expect(keys(applied.file)).toEqual(["a-intro", "a-2", "a-end", "b-intro", "b-1", "b-2", "b-end"]);
    expect(applied.file.segments[1]!.startPage).toBe(4);
    // The page still lays it out, as a strip.
    expect(keys(applied.composed)).toContain("a-1");
    expect([...applied.hidden.get("case:a")!]).toEqual(["a-1"]);
    expect(applied.effective).toEqual([{ partKey: "case:a", texts: [], hidden: ["a-1"], order: null }]);
    // Hidden in Carosello only: Presentazione keeps it.
    expect(keys(applyCollectionEdits(parts, P, edits({ hidden: [{ partKey: "case:a", formatId: C, pageKey: "a-1" }] })).file)).toContain("a-1");
  });

  it("matches a client intro's edits by its client: its pages hidden, its words changed", () => {
    const parts = [introPart(), casePart("a"), casePart("b")];
    const applied = applyCollectionEdits(
      parts,
      P,
      edits({
        hidden: [{ partKey: "client_intro:K1", formatId: P, pageKey: "hello" }],
        texts: [{ partKey: "client_intro:k1", formatId: P, pageKey: "bye", elementId: "title", text: "Arrivederci" }],
      }),
    );
    expect(keys(applied.file)).toEqual(["a-1", "a-2", "a-end", "b-1", "b-2", "b-end", "bye"]);
    expect(freeTextIn(applied.file.segments.at(-1)!.pages[0]!, "title")).toBe("Arrivederci");
    expect(collectionPartKey(parts[0]!)).toBe("client_intro:k1");
    expect(applied.effective.map((e) => e.partKey)).toEqual(["client_intro:k1"]);
  });

  it("ignores a part's hides when every page it would show is hidden (never zero pages)", () => {
    // Wrapped by its client's intro, case a shows a-1, a-2 and a-end; its own intro page isn't shown.
    const parts = [introPart(), casePart("a"), casePart("b")];
    const hideAll = edits({ hidden: ["a-1", "a-2", "a-end"].map((pageKey) => ({ partKey: "case:a", formatId: P, pageKey })) });
    const applied = applyCollectionEdits(parts, P, hideAll);
    expect(keys(applied.file)).toEqual(["hello", "a-1", "a-2", "a-end", "b-1", "b-2", "b-end", "bye"]);
    expect(applied.hidden.get("case:a")!.size).toBe(0);
    expect(applied.effective).toEqual([]);
    // Hiding its own intro page (not shown when wrapped) as well counts the same.
    const withIntro = edits({ hidden: [...hideAll.hidden, { partKey: "case:a", formatId: P, pageKey: "a-intro" }] });
    expect(keys(applyCollectionEdits(parts, P, withIntro).file)).toContain("a-1");
    // An intro with both its pages hidden keeps them.
    const intro = edits({ hidden: ["hello", "bye"].map((pageKey) => ({ partKey: "client_intro:k1", formatId: P, pageKey })) });
    expect(keys(applyCollectionEdits(parts, P, intro).file)).toEqual(["hello", "a-1", "a-2", "a-end", "b-1", "b-2", "b-end", "bye"]);
  });

  it("counts as effective only what changes the file", () => {
    const parts = [introPart(), casePart("a"), casePart("b")];
    const applied = applyCollectionEdits(
      parts,
      P,
      edits({
        // Words on a page not shown (a's own intro, wrapped), and the original's own words.
        texts: [
          { partKey: "case:a", formatId: P, pageKey: "a-intro", elementId: "title", text: "Nascosto" },
          { partKey: "case:a", formatId: P, pageKey: "a-1", elementId: "title", text: "Titolo a-1" },
        ],
        // A page not shown.
        hidden: [{ partKey: "case:a", formatId: P, pageKey: "a-intro" }],
        // An order that only moves a page not shown.
        orders: [{ partKey: "case:b", formatId: P, pageKeys: ["b-1", "b-intro", "b-2", "b-end"] }],
      }),
    );
    expect(applied.effective).toEqual([]);
  });
});
