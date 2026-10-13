import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/access";
import { hasText, MAX_TEXT_BODY_CHARS, type TextItem } from "@/modules/material/domain/text-item";
import type { AssetRepository } from "@/modules/material/ports/asset-repository";
import type { TextItemRepository } from "@/modules/material/ports/text-item-repository";
import { err, ok } from "@/shared/result";
import { makeAddTextItem } from "./add-text-item";
import type { CaseStudies, MaterialDeps } from "./deps";
import { makeEditTextItem } from "./edit-text-item";
import { makeHasMaterial } from "./has-material";
import { makeRemoveTextItem } from "./remove-text-item";
import { makeRestoreTextItem } from "./restore-text-item";

const actor: Actor = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "dev-owner-designer@mac-recap.invalid",
  displayName: "Dev owner/designer",
  role: "owner_designer",
};

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const DELETED_CASE_ID = "aaaaaaaa-0000-4000-8000-000000000002";
const UNKNOWN_TEXT_ID = "dddddddd-0000-4000-8000-000000000009";

interface StoredAsset {
  caseId: string;
  deletedAt: string | null;
}

/**
 * In-memory world: a live case and a soft-deleted one, text items mirroring the
 * repository contract, live/removed assets (only for `hasMaterial` and the cap),
 * the recorded events and the case status (which must never change).
 */
function world({ liveAssets = 0, removedAssets = 0 }: { liveAssets?: number; removedAssets?: number } = {}) {
  const texts = new Map<string, TextItem>();
  const assets: StoredAsset[] = [
    ...Array.from({ length: liveAssets }, () => ({ caseId: CASE_ID, deletedAt: null })),
    ...Array.from({ length: removedAssets }, () => ({ caseId: CASE_ID, deletedAt: "2026-10-13T11:00:00Z" })),
  ];
  const events: { caseId: string; type: string; data: Record<string, string>; actorId: string }[] = [];
  const status = { [CASE_ID]: "draft" };
  let n = 0;
  let clock = 0;
  const now = () => `2026-10-13T12:00:${String(++clock).padStart(2, "0")}Z`;

  const seed = (over: Partial<TextItem> = {}) => {
    const id = `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const at = now();
    texts.set(id, {
      id,
      caseId: CASE_ID,
      title: `Seed ${n}`,
      body: "Testo",
      createdBy: actor.id,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      ...over,
    });
    return id;
  };

  const repo = {
    create: vi.fn<TextItemRepository["create"]>(async (item) => {
      const id = seed({ ...item });
      return ok(texts.get(id) as TextItem);
    }),
    getLive: vi.fn<TextItemRepository["getLive"]>(async (caseId, id) => {
      const row = texts.get(id);
      return ok(row && row.caseId === caseId && row.deletedAt === null ? row : null);
    }),
    update: vi.fn<TextItemRepository["update"]>(async (caseId, id, content) => {
      const row = texts.get(id);
      if (!row || row.caseId !== caseId || row.deletedAt !== null) return ok(null);
      const next = { ...row, ...content, updatedAt: now() };
      texts.set(id, next);
      return ok(next);
    }),
    softDelete: vi.fn<TextItemRepository["softDelete"]>(async (caseId, id) => {
      const row = texts.get(id);
      if (!row || row.caseId !== caseId || row.deletedAt !== null) return ok(false);
      texts.set(id, { ...row, deletedAt: now() });
      return ok(true);
    }),
    restore: vi.fn<TextItemRepository["restore"]>(async (caseId, id) => {
      const row = texts.get(id);
      if (!row || row.caseId !== caseId) return err({ code: "NOT_FOUND", message: "none" });
      if (row.deletedAt === null) return ok(false);
      texts.set(id, { ...row, deletedAt: null });
      return ok(true);
    }),
    hasMaterial: vi.fn<TextItemRepository["hasMaterial"]>(async (caseId) =>
      ok(
        assets.some((a) => a.caseId === caseId && a.deletedAt === null) ||
          [...texts.values()].some((t) => t.caseId === caseId && t.deletedAt === null && hasText(t.body)),
      ),
    ),
  } satisfies TextItemRepository;

  const assetRepo = {
    countLive: vi.fn<AssetRepository["countLive"]>(async (caseId) =>
      ok(assets.filter((a) => a.caseId === caseId && a.deletedAt === null).length),
    ),
    create: vi.fn<AssetRepository["create"]>(),
    softDelete: vi.fn<AssetRepository["softDelete"]>(),
    restore: vi.fn<AssetRepository["restore"]>(),
  } satisfies AssetRepository;

  const cases = {
    get: vi.fn<CaseStudies["get"]>(async (id) =>
      id === CASE_ID ? ok({ id, status: status[CASE_ID] }) : err({ code: "NOT_FOUND", message: "No case study with this id." }),
    ),
    recordEvent: vi.fn<CaseStudies["recordEvent"]>(async (who, input) => {
      events.push({ ...input, actorId: who.id });
      return ok({});
    }),
  } satisfies CaseStudies;

  // Text paths run without storage.
  const deps: MaterialDeps = { assets: assetRepo, texts: repo, storage: null, cases, newId: () => "unused" };
  return { deps, repo, assetRepo, cases, texts, events, status, seed };
}

const codeOf = (result: { ok: boolean; error?: { code: string } }) => (result.ok ? "OK" : result.error?.code);
const fieldsOf = (result: { ok: boolean; error?: { details?: unknown } }) =>
  result.ok ? undefined : (result.error?.details as { fields: string[] }).fields;
const eventFailure = err({ code: "CASE_EVENT_WRITE_FAILED", message: "down" });

/**
 * Fails the event write, runs `act` (whose undo is set up to fail), and expects
 * the use case to return the event error and log one compensation error naming
 * the event, with correlation ids only and no title or body.
 */
async function expectUndoFailureLogged(
  act: (w: ReturnType<typeof world>) => Promise<unknown>,
  eventType: string,
) {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    const w = world();
    w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
    expect(await act(w)).toEqual(eventFailure);
    const lines = write.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "error",
      msg: expect.stringContaining(`without its ${eventType} event: compensation failed`),
      caseId: CASE_ID,
      actorId: actor.id,
    });
    expect(lines[0]).not.toMatch(/SECRET/);
  } finally {
    write.mockRestore();
  }
}

describe("addTextItem", () => {
  const input = { caseId: CASE_ID, title: "Brief", body: "Testo" };

  it("stores the text item and records text_added { textItemId }; status unchanged; no storage needed", async () => {
    const w = world();
    const result = await makeAddTextItem(w.deps)(actor, input);
    expect(result).toEqual(
      ok(expect.objectContaining({ caseId: CASE_ID, title: "Brief", body: "Testo", createdBy: actor.id, deletedAt: null })),
    );
    const id = result.ok ? result.value.id : "";
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "text_added", data: { textItemId: id }, actorId: actor.id }]);
    expect(w.status[CASE_ID]).toBe("draft");
  });

  it("trims the title and stores the body as given", async () => {
    const w = world();
    const body = "  riga uno\n\n  riga due  \n";
    const result = await makeAddTextItem(w.deps)(actor, { ...input, title: "  Brief  ", body });
    expect(result.ok && [result.value.title, result.value.body]).toEqual(["Brief", body]);
  });

  it.each([
    ["an empty body", ""],
    ["a whitespace-only body", "  \n "],
    ["tabs and newlines only", "\t\r\n"],
  ])("%s → TEXT_EMPTY; nothing stored", async (_label, body) => {
    const w = world();
    expect(codeOf(await makeAddTextItem(w.deps)(actor, { ...input, body }))).toBe("TEXT_EMPTY");
    expect(w.repo.create).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it.each([
    ["a blank title", { ...input, title: "   " }, ["title"]],
    ["a missing title", { caseId: CASE_ID, body: "Testo" }, ["title"]],
    ["a 201-char title", { ...input, title: "t".repeat(201) }, ["title"]],
    ["a 200,001-char body", { ...input, body: "b".repeat(MAX_TEXT_BODY_CHARS + 1) }, ["body"]],
    ["a missing body", { caseId: CASE_ID, title: "Brief" }, ["body"]],
    ["a malformed case id", { ...input, caseId: "nope" }, ["caseId"]],
    ["NUL in the title", { ...input, title: "Bri\u0000ef" }, ["title"]],
    ["NUL in the body", { ...input, body: "Tes\u0000to" }, ["body"]],
    ["a 201-emoji title", { ...input, title: "😀".repeat(201) }, ["title"]],
  ])("%s → INVALID_INPUT naming %j; nothing stored", async (_label, bad, fields) => {
    const w = world();
    const result = await makeAddTextItem(w.deps)(actor, bad);
    expect(codeOf(result)).toBe("INVALID_INPUT");
    expect(fieldsOf(result)).toEqual(fields);
    expect(w.repo.create).not.toHaveBeenCalled();
  });

  it("accepts a 200-char title and a 200,000-char body", async () => {
    const w = world();
    const result = await makeAddTextItem(w.deps)(actor, { ...input, title: "t".repeat(200), body: "b".repeat(MAX_TEXT_BODY_CHARS) });
    expect(codeOf(result)).toBe("OK");
  });

  it("counts title characters as code points after trimming: 200 emoji accepted", async () => {
    const w = world();
    const title = "😀".repeat(200);
    const result = await makeAddTextItem(w.deps)(actor, { ...input, title: `  ${title}  ` });
    expect(result.ok && result.value.title).toBe(title);
  });

  it("counts body characters as code points, not UTF-16 units", async () => {
    const w = world();
    const emoji = "😀".repeat(MAX_TEXT_BODY_CHARS);
    expect(codeOf(await makeAddTextItem(w.deps)(actor, { ...input, body: emoji }))).toBe("OK");
    expect(codeOf(await makeAddTextItem(w.deps)(actor, { ...input, body: `${emoji}x` }))).toBe("INVALID_INPUT");
  });

  it("is stored when the case already has 20 live files (no cap on text)", async () => {
    const w = world({ liveAssets: 20 });
    expect(codeOf(await makeAddTextItem(w.deps)(actor, input))).toBe("OK");
    expect(w.assetRepo.countLive).not.toHaveBeenCalled();
    expect(w.texts.size).toBe(1);
  });

  it("a soft-deleted case → NOT_FOUND; nothing stored", async () => {
    const w = world();
    expect(codeOf(await makeAddTextItem(w.deps)(actor, { ...input, caseId: DELETED_CASE_ID }))).toBe("NOT_FOUND");
    expect(w.repo.create).not.toHaveBeenCalled();
  });

  it("if the event write fails, soft-deletes the new item and returns the error", async () => {
    const w = world();
    w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
    expect(await makeAddTextItem(w.deps)(actor, input)).toEqual(eventFailure);
    const [row] = [...w.texts.values()];
    expect(row.deletedAt).not.toBeNull();
  });

  it("never logs the title or body", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const w = world();
      w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
      w.repo.softDelete.mockResolvedValueOnce(err({ code: "TEXT_WRITE_FAILED", message: "down" }));
      await makeAddTextItem(w.deps)(actor, { ...input, title: "SECRET-TITLE", body: "SECRET-BODY" });
      expect(write).toHaveBeenCalled();
      for (const [line] of write.mock.calls) expect(String(line)).not.toMatch(/SECRET/);
    } finally {
      write.mockRestore();
    }
  });
});

describe("editTextItem", () => {
  const edit = (textItemId: string, over: Record<string, unknown> = {}) => ({
    caseId: CASE_ID,
    textItemId,
    title: "Nuovo",
    body: "Testo nuovo",
    ...over,
  });

  it("updates title and body, touches updated_at and records text_edited { textItemId }", async () => {
    const w = world();
    const id = w.seed();
    const before = w.texts.get(id) as TextItem;
    const result = await makeEditTextItem(w.deps)(actor, edit(id));
    expect(result).toEqual(ok(expect.objectContaining({ id, title: "Nuovo", body: "Testo nuovo" })));
    expect((w.texts.get(id) as TextItem).updatedAt).not.toBe(before.updatedAt);
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "text_edited", data: { textItemId: id }, actorId: actor.id }]);
    expect(w.status[CASE_ID]).toBe("draft");
  });

  it.each([
    ["an unknown item", () => UNKNOWN_TEXT_ID],
    ["a removed item", (w: ReturnType<typeof world>) => w.seed({ deletedAt: "2026-10-13T11:00:00Z" })],
  ])("%s → NOT_FOUND; no event", async (_label, pick) => {
    const w = world();
    const id = pick(w);
    expect(codeOf(await makeEditTextItem(w.deps)(actor, edit(id)))).toBe("NOT_FOUND");
    expect(w.repo.update).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it("an empty body → TEXT_EMPTY; unchanged", async () => {
    const w = world();
    const id = w.seed();
    expect(codeOf(await makeEditTextItem(w.deps)(actor, edit(id, { body: " \n " })))).toBe("TEXT_EMPTY");
    expect((w.texts.get(id) as TextItem).body).toBe("Testo");
    expect(w.events).toEqual([]);
  });

  it.each([
    ["a blank title", { title: "" }, ["title"]],
    ["a 201-char title", { title: "t".repeat(201) }, ["title"]],
    ["a 200,001-char body", { body: "b".repeat(MAX_TEXT_BODY_CHARS + 1) }, ["body"]],
    ["a malformed text item id", { textItemId: "x" }, ["textItemId"]],
    ["NUL in the title", { title: "a\u0000b" }, ["title"]],
    ["NUL in the body", { body: "a\u0000b" }, ["body"]],
  ])("%s → INVALID_INPUT naming %j", async (_label, over, fields) => {
    const w = world();
    const id = w.seed();
    const result = await makeEditTextItem(w.deps)(actor, edit(id, over));
    expect(fieldsOf(result)).toEqual(fields);
    expect(w.repo.update).not.toHaveBeenCalled();
  });

  it("a soft-deleted case → NOT_FOUND without reading text items", async () => {
    const w = world();
    const id = w.seed();
    expect(codeOf(await makeEditTextItem(w.deps)(actor, edit(id, { caseId: DELETED_CASE_ID })))).toBe("NOT_FOUND");
    expect(w.repo.getLive).not.toHaveBeenCalled();
  });

  it("passes a TEXT_LOOKUP_FAILED from getLive through without updating", async () => {
    const w = world();
    const id = w.seed();
    const failure = err({ code: "TEXT_LOOKUP_FAILED", message: "down" });
    w.repo.getLive.mockResolvedValueOnce(failure);
    expect(await makeEditTextItem(w.deps)(actor, edit(id))).toEqual(failure);
    expect(w.repo.update).not.toHaveBeenCalled();
    expect(w.events).toEqual([]);
  });

  it.each([
    ["fails", err({ code: "TEXT_WRITE_FAILED", message: "down" })],
    ["finds no live item", ok(null)],
  ] as const)("logs (without title or body) when the undo %s", async (_label, undo) => {
    await expectUndoFailureLogged((w) => {
      const id = w.seed({ title: "SECRET-OLD", body: "SECRET-OLD-BODY" });
      w.repo.update.mockImplementationOnce(async (caseId, textItemId, content) => {
        const row = { ...(w.texts.get(textItemId) as TextItem), ...content, caseId };
        w.texts.set(textItemId, row);
        return ok(row);
      });
      w.repo.update.mockResolvedValueOnce(undo);
      return makeEditTextItem(w.deps)(actor, edit(id, { title: "SECRET-NEW", body: "SECRET-NEW-BODY" }));
    }, "text_edited");
  });

  it("if the event write fails, puts the previous title and body back and returns the error", async () => {
    const w = world();
    const id = w.seed({ title: "Vecchio", body: "Testo vecchio" });
    w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
    expect(await makeEditTextItem(w.deps)(actor, edit(id))).toEqual(eventFailure);
    expect(w.texts.get(id)).toMatchObject({ title: "Vecchio", body: "Testo vecchio" });
  });
});

describe("removeTextItem", () => {
  it("soft-deletes a live item and records text_removed { textItemId }", async () => {
    const w = world();
    const id = w.seed();
    expect(await makeRemoveTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id })).toEqual(ok(undefined));
    expect(w.texts.get(id)?.deletedAt).not.toBeNull();
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "text_removed", data: { textItemId: id }, actorId: actor.id }]);
    expect(w.status[CASE_ID]).toBe("draft");
  });

  it.each([
    ["an unknown item", () => UNKNOWN_TEXT_ID],
    ["an already removed item", (w: ReturnType<typeof world>) => w.seed({ deletedAt: "2026-10-13T11:00:00Z" })],
  ])("%s → NOT_FOUND; no event", async (_label, pick) => {
    const w = world();
    const id = pick(w);
    expect(codeOf(await makeRemoveTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id }))).toBe("NOT_FOUND");
    expect(w.events).toEqual([]);
  });

  it("a soft-deleted case → NOT_FOUND without touching text items", async () => {
    const w = world();
    const id = w.seed();
    expect(codeOf(await makeRemoveTextItem(w.deps)(actor, { caseId: DELETED_CASE_ID, textItemId: id }))).toBe("NOT_FOUND");
    expect(w.repo.softDelete).not.toHaveBeenCalled();
  });

  it.each([
    ["fails", err({ code: "TEXT_WRITE_FAILED", message: "down" })],
    ["finds it already live", ok(false)],
  ] as const)("logs when the undo %s", async (_label, undo) => {
    await expectUndoFailureLogged((w) => {
      const id = w.seed({ title: "SECRET-TITLE", body: "SECRET-BODY" });
      w.repo.restore.mockResolvedValueOnce(undo);
      return makeRemoveTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id });
    }, "text_removed");
  });

  it("if the event write fails, restores the item and returns the error", async () => {
    const w = world();
    const id = w.seed();
    w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
    expect(await makeRemoveTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id })).toEqual(eventFailure);
    expect(w.texts.get(id)?.deletedAt).toBeNull();
  });
});

describe("restoreTextItem", () => {
  it("clears deleted_at and records text_restored { textItemId }, even with 20 live files", async () => {
    const w = world({ liveAssets: 20 });
    const id = w.seed({ deletedAt: "2026-10-13T11:00:00Z" });
    expect(await makeRestoreTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id })).toEqual(ok(undefined));
    expect(w.texts.get(id)?.deletedAt).toBeNull();
    expect(w.events).toEqual([{ caseId: CASE_ID, type: "text_restored", data: { textItemId: id }, actorId: actor.id }]);
  });

  it("a live item → ok, no event", async () => {
    const w = world();
    const id = w.seed();
    expect(await makeRestoreTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id })).toEqual(ok(undefined));
    expect(w.events).toEqual([]);
  });

  it("an unknown item → NOT_FOUND", async () => {
    const w = world();
    expect(codeOf(await makeRestoreTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: UNKNOWN_TEXT_ID }))).toBe("NOT_FOUND");
  });

  it("a soft-deleted case → NOT_FOUND", async () => {
    const w = world();
    const id = w.seed({ deletedAt: "2026-10-13T11:00:00Z" });
    expect(codeOf(await makeRestoreTextItem(w.deps)(actor, { caseId: DELETED_CASE_ID, textItemId: id }))).toBe("NOT_FOUND");
    expect(w.repo.restore).not.toHaveBeenCalled();
  });

  it.each([
    ["fails", err({ code: "TEXT_WRITE_FAILED", message: "down" })],
    ["finds nothing live", ok(false)],
  ] as const)("logs when the undo %s", async (_label, undo) => {
    await expectUndoFailureLogged((w) => {
      const id = w.seed({ title: "SECRET-TITLE", body: "SECRET-BODY", deletedAt: "2026-10-13T11:00:00Z" });
      w.repo.softDelete.mockResolvedValueOnce(undo);
      return makeRestoreTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id });
    }, "text_restored");
  });

  it("if the event write fails, removes the item again and returns the error", async () => {
    const w = world();
    const id = w.seed({ deletedAt: "2026-10-13T11:00:00Z" });
    w.cases.recordEvent.mockResolvedValueOnce(eventFailure);
    expect(await makeRestoreTextItem(w.deps)(actor, { caseId: CASE_ID, textItemId: id })).toEqual(eventFailure);
    expect(w.texts.get(id)?.deletedAt).not.toBeNull();
  });
});

describe("hasMaterial", () => {
  it("none: no assets, no text items → false", async () => {
    const w = world();
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(ok(false));
  });

  it("asset: one live asset → true", async () => {
    const w = world({ liveAssets: 1 });
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(ok(true));
  });

  it("text: one live, non-empty text item → true", async () => {
    const w = world();
    w.seed();
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(ok(true));
  });

  it("removed only: all assets and text items soft-deleted → false", async () => {
    const w = world({ removedAssets: 2 });
    w.seed({ deletedAt: "2026-10-13T11:00:00Z" });
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(ok(false));
  });

  it("a malformed case id → INVALID_INPUT without a query", async () => {
    const w = world();
    expect(codeOf(await makeHasMaterial(w.deps)("nope"))).toBe("INVALID_INPUT");
    expect(w.repo.hasMaterial).not.toHaveBeenCalled();
  });

  it("passes a lookup failure through", async () => {
    const w = world();
    const failure = err({ code: "MATERIAL_LOOKUP_FAILED", message: "down" });
    w.repo.hasMaterial.mockResolvedValueOnce(failure);
    expect(await makeHasMaterial(w.deps)(CASE_ID)).toEqual(failure);
  });
});
