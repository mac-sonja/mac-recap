import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import type { CaseStudyRevision, ListedCaseStudy } from "@/modules/case-study";
import type { StoredCollection } from "@/modules/collection/domain/collection";
import type { CollectionRepository } from "@/modules/collection/ports/collection-repository";
import { err, ok, type Result } from "@/shared/result";
import { makeCollectionUseCases } from "./collections";

const actor: Actor = { id: "00000000-0000-4000-8000-0000000000a1", email: "a@menatcode.it", displayName: "A", role: "account_sales_social" };
const COLLECTION = "c0000000-0000-4000-8000-000000000001";
const CLIENT_A = "a0000000-0000-4000-8000-00000000000a";
const CLIENT_B = "b0000000-0000-4000-8000-00000000000b";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A1 = uuid(1);
const A2 = uuid(2);
const B1 = uuid(3);
const B2 = uuid(4);
const DRAFT = uuid(5);

const listed = (id: string, clientId: string, status: ListedCaseStudy["status"] = "approved") =>
  ({ id, status, client: { id: clientId, name: clientId, code: "X" }, name: id, code: id, businessLines: ["branding"] }) as unknown as ListedCaseStudy;

const CASES = [listed(A1, CLIENT_A), listed(A2, CLIENT_A), listed(B1, CLIENT_B), listed(B2, CLIENT_B), listed(DRAFT, CLIENT_B, "draft")];

function stored(caseIds: string[], version = 3): StoredCollection {
  return {
    id: COLLECTION,
    name: "Pitch moda",
    version,
    tags: { businessLines: ["branding"], industries: ["moda"] },
    caseIds,
    createdBy: { id: actor.id, name: "A" },
    createdAt: "2026-11-10T10:00:00Z",
    updatedAt: "2026-11-10T10:00:00Z",
  };
}

function setup(collection: StoredCollection | null = stored([A1, A2, B1]), cases: ListedCaseStudy[] = CASES) {
  const repo = {
    list: vi.fn(async () => ok(collection === null ? [] : [collection])),
    find: vi.fn(async () => ok(collection)),
    create: vi.fn(async () => ok({ id: COLLECTION, version: 1 })),
    setItems: vi.fn(async (_id: string, expected: number): Promise<Result<number>> => ok(expected + 1)),
    rename: vi.fn(async (_id: string, expected: number) => ok(expected + 1)),
    setTags: vi.fn(async (_id: string, expected: number) => ok(expected + 1)),
    softDelete: vi.fn(async () => ok(undefined)),
  } satisfies CollectionRepository;
  const liveRevision = vi.fn(async (caseId: string) => ok(caseId === A2 ? null : ({ id: `rev-${caseId}` } as unknown as CaseStudyRevision)));
  const useCases = makeCollectionUseCases({
    collections: repo,
    listCases: async () => ok(cases),
    liveRevision,
    businessLines: ["branding", "video"],
  });
  return { repo, useCases, liveRevision };
}

describe("createCollection (Story 5.10a)", () => {
  it("saves the selection grouped by client, at each client's first selected case", async () => {
    const { repo, useCases } = setup(null);
    const result = await useCases.create(actor, { name: " Pitch moda ", businessLines: ["video", "branding"], industries: ["moda"], caseIds: [A1, B1, A2] });
    expect(result).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 1, caseIds: [A1, A2, B1] } });
    expect(repo.create).toHaveBeenCalledWith({ name: "Pitch moda", tags: { businessLines: ["branding", "video"], industries: ["moda"] }, caseIds: [A1, A2, B1] }, actor.id);
  });

  it("names the failing field: an empty name, no tag, an unknown business line", async () => {
    const { repo, useCases } = setup(null);
    const fields = async (input: unknown) => {
      const result = await useCases.create(actor, input);
      return result.ok ? null : (result.error.details as { fields: string[] }).fields;
    };
    expect(await fields({ name: "  ", businessLines: ["branding"], industries: ["moda"], caseIds: [A1] })).toEqual(["name"]);
    expect(await fields({ name: "x".repeat(121), businessLines: ["branding"], industries: ["moda"], caseIds: [A1] })).toEqual(["name"]);
    expect(await fields({ name: "P", businessLines: [], industries: ["moda"], caseIds: [A1] })).toEqual(["businessLines"]);
    expect(await fields({ name: "P", businessLines: ["branding"], industries: [], caseIds: [A1] })).toEqual(["industries"]);
    expect(await fields({ name: "P", businessLines: ["nope"], industries: ["moda"], caseIds: [A1] })).toEqual(["businessLines"]);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("refuses a case that isn't approved or no longer exists", async () => {
    const { repo, useCases } = setup(null);
    const draft = await useCases.create(actor, { name: "P", businessLines: ["branding"], industries: ["moda"], caseIds: [A1, DRAFT] });
    expect(draft).toMatchObject({ ok: false, error: { code: "CASE_NOT_COLLECTABLE" } });
    const gone = await useCases.create(actor, { name: "P", businessLines: ["branding"], industries: ["moda"], caseIds: [uuid(99)] });
    expect(gone).toMatchObject({ ok: false, error: { code: "CASE_NOT_COLLECTABLE" } });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("reading collections", () => {
  it("counts only cases still there and drops a deleted one from the detail", async () => {
    const { useCases } = setup(stored([A1, uuid(77), A2]));
    const list = await useCases.list();
    expect(list.ok && list.value[0]!.caseCount).toBe(2);
    const detail = await useCases.get(COLLECTION);
    if (!detail.ok) throw new Error(detail.error.code);
    expect(detail.value.items.map((i) => i.case.id)).toEqual([A1, A2]);
    // A2 has no approved revision any more: "Non disponibile".
    expect(detail.value.items.map((i) => i.revision === null)).toEqual([false, true]);
  });

  it("never reads a revision for a case that isn't approved", async () => {
    const { useCases, liveRevision } = setup(stored([A1, DRAFT]));
    const detail = await useCases.get(COLLECTION);
    expect(detail.ok && detail.value.items[1]!.revision).toBeNull();
    expect(liveRevision).toHaveBeenCalledTimes(1);
  });

  it("is COLLECTION_NOT_FOUND for a malformed, unknown or deleted id", async () => {
    expect(await setup().useCases.get("nope")).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
    expect(await setup(null).useCases.get(COLLECTION)).toMatchObject({ ok: false, error: { code: "COLLECTION_NOT_FOUND" } });
  });
});

describe("changing the cases (compare-and-set)", () => {
  it("adds a case to its client's group", async () => {
    const { repo, useCases } = setup();
    const result = await useCases.addItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [B2] });
    expect(result).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4, caseIds: [A1, A2, B1, B2] } });
    expect(repo.setItems).toHaveBeenCalledWith(COLLECTION, 3, [A1, A2, B1, B2], actor.id, { type: "collection_items_added", data: { added: [B2] } });
  });

  it("refuses a stale version before writing", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.addItems(actor, { collectionId: COLLECTION, expectedVersion: 2, caseIds: [B2] })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });
    expect(repo.setItems).not.toHaveBeenCalled();
  });

  it("passes a stale refusal from the database through", async () => {
    const { repo, useCases } = setup();
    repo.setItems.mockResolvedValueOnce(err({ code: "STALE_COLLECTION", message: "m" }));
    expect(await useCases.moveGroup(actor, { collectionId: COLLECTION, expectedVersion: 3, clientId: CLIENT_B, to: 0 })).toMatchObject({ ok: false, error: { code: "STALE_COLLECTION" } });
  });

  it("refuses adding an unapproved case", async () => {
    const { useCases } = setup();
    expect(await useCases.addItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [DRAFT] })).toMatchObject({ ok: false, error: { code: "CASE_NOT_COLLECTABLE" } });
  });

  it("refuses adding past 200 cases, writing nothing", async () => {
    const many = Array.from({ length: 200 }, (_, i) => uuid(1000 + i));
    const cases = [...many.map((id) => listed(id, CLIENT_A)), listed(B2, CLIENT_B)];
    const { repo, useCases } = setup(stored(many), cases);
    expect(await useCases.addItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [B2] })).toMatchObject({ ok: false, error: { code: "COLLECTION_FULL" } });
    expect(repo.setItems).not.toHaveBeenCalled();
  });

  it("removes a case, and refuses removing the last one", async () => {
    const { useCases } = setup();
    expect(await useCases.removeItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [A2] })).toMatchObject({ ok: true, value: { caseIds: [A1, B1] } });
    const single = setup(stored([A1]));
    expect(await single.useCases.removeItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [A1] })).toMatchObject({ ok: false, error: { code: "COLLECTION_LAST_ITEM" } });
    expect(single.repo.setItems).not.toHaveBeenCalled();
  });

  it("removes a case no longer approved", async () => {
    const { useCases } = setup(stored([A1, DRAFT]));
    expect(await useCases.removeItems(actor, { collectionId: COLLECTION, expectedVersion: 3, caseIds: [DRAFT] })).toMatchObject({ ok: true, value: { caseIds: [A1] } });
  });

  it("moves a group and moves a case within its group", async () => {
    const { useCases } = setup();
    expect(await useCases.moveGroup(actor, { collectionId: COLLECTION, expectedVersion: 3, clientId: CLIENT_B, to: 0 })).toMatchObject({ ok: true, value: { caseIds: [B1, A1, A2] } });
    expect(await useCases.moveItem(actor, { collectionId: COLLECTION, expectedVersion: 3, caseId: A1, to: 1 })).toMatchObject({ ok: true, value: { caseIds: [A2, A1, B1] } });
  });

  it("never moves a case into another client's group", async () => {
    const { useCases } = setup();
    expect(await useCases.moveItem(actor, { collectionId: COLLECTION, expectedVersion: 3, caseId: A1, to: 2 })).toMatchObject({ ok: true, value: { caseIds: [A2, A1, B1] } });
    expect(await useCases.moveItem(actor, { collectionId: COLLECTION, expectedVersion: 3, caseId: B2, to: 0 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("drops a deleted case on the next write", async () => {
    const { repo, useCases } = setup(stored([A1, uuid(77), A2]));
    await useCases.moveItem(actor, { collectionId: COLLECTION, expectedVersion: 3, caseId: A1, to: 0 });
    expect(repo.setItems).toHaveBeenCalledWith(COLLECTION, 3, [A1, A2], actor.id, expect.anything());
  });

  it("writes nothing for a move that changes nothing", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.moveItem(actor, { collectionId: COLLECTION, expectedVersion: 3, caseId: A1, to: 0 })).toMatchObject({ ok: true, value: { version: 3 } });
    expect(repo.setItems).not.toHaveBeenCalled();
  });
});

describe("name and tags", () => {
  it("renames and retags with the expected version", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.rename(actor, { collectionId: COLLECTION, expectedVersion: 3, name: " Nuovo " })).toEqual({ ok: true, value: { collectionId: COLLECTION, version: 4, name: "Nuovo" } });
    expect(repo.rename).toHaveBeenCalledWith(COLLECTION, 3, "Nuovo", actor.id);
    expect(await useCases.retag(actor, { collectionId: COLLECTION, expectedVersion: 3, businessLines: ["video"], industries: ["moda", "food"] })).toMatchObject({ ok: true, value: { version: 4 } });
    expect(await useCases.retag(actor, { collectionId: COLLECTION, expectedVersion: 3, businessLines: [], industries: ["moda"] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("deletes", async () => {
    const { repo, useCases } = setup();
    expect(await useCases.remove(actor, { collectionId: COLLECTION })).toEqual({ ok: true, value: undefined });
    expect(repo.softDelete).toHaveBeenCalledWith(COLLECTION, actor.id);
  });
});
