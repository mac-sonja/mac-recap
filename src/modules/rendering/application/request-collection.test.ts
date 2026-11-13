import { describe, expect, it, vi } from "vitest";
import {
  ACTOR,
  CLIENT_ID,
  COLLECTION_ID,
  collectionCaseId,
  collectionDeps,
  collectionRevisionId,
  INTRO_ID,
  INTRO_REVISION_ID,
  OTHER_CLIENT_ID,
  packCaseRevision,
  revision,
  type CollectionCase,
} from "@/modules/rendering/application/export.fixtures";
import { bundleHashOfDrawings, readCollectionSources, readExportSource, readPackSources } from "@/modules/rendering/application/export-source";
import { makeCollectionStatus, makeRequestCollection, type RequestCollectionDeps } from "@/modules/rendering/application/request-export";
import type { ExportFormatId, ExportPart, ExportRecord } from "@/modules/rendering/domain/export";
import { err, ok } from "@/shared/result";

const JOB_ID = "99999999-0000-4000-8000-000000000001";
const EXPORT_ID = "88888888-0000-4000-8000-000000000001";

const casePart = (key: CollectionCase): ExportPart => ({ subject: { kind: "case", id: collectionCaseId(key) }, revisionId: collectionRevisionId(key) });
const introPart: ExportPart = { subject: { kind: "client_intro", id: INTRO_ID }, revisionId: INTRO_REVISION_ID };

function deps(options: Parameters<typeof collectionDeps>[0] = {}, over: Partial<RequestCollectionDeps> = {}) {
  return {
    ...collectionDeps(options),
    exports: {
      findByHash: vi.fn(async (): Promise<ReturnType<typeof ok<ExportRecord | null>>> => ok(null)),
      findById: vi.fn(async (): Promise<ReturnType<typeof ok<ExportRecord | null>>> => ok(null)),
    },
    storage: { presignDownload: vi.fn(async () => ok("https://storage.test/signed")) },
    enqueue: vi.fn(async () => ok({ id: JOB_ID })),
    getJobsFor: vi.fn(async () =>
      ok([] as { id: string; kind: string; status: "queued" | "running" | "succeeded" | "failed"; inputHash: string }[]),
    ),
    recordEvent: vi.fn(async () => ok(null)),
    recordCollectionEvent: vi.fn(async () => ok(undefined)),
    ...over,
  };
}

async function collectionNow(d: ReturnType<typeof deps>, formats: ExportFormatId[] = ["presentazione_16_9"]) {
  const read = await readCollectionSources(d, COLLECTION_ID, formats);
  if (!read.ok) throw new Error(read.error.code);
  return read.value;
}

const record = (hash: string, parts: ExportPart[], over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: EXPORT_ID,
  contentHash: hash,
  format: "presentazione_16_9",
  parts,
  path: `exports/${hash}/presentazione_16_9.pdf`,
  contentType: "application/pdf",
  sizeBytes: 1234,
  createdBy: ACTOR.id,
  createdAt: "2026-11-10T10:00:00Z",
  ...over,
});

const presentazione = () => revision().doc.formats.presentazione_16_9.pages;
/** MAC's intro and outro, around every Presentazione file. */
const MAC = 2;

describe("a collection's file (Story 5.10b)", () => {
  it("mixed: the intro of A and B's client, A and B without their own intros, its closing, then X whole; live revisions only", async () => {
    const d = deps();
    const file = await collectionNow(d);
    expect(file.parts).toEqual([introPart, casePart("A"), casePart("B"), casePart("X")]);
    expect(file.unavailable).toBe(0);
    for (const key of ["A", "B", "X"] as const) expect(d.getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: collectionCaseId(key) });
    // The other client has one case: its intro isn't even asked for.
    expect(d.getClientIntro).toHaveBeenCalledExactlyOnceWith(CLIENT_ID);
    const keep = presentazione().filter((p) => p.role !== "intro").length;
    const [drawing] = file.drawings;
    // MAC's intro and outro around it all.
    expect(drawing.pageCount).toBe(MAC + 1 + 2 * keep + 1 + presentazione().length);
    expect(drawing.code).toBe("");
    expect(drawing.name).toBe("Pitch moda");
    expect(drawing.pack).toBe(false);
    // Each part draws its own client's info.
    expect(drawing.parts.map((p) => p.clientId)).toEqual([CLIENT_ID, CLIENT_ID, CLIENT_ID, OTHER_CLIENT_ID]);
  });

  it.each(["unapproved", "none"] as const)("intro not approved (%s): A, B and X whole", async (intro) => {
    const file = await collectionNow(deps({ intro }));
    expect(file.parts).toEqual([casePart("A"), casePart("B"), casePart("X")]);
    expect(file.drawings[0].pageCount).toBe(MAC + 3 * presentazione().length);
  });

  it("a client with one case (A alone) keeps its own intro and closing, even with an approved intro", async () => {
    const file = await collectionNow(deps({ items: ["A", "X"] }));
    expect(file.parts).toEqual([casePart("A"), casePart("X")]);
  });

  it("leaves out X when it lost its approval, A when deleted, and counts it", async () => {
    const file = await collectionNow(deps({ unavailable: ["X"] }));
    expect(file.parts).toEqual([introPart, casePart("A"), casePart("B")]);
    expect(file.unavailable).toBe(1);
    // Down to one available case: the client's intro no longer wraps it.
    const one = await collectionNow(deps({ unavailable: ["B"] }));
    expect(one.parts).toEqual([casePart("A"), casePart("X")]);
    const gone = deps();
    const live = vi.mocked(gone.getCase).getMockImplementation()!;
    vi.mocked(gone.getCase).mockImplementation(async (id) => (id === collectionCaseId("A") ? err({ code: "NOT_FOUND", message: "gone" }) : live(id)));
    expect((await collectionNow(gone)).parts).toEqual([casePart("B"), casePart("X")]);
  });

  it("drops A's and B's own Carosello Chiusura and keeps their client's closing once; X keeps its own", async () => {
    const file = await collectionNow(deps(), ["carosello_1_1"]);
    const own = packCaseRevision("A").doc.formats.carosello_1_1.pages;
    const keep = own.filter((p) => p.role !== "intro" && p.pageKey !== "closing").length;
    expect(file.drawings[0].pageCount).toBe(1 + 2 * keep + 1 + revision().doc.formats.carosello_1_1.pages.length);
  });

  it("hashes apart from a case's own export and a client pack, and anew after a reorder, a rename or a newer approved version", async () => {
    const base = (await collectionNow(deps())).drawings[0].contentHash;
    expect((await collectionNow(deps())).drawings[0].contentHash).toBe(base);
    const solo = deps({ items: ["X"] });
    const single = await readExportSource(solo, collectionCaseId("X"), "presentazione_16_9");
    expect(single.ok && single.value.contentHash).not.toBe((await collectionNow(solo)).drawings[0].contentHash);
    const pair = deps({ items: ["A", "B"] });
    const pack = await readPackSources(pair, CLIENT_ID, ["presentazione_16_9"]);
    expect(pack.ok && pack.value.drawings[0].contentHash).not.toBe((await collectionNow(pair)).drawings[0].contentHash);
    expect((await collectionNow(deps({ items: ["X", "A", "B"] }))).drawings[0].contentHash).not.toBe(base);
    expect((await collectionNow(deps({ items: ["B", "A", "X"] }))).drawings[0].contentHash).not.toBe(base);
    expect((await collectionNow(deps({ name: "Pitch lusso" }))).drawings[0].contentHash).not.toBe(base);
    const updated = deps();
    const live = vi.mocked(updated.getLiveRevision).getMockImplementation()!;
    vi.mocked(updated.getLiveRevision).mockImplementation(async (subject) =>
      subject.kind === "case" && subject.id === collectionCaseId("X")
        ? ok(revision({ id: "eeeeeeee-0000-4000-8000-0000000000ab", caseId: collectionCaseId("X") }))
        : live(subject),
    );
    expect((await collectionNow(updated)).drawings[0].contentHash).not.toBe(base);
  });

  it("refuses a collection with no available case (NOT_APPROVED), enqueueing nothing", async () => {
    const d = deps({ unavailable: ["A", "B", "X"] });
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] })).toMatchObject({
      ok: false,
      error: { code: "NOT_APPROVED" },
    });
    expect(d.enqueue).not.toHaveBeenCalled();
  });
});

describe("requestCollection (Story 5.10b)", () => {
  it("enqueues one export job for the collection with all its parts in order", async () => {
    const d = deps();
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] })).toEqual(
      ok({ status: "pending", jobId: JOB_ID }),
    );
    const file = await collectionNow(d);
    expect(d.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: "export",
      subjectId: COLLECTION_ID,
      inputHash: file.drawings[0].contentHash,
      payload: {
        subject: { kind: "collection", id: COLLECTION_ID },
        parts: [introPart, casePart("A"), casePart("B"), casePart("X")],
        format: "presentazione_16_9",
        requestedBy: ACTOR.id,
      },
    });
  });

  it("asks for two formats as one bundle job", async () => {
    const d = deps();
    await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9", "carosello_1_1"] });
    const file = await collectionNow(d, ["presentazione_16_9", "carosello_1_1"]);
    expect(d.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        inputHash: bundleHashOfDrawings(file.drawings),
        payload: expect.objectContaining({ format: "bundle", formats: ["carosello_1_1", "presentazione_16_9"] }),
      }),
    );
  });

  it("reuses a stored file: no job, named after the collection, one collection_exported event", async () => {
    const d = deps();
    const file = await collectionNow(d);
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(file.drawings[0].contentHash, [...file.parts])));
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] })).toEqual(
      ok({ status: "ready", exportId: EXPORT_ID, url: "https://storage.test/signed", fileName: "Pitch moda – Presentazione.pdf" }),
    );
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.recordCollectionEvent).toHaveBeenCalledExactlyOnceWith(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID, format: "presentazione_16_9" });
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("refuses bad input and Video before reading anything", async () => {
    const d = deps();
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: "x", formats: ["presentazione_16_9"] })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["collectionId"] } },
    });
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["video_9_16"] })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_EXPORTABLE" },
    });
    expect(d.getCollection).not.toHaveBeenCalled();
  });

  it("passes on an unknown collection (COLLECTION_NOT_FOUND)", async () => {
    const d = deps({}, { getCollection: vi.fn(async () => err({ code: "COLLECTION_NOT_FOUND", message: "No collection." })) });
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] })).toMatchObject({
      ok: false,
      error: { code: "COLLECTION_NOT_FOUND" },
    });
  });
});

describe("collectionStatus (Story 5.10b)", () => {
  it("is pending while the collection's job runs, and ready with the stored file once it succeeded", async () => {
    const d = deps();
    const file = await collectionNow(d);
    const hash = file.drawings[0].contentHash;
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "running", inputHash: hash }]));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    expect(d.getJobsFor).toHaveBeenCalledWith(COLLECTION_ID);
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "succeeded", inputHash: hash }]));
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(hash, [...file.parts])));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toMatchObject({ ok: true, value: { status: "ready" } });
    expect(d.recordCollectionEvent).toHaveBeenCalledOnce();
  });

  it("refuses the file of the collection as it was: reordered (EXPORT_STALE), renamed (EXPORT_STALE)", async () => {
    const d = deps();
    const file = await collectionNow(d);
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record(file.drawings[0].contentHash, [...file.parts])));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({ ok: true });
    const reordered = deps({ items: ["X", "A", "B"] });
    vi.mocked(reordered.exports.findById).mockResolvedValue(ok(record(file.drawings[0].contentHash, [...file.parts])));
    expect(await makeCollectionStatus(reordered)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: false,
      error: { code: "EXPORT_STALE" },
    });
    const renamed = deps({ name: "Pitch lusso" });
    vi.mocked(renamed.exports.findById).mockResolvedValue(ok(record(file.drawings[0].contentHash, [...file.parts])));
    expect(await makeCollectionStatus(renamed)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: false,
      error: { code: "EXPORT_STALE" },
    });
    expect(renamed.recordCollectionEvent).not.toHaveBeenCalled();
  });

  it("never hands out a case's own export or a client pack as the collection, even with the same parts", async () => {
    const solo = deps({ items: ["X"] });
    const single = await readExportSource(solo, collectionCaseId("X"), "presentazione_16_9");
    if (!single.ok) throw new Error(single.error.code);
    vi.mocked(solo.exports.findById).mockResolvedValue(ok(record(single.value.contentHash, [casePart("X")])));
    expect(await makeCollectionStatus(solo)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: false,
      error: { code: "EXPORT_STALE" },
    });
    const pair = deps({ items: ["A", "B"] });
    const pack = await readPackSources(pair, CLIENT_ID, ["presentazione_16_9"]);
    if (!pack.ok) throw new Error(pack.error.code);
    vi.mocked(pair.exports.findById).mockResolvedValue(ok(record(pack.value.drawings[0].contentHash, [...pack.value.parts])));
    expect(await makeCollectionStatus(pair)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: false,
      error: { code: "EXPORT_STALE" },
    });
    expect(solo.recordCollectionEvent).not.toHaveBeenCalled();
    expect(pair.recordCollectionEvent).not.toHaveBeenCalled();
  });

  it("refuses a file of none of its cases (NOT_FOUND)", async () => {
    const d = deps({ items: ["A", "B"] });
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64), [casePart("X")])));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("finds a stored bundle by its hash, named after the collection", async () => {
    const d = deps();
    const file = await collectionNow(d, ["presentazione_16_9", "carosello_1_1"]);
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record(bundleHashOfDrawings(file.drawings), [...file.parts], { format: "bundle" })));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: true,
      value: { fileName: "Pitch moda.zip" },
    });
  });

  it("refuses a collection with no available case before looking a file up (NOT_APPROVED)", async () => {
    const d = deps({ unavailable: ["A", "B", "X"] });
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "succeeded", inputHash: "a".repeat(64) }]));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    expect(d.exports.findById).not.toHaveBeenCalled();
    expect(d.exports.findByHash).not.toHaveBeenCalled();
  });

  it("answers a queued, running or failed job from its state alone, reading no collection", async () => {
    const d = deps();
    for (const status of ["queued", "running"] as const) {
      vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status, inputHash: "a".repeat(64) }]));
      expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    }
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "failed", inputHash: "a".repeat(64) }]));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toEqual(ok({ status: "failed" }));
    expect(d.getCollection).not.toHaveBeenCalled();
    expect(d.getLiveRevision).not.toHaveBeenCalled();
  });

  it("reads the collection once to hand out a ready bundle, even when a part lacks a format", async () => {
    const d = deps();
    const file = await collectionNow(d, ["presentazione_16_9", "carosello_1_1"]);
    const hash = bundleHashOfDrawings(file.drawings);
    vi.mocked(d.getCollection).mockClear();
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "succeeded", inputHash: hash }]));
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(hash, [...file.parts], { format: "bundle" })));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toMatchObject({ ok: true, value: { status: "ready", fileName: "Pitch moda.zip" } });
    expect(d.getCollection).toHaveBeenCalledOnce();

    // X has no Carosello now: the stored Presentazione is still handed out, the bundle is stale.
    const live = vi.mocked(d.getLiveRevision).getMockImplementation()!;
    vi.mocked(d.getLiveRevision).mockImplementation(async (subject) => {
      const found = await live(subject);
      if (subject.id !== collectionCaseId("X") || !found.ok || found.value === null) return found;
      return ok({ ...found.value, doc: { ...found.value.doc, formats: { ...found.value.doc.formats, carosello_1_1: { pages: [] } } } } as typeof found.value);
    });
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toMatchObject({ ok: false, error: { code: "EXPORT_STALE" } });
    const single = file.drawings.find((dr) => dr.format === "presentazione_16_9")!.contentHash;
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "succeeded", inputHash: single }]));
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(single, [...file.parts])));
    expect(await makeCollectionStatus(d)(ACTOR, { collectionId: COLLECTION_ID, jobId: JOB_ID })).toMatchObject({ ok: true, value: { status: "ready" } });
  });

  it("names files Raccolta when nothing of the collection's name is safe", async () => {
    const d = deps({ name: "/:/" });
    const file = await collectionNow(d);
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(file.drawings[0].contentHash, [...file.parts])));
    expect(await makeRequestCollection(d)(ACTOR, { collectionId: COLLECTION_ID, formats: ["presentazione_16_9"] })).toMatchObject({
      ok: true,
      value: { fileName: "Raccolta – Presentazione.pdf" },
    });
  });

  it("names the wrong fields", async () => {
    expect(await makeCollectionStatus(deps())(ACTOR, { collectionId: "x" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_INPUT", details: { fields: ["collectionId", "jobId"] } },
    });
  });
});
