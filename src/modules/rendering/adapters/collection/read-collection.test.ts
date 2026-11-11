import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/result";

vi.mock("@/modules/collection", () => ({ getCollection: vi.fn(), getCollectionEdits: vi.fn() }));

const collection = await import("@/modules/collection");
const { readCollectionEdits } = await import("@/modules/rendering/adapters/collection/read-collection");

const CASE = "CCCCCCCC-0000-4000-8000-00000000000A";
const CLIENT = "DDDDDDDD-0000-4000-8000-000000000001";

describe("readCollectionEdits (Story 5.11b)", () => {
  it("maps every edit to a part key with the id in lower case, every field carried across", async () => {
    vi.mocked(collection.getCollectionEdits).mockResolvedValue(
      ok({
        textEdits: [
          { part: { kind: "case", id: CASE }, formatId: "presentazione_16_9", pageKey: "intro", elementId: "e-1", text: "Titolo", originalChanged: true },
          { part: { kind: "client_intro", id: CLIENT }, formatId: "carosello_1_1", pageKey: "closing", elementId: "e-2", text: "Ciao", originalChanged: false },
        ],
        hiddenPages: [
          { part: { kind: "case", id: CASE }, formatId: "carosello_1_1", pageKey: "risultati" },
          { part: { kind: "client_intro", id: CLIENT }, formatId: "presentazione_16_9", pageKey: "intro" },
        ],
        pageOrders: [
          { part: { kind: "case", id: CASE }, formatId: "presentazione_16_9", pageKeys: ["risultati", "intro"] },
          { part: { kind: "client_intro", id: CLIENT }, formatId: "carosello_1_1", pageKeys: ["closing", "intro"] },
        ],
      }),
    );
    expect(await readCollectionEdits("c0c0c0c0-0000-4000-8000-000000000001")).toEqual(
      ok({
        texts: [
          { partKey: `case:${CASE.toLowerCase()}`, formatId: "presentazione_16_9", pageKey: "intro", elementId: "e-1", text: "Titolo" },
          { partKey: `client_intro:${CLIENT.toLowerCase()}`, formatId: "carosello_1_1", pageKey: "closing", elementId: "e-2", text: "Ciao" },
        ],
        hidden: [
          { partKey: `case:${CASE.toLowerCase()}`, formatId: "carosello_1_1", pageKey: "risultati" },
          { partKey: `client_intro:${CLIENT.toLowerCase()}`, formatId: "presentazione_16_9", pageKey: "intro" },
        ],
        orders: [
          { partKey: `case:${CASE.toLowerCase()}`, formatId: "presentazione_16_9", pageKeys: ["risultati", "intro"] },
          { partKey: `client_intro:${CLIENT.toLowerCase()}`, formatId: "carosello_1_1", pageKeys: ["closing", "intro"] },
        ],
      }),
    );
    expect(collection.getCollectionEdits).toHaveBeenCalledWith("c0c0c0c0-0000-4000-8000-000000000001");
  });

  it("passes a failed read on", async () => {
    const failed = err({ code: "COLLECTION_NOT_FOUND", message: "gone" });
    vi.mocked(collection.getCollectionEdits).mockResolvedValue(failed);
    expect(await readCollectionEdits("x")).toEqual(failed);
  });
});
