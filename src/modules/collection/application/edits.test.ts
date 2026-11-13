import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseStudyRevision, ListedCaseStudy } from "@/modules/case-study";
import { MAX_PAGES_PER_FORMAT, MAX_TEXT_CHARS, type Page } from "@/modules/generation";
import { COLLECTION_PAGES_MAX, COLLECTION_TEXT_MAX } from "@/modules/collection/domain/edits";
import type { StoredCollection } from "@/modules/collection/domain/collection";
import type { StoredCollectionEdits } from "@/modules/collection/domain/edits";
import type { CollectionRepository } from "@/modules/collection/ports/collection-repository";
import {
  BRAND_INTRO_KEY,
  BRAND_OUTRO_KEY,
  BRAND_PAGES,
  BRAND_PART_ID,
  BRAND_TITLE_ELEMENT_ID,
  composeParts,
  FORMAT_IDS,
  type ComposePart,
} from "@/modules/rendering";
import { err, ok, type Result } from "@/shared/result";
import { shownPageKeys } from "@/modules/collection/domain/edits";
import { freeTextOf, makeCollectionEditUseCases, textHash } from "./edits";

const actor: Actor = { id: "00000000-0000-4000-8000-0000000000a1", email: "a@menatcode.it", displayName: "A", role: "account_sales_social" };
const COLLECTION = "c0000000-0000-4000-8000-000000000001";
const CLIENT_A = "a0000000-0000-4000-8000-00000000000a";
const CLIENT_B = "b0000000-0000-4000-8000-00000000000b";
const A1 = "0000000a-0000-4000-8000-000000000001";
const A2 = "0000000a-0000-4000-8000-000000000002";
const B1 = "0000000a-0000-4000-8000-000000000003";
const FREE = "e0000000-0000-4000-8000-000000000001";
const NESTED = "e0000000-0000-4000-8000-000000000002";
const BOUND = "e0000000-0000-4000-8000-000000000003";
const IMAGE = "e0000000-0000-4000-8000-000000000004";
const F = "presentazione_16_9";

const text = (elementId: string, words: string) => ({ elementId, type: "text", style: "title", text: words, provenance: "generated" });
/** A page with a free text, a free text inside a Testi group, a client field and an image (ids repeat across pages: never read together). */
const page = (pageKey: string, role = "body"): Page =>
  ({
    pageKey,
    name: pageKey,
    role,
    section: "output",
    background: { kind: "transparent" },
    grid: { layoutId: "one", rows: [1], cols: [1] },
    blocks: [
      {
        blockId: "b0000000-0000-4000-8000-000000000001",
        name: "Blocco",
        background: { kind: "transparent" },
        elements: [
          text(FREE, "Titolo"),
          { elementId: "e0000000-0000-4000-8000-000000000010", type: "text_group", align: "top", items: [text(NESTED, "Dentro")] },
          { elementId: BOUND, type: "text", style: "title", binding: { record: "client", field: "name" }, provenance: "generated" },
          { elementId: IMAGE, type: "image", assetId: null, fit: "fill" },
        ],
      },
    ],
  }) as unknown as Page;

const revision = (pages: Page[]) => ({ id: "rev", doc: { formats: { [F]: { pages } } } }) as unknown as CaseStudyRevision;
const listed = (id: string, clientId: string) => ({ id, status: "approved", client: { id: clientId } }) as unknown as ListedCaseStudy;

function stored(caseIds: string[] = [A1, A2], version = 3): StoredCollection {
  return {
    id: COLLECTION,
    name: "Pitch",
    version,
    tags: { businessLines: ["branding"], industries: ["moda"] },
    caseIds,
    createdBy: { id: actor.id, name: "A" },
    createdAt: "2026-11-11T10:00:00Z",
    updatedAt: "2026-11-11T10:00:00Z",
  };
}

function setup({ edits = { textEdits: [], hiddenPages: [], pageOrders: [] } as StoredCollectionEdits, pages = [page("cover"), page("body")], collection = stored() } = {}) {
  const repo = {
    list: vi.fn(),
    find: vi.fn(async () => ok(collection)),
    create: vi.fn(),
    setItems: vi.fn(),
    rename: vi.fn(),
    setTags: vi.fn(),
    softDelete: vi.fn(),
    recordExported: vi.fn(),
    edits: vi.fn(async (): Promise<Result<StoredCollectionEdits>> => ok(edits)),
    setTextEdit: vi.fn(async (_id: string, expected: number): Promise<Result<number>> => ok(expected + 1)),
    deleteTextEdit: vi.fn(async (_id: string, expected: number): Promise<Result<number>> => ok(expected + 1)),
    setPageHidden: vi.fn(async (_id: string, expected: number): Promise<Result<number>> => ok(expected + 1)),
    setPageOrder: vi.fn(async (_id: string, expected: number): Promise<Result<number>> => ok(expected + 1)),
  } satisfies CollectionRepository;
  const liveRevision = vi.fn(async () => ok(revision(pages)));
  const liveIntroRevision = vi.fn(async () => ok(revision(pages)));
  const useCases = makeCollectionEditUseCases({
    collections: repo,
    listCases: async () => ok([listed(A1, CLIENT_A), listed(A2, CLIENT_A), listed(B1, CLIENT_B)]),
    liveRevision,
    liveIntroRevision,
  });
  return { repo, useCases, liveRevision, liveIntroRevision };
}

const base = { collectionId: COLLECTION, expectedVersion: 3, part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover" };

describe("limits (Story 5.11a)", () => {
  it("follow the document's text and page limits", () => {
    expect(COLLECTION_TEXT_MAX).toBe(MAX_TEXT_CHARS);
    expect(COLLECTION_PAGES_MAX).toBe(MAX_PAGES_PER_FORMAT);
  });
});

describe("freeTextOf (Story 5.11a)", () => {
  it("finds a free text, inside a Testi group too; never a field or an image", () => {
    expect(freeTextOf(page("cover"), FREE)?.text).toBe("Titolo");
    expect(freeTextOf(page("cover"), NESTED)?.text).toBe("Dentro");
    expect(freeTextOf(page("cover"), BOUND)).toBeNull();
    expect(freeTextOf(page("cover"), IMAGE)).toBeNull();
  });
});

describe("setCollectionText (Story 5.11a)", () => {
  it("stores the words with the hash of the original, worked out from the live revision", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "Nuovo titolo" })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4 } });
    expect(repo.setTextEdit).toHaveBeenCalledWith(
      COLLECTION,
      3,
      { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: FREE, text: "Nuovo titolo", originalHash: textHash("Titolo") },
      actor.id,
    );
  });

  it("edits a client intro part's text, read from the client's intro", async () => {
    const { repo, useCases, liveIntroRevision } = setup();
    expect(await useCases.setText(actor, { ...base, part: { kind: "client_intro", id: CLIENT_A }, elementId: NESTED, text: "X" })).toMatchObject({ ok: true });
    expect(liveIntroRevision).toHaveBeenCalledWith(CLIENT_A);
    expect(repo.setTextEdit).toHaveBeenCalled();
  });

  it("refuses a field, an image or an unknown text (TEXT_NOT_EDITABLE), writing nothing", async () => {
    const { repo, useCases } = setup();
    for (const elementId of [BOUND, IMAGE, "e0000000-0000-4000-8000-0000000000ff"]) {
      expect(await useCases.setText(actor, { ...base, elementId, text: "X" })).toMatchObject({ ok: false, error: { code: "TEXT_NOT_EDITABLE" } });
    }
    expect(repo.setTextEdit).not.toHaveBeenCalled();
  });

  it("refuses a text over the document's limit, a part not in the collection, a stale version", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "x".repeat(5001) })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["text"] } } });
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "x".repeat(5000) })).toMatchObject({ ok: true });
    expect(await useCases.setText(actor, { ...base, part: { kind: "case", id: B1 }, elementId: FREE, text: "X" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["part"] } } });
    expect(await useCases.setText(actor, { ...base, part: { kind: "client_intro", id: CLIENT_B }, elementId: FREE, text: "X" })).toMatchObject({ ok: false, error: { details: { fields: ["part"] } } });
    expect(await useCases.setText(actor, { ...base, expectedVersion: 2, elementId: FREE, text: "X" })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });
    expect(repo.setTextEdit).toHaveBeenCalledTimes(1);
  });

  it("refuses a part with no approved revision any more", async () => {
    const { useCases, liveRevision } = setup();
    liveRevision.mockResolvedValueOnce(ok(null as never));
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "X" })).toMatchObject({ ok: false, error: { details: { fields: ["part"] } } });
  });

  it("the original's own words remove the edit, or change nothing when there is none", async () => {
    const edited = { textEdits: [{ part: { kind: "case" as const, id: A1 }, formatId: F, pageKey: "cover", elementId: FREE, text: "X", originalHash: textHash("Titolo") }], hiddenPages: [], pageOrders: [] };
    const withEdit = setup({ edits: edited });
    expect(await withEdit.useCases.setText(actor, { ...base, elementId: FREE, text: "Titolo" })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4 } });
    expect(withEdit.repo.deleteTextEdit).toHaveBeenCalledWith(COLLECTION, 3, { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: FREE }, actor.id);
    const without = setup();
    expect(await without.useCases.setText(actor, { ...base, elementId: FREE, text: "Titolo" })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 3 } });
    expect(without.repo.deleteTextEdit).not.toHaveBeenCalled();
    expect(without.repo.setTextEdit).not.toHaveBeenCalled();
  });

  it("restores the original (Ripristina testo originale)", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.restoreText(actor, { ...base, elementId: FREE })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4 } });
    expect(repo.deleteTextEdit).toHaveBeenCalledWith(COLLECTION, 3, { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: FREE }, actor.id);
  });
});

describe("setCollectionPageHidden (Story 5.11a)", () => {
  it("hides a page and shows it again", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.setPageHidden(actor, { ...base, hidden: true })).toMatchObject({ ok: true, value: { version: 4 } });
    expect(repo.setPageHidden).toHaveBeenCalledWith(COLLECTION, 3, { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover" }, true, actor.id);
    expect(await useCases.setPageHidden(actor, { ...base, hidden: false })).toMatchObject({ ok: true });
    expect(repo.setPageHidden).toHaveBeenLastCalledWith(COLLECTION, 3, { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover" }, false, actor.id);
  });

  it("refuses to hide a part's last page (COLLECTION_LAST_PAGE), and an unknown page", async () => {
    const { repo, useCases } = setup({ edits: { textEdits: [], hiddenPages: [{ part: { kind: "case", id: A1 }, formatId: F, pageKey: "body" }], pageOrders: [] } });
    expect(await useCases.setPageHidden(actor, { ...base, hidden: true })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_PAGE" } });
    expect(await useCases.setPageHidden(actor, { ...base, pageKey: "nope", hidden: true })).toMatchObject({ ok: false, error: { details: { fields: ["pageKey"] } } });
    expect(repo.setPageHidden).not.toHaveBeenCalled();
    // Another part's hidden page doesn't count.
    const other = setup({ edits: { textEdits: [], hiddenPages: [{ part: { kind: "case", id: A2 }, formatId: F, pageKey: "body" }], pageOrders: [] } });
    expect(await other.useCases.setPageHidden(actor, { ...base, hidden: true })).toMatchObject({ ok: true });
  });
});

describe("setCollectionPageOrder (Story 5.11a)", () => {
  it("saves every page key of the part in the new order", async () => {
    const { repo, useCases } = setup();
    const rest = { collectionId: base.collectionId, expectedVersion: base.expectedVersion, part: base.part, formatId: base.formatId };
    expect(await useCases.setPageOrder(actor, { ...rest, pageKeys: ["body", "cover"] })).toMatchObject({ ok: true, value: { version: 4 } });
    expect(repo.setPageOrder).toHaveBeenCalledWith(COLLECTION, 3, { part: { kind: "case", id: A1 }, formatId: F, pageKeys: ["body", "cover"] }, actor.id);
  });

  it("refuses a list that isn't the part's pages, each once", async () => {
    const { repo, useCases } = setup();
    const rest = { collectionId: base.collectionId, expectedVersion: base.expectedVersion, part: base.part, formatId: base.formatId };
    for (const pageKeys of [["body"], ["body", "cover", "extra"], ["body", "body"], ["cover", "other"]]) {
      expect(await useCases.setPageOrder(actor, { ...rest, pageKeys })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    expect(repo.setPageOrder).not.toHaveBeenCalled();
  });
});

describe("getCollectionEdits (Story 5.11a)", () => {
  it("checks each text edit against its original's hash now, leaving out one no longer a free text", async () => {
    const edits: StoredCollectionEdits = {
      textEdits: [
        { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: FREE, text: "Mio", originalHash: textHash("Titolo") },
        { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: NESTED, text: "Mio", originalHash: textHash("Prima") },
        { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: BOUND, text: "Mio", originalHash: textHash("x") },
      ],
      hiddenPages: [{ part: { kind: "case", id: A1 }, formatId: F, pageKey: "body" }],
      pageOrders: [{ part: { kind: "case", id: A1 }, formatId: F, pageKeys: ["body", "cover"] }],
    };
    const { useCases, liveRevision } = setup({ edits });
    const read = await useCases.edits(COLLECTION);
    expect(read).toEqual({
      ok: true,
      value: {
        textEdits: [
          { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: FREE, text: "Mio", originalChanged: false },
          { part: { kind: "case", id: A1 }, formatId: F, pageKey: "cover", elementId: NESTED, text: "Mio", originalChanged: true },
        ],
        hiddenPages: edits.hiddenPages,
        pageOrders: edits.pageOrders,
      },
    });
    // One read per part.
    expect(liveRevision).toHaveBeenCalledTimes(1);
  });

  it("is COLLECTION_NOT_FOUND for a malformed or unknown id", async () => {
    expect(await setup().useCases.edits("nope")).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
    const { useCases, repo } = setup();
    repo.find.mockResolvedValueOnce(ok(null as never));
    expect(await useCases.edits(COLLECTION)).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
    repo.find.mockResolvedValueOnce(err({ code: "COLLECTION_LOOKUP_FAILED", message: "x" }) as never);
    expect(await useCases.edits(COLLECTION)).toMatchObject({ ok: false, error: { code: "COLLECTION_LOOKUP_FAILED" } });
  });
});

describe("Story 5.11a review fixes", () => {
  it("counts the text limit in UTF-16 units, as the document does", async () => {
    const { useCases } = setup();
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "😀".repeat(2500) })).toMatchObject({ ok: true });
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "😀".repeat(2501) })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["text"] } } });
  });

  it("normalises typed words and refuses blank ones", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "Due\u00a0parole \n\n" })).toMatchObject({ ok: true });
    expect((repo.setTextEdit.mock.calls[0] as unknown[])[2]).toMatchObject({ text: "Due parole" });
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: " \u00a0\n" })).toMatchObject({ ok: false, error: { details: { fields: ["text"] } } });
    // Trailing spaces on the original's words remove the edit as the words alone do.
    expect(await useCases.setText(actor, { ...base, elementId: FREE, text: "Titolo  " })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 3 } });
  });

  it("leaves out the edits of parts no longer in the collection, and reads a gone case as unavailable", async () => {
    const part = { kind: "case" as const, id: A1 };
    const gone = { kind: "case" as const, id: B1 };
    const edit = (p: { kind: "case" | "client_intro"; id: string }) => ({ part: p, formatId: F, pageKey: "cover", elementId: FREE, text: "Mio", originalHash: textHash("Titolo") });
    const edits: StoredCollectionEdits = {
      textEdits: [edit(part), edit(gone), edit({ kind: "client_intro", id: CLIENT_B })],
      hiddenPages: [{ part: gone, formatId: F, pageKey: "cover" }, { part: { kind: "client_intro", id: CLIENT_A }, formatId: F, pageKey: "cover" }],
      pageOrders: [{ part: gone, formatId: F, pageKeys: ["cover"] }],
    };
    const { useCases, liveRevision } = setup({ edits });
    liveRevision.mockResolvedValue(err({ code: "NOT_FOUND", message: "gone" }) as never);
    const read = await useCases.edits(COLLECTION);
    expect(read).toEqual({ ok: true, value: { textEdits: [], hiddenPages: [edits.hiddenPages[1]], pageOrders: [] } });
    // Any other read failure still fails.
    liveRevision.mockResolvedValue(err({ code: "REVISION_LOOKUP_FAILED", message: "x" }) as never);
    expect(await useCases.edits(COLLECTION)).toMatchObject({ ok: false, error: { code: "REVISION_LOOKUP_FAILED" } });
  });

  it("counts a wrapped case's last page as the file shows it (its own intro pages left out)", async () => {
    const pages = [page("cover", "intro"), page("body")];
    const wrapped = setup({ pages });
    expect(await wrapped.useCases.setPageHidden(actor, { ...base, pageKey: "body", hidden: true })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_PAGE" } });
    // No approved intro: the case shows whole, so its body page can go.
    const whole = setup({ pages });
    whole.liveIntroRevision.mockResolvedValue(ok(null as never));
    expect(await whole.useCases.setPageHidden(actor, { ...base, pageKey: "body", hidden: true })).toMatchObject({ ok: true });
  });

  it("shownPageKeys follows composeParts's default layout", () => {
    const doc = (kind: "case_history" | "client_intro", pages: Page[]) =>
      ({ schemaVersion: 2, kind, template: "mac-case@1", formats: Object.fromEntries(FORMAT_IDS.map((id) => [id, { pages }])) }) as never;
    const casePages = [page("cover", "intro"), page("body"), page("closing", "outro")];
    const introPages = [page("hello", "intro"), page("middle"), page("bye", "outro")];
    for (const formatId of FORMAT_IDS) {
      for (const n of [1, 2]) {
        const parts: ComposePart[] = [
          { kind: "client_intro", clientId: "c", doc: doc("client_intro", introPages), assets: {}, values: {} as never },
          ...Array.from({ length: n }, (_, i): ComposePart => ({ kind: "case_history", caseId: `k${i}`, clientId: "c", doc: doc("case_history", casePages), assets: {}, values: {} as never })),
        ];
        const segments = composeParts(parts, formatId).segments;
        const keysOf = (slots: string[]) => segments.filter((s) => slots.includes(s.slot) && (s.slot !== "case" || s.key === "case:k0")).flatMap((s) => s.pages.map((p) => p.pageKey));
        const wrapped = n >= 2;
        expect(shownPageKeys(casePages, "case", formatId, wrapped), `${formatId} ${n}`).toEqual(keysOf(["case"]));
        expect(shownPageKeys(introPages, "client_intro", formatId, wrapped), `${formatId} ${n}`).toEqual(keysOf(["client_intro", "client_closing"]));
        expect(shownPageKeys(BRAND_PAGES, "brand", formatId, wrapped), `${formatId} ${n}`).toEqual(
          formatId === F ? keysOf(["brand_intro", "brand_outro"]) : BRAND_PAGES.map((p) => p.pageKey),
        );
      }
    }
  });
});

describe("MAC's pages as a collection part", () => {
  const brand = { kind: "brand" as const, id: BRAND_PART_ID };
  const title = { ...base, part: brand, pageKey: BRAND_INTRO_KEY, elementId: BRAND_TITLE_ELEMENT_ID };

  it("takes the collection's words for the \"Our projects\" title, hashed against MAC's own words; no revision is read", async () => {
    const { repo, useCases, liveRevision, liveIntroRevision } = setup();
    expect(await useCases.setText(actor, { ...title, text: "I nostri progetti" })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4 } });
    expect(repo.setTextEdit).toHaveBeenCalledWith(
      COLLECTION,
      3,
      { part: brand, formatId: F, pageKey: BRAND_INTRO_KEY, elementId: BRAND_TITLE_ELEMENT_ID, text: "I nostri progetti", originalHash: textHash("Our projects") },
      actor.id,
    );
    expect(liveRevision).not.toHaveBeenCalled();
    expect(liveIntroRevision).not.toHaveBeenCalled();
  });

  it("refuses every other MAC text (TEXT_NOT_EDITABLE), another format, another id", async () => {
    const { repo, useCases } = setup();
    for (const at of [
      { ...title, elementId: FREE },
      { ...title, pageKey: BRAND_OUTRO_KEY },
    ]) {
      expect(await useCases.setText(actor, { ...at, text: "Men At Work" })).toMatchObject({ ok: false, error: { code: "TEXT_NOT_EDITABLE" } });
    }
    expect(await useCases.setText(actor, { ...title, formatId: "carosello_1_1", text: "X" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["formatId"] } } });
    expect(await useCases.setText(actor, { ...title, part: { kind: "brand", id: A1 }, text: "X" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["part"] } } });
    expect(repo.setTextEdit).not.toHaveBeenCalled();
  });

  it("hides one of MAC's pages, never both (COLLECTION_LAST_PAGE)", async () => {
    const { repo, useCases } = setup();
    const hide = { ...base, part: brand, pageKey: BRAND_INTRO_KEY, hidden: true };
    expect(await useCases.setPageHidden(actor, hide)).toMatchObject({ ok: true });
    expect(repo.setPageHidden).toHaveBeenCalledWith(COLLECTION, 3, { part: brand, formatId: F, pageKey: BRAND_INTRO_KEY }, true, actor.id);
    const after = setup({ edits: { textEdits: [], hiddenPages: [{ part: brand, formatId: F, pageKey: BRAND_INTRO_KEY }], pageOrders: [] } });
    expect(await after.useCases.setPageHidden(actor, { ...hide, pageKey: BRAND_OUTRO_KEY })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_PAGE" } });
    expect(after.repo.setPageHidden).not.toHaveBeenCalled();
  });

  it("refuses an order for MAC's pages: they sit by role, so it would change nothing", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.setPageOrder(actor, { collectionId: COLLECTION, expectedVersion: 3, part: brand, formatId: F, pageKeys: [BRAND_OUTRO_KEY, BRAND_INTRO_KEY] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["part"] } },
    });
    expect(repo.setPageOrder).not.toHaveBeenCalled();
  });

  it("reads its edits back, checked against MAC's own words", async () => {
    const edit = (text: string, originalHash: string) => ({ part: brand, formatId: F, pageKey: BRAND_INTRO_KEY, elementId: BRAND_TITLE_ELEMENT_ID, text, originalHash });
    const { useCases } = setup({ edits: { textEdits: [edit("Mia", textHash("Our projects"))], hiddenPages: [{ part: brand, formatId: F, pageKey: BRAND_OUTRO_KEY }], pageOrders: [] } });
    expect(await useCases.edits(COLLECTION)).toEqual({
      ok: true,
      value: {
        textEdits: [{ part: brand, formatId: F, pageKey: BRAND_INTRO_KEY, elementId: BRAND_TITLE_ELEMENT_ID, text: "Mia", originalChanged: false }],
        hiddenPages: [{ part: brand, formatId: F, pageKey: BRAND_OUTRO_KEY }],
        pageOrders: [],
      },
    });
    const changed = setup({ edits: { textEdits: [edit("Mia", textHash("Older words"))], hiddenPages: [], pageOrders: [] } });
    expect((await changed.useCases.edits(COLLECTION)).ok && (await changed.useCases.edits(COLLECTION))).toMatchObject({ value: { textEdits: [{ originalChanged: true }] } });
  });
});
