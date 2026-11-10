import { describe, expect, it, vi } from "vitest";
import type { CaseStudyRevision } from "@/modules/case-study";
import {
  ACTOR,
  CLIENT_ID,
  INTRO_ID,
  INTRO_REVISION_ID,
  PACK_CASES,
  PACK_REVISIONS,
  packDeps,
  revision,
} from "@/modules/rendering/application/export.fixtures";
import { readExportSource, readPackSources } from "@/modules/rendering/application/export-source";
import { makePackStatus, makeRequestPack, type RequestPackDeps } from "@/modules/rendering/application/request-export";
import type { ExportFormatId, ExportPart, ExportRecord } from "@/modules/rendering/domain/export";
import { ok } from "@/shared/result";

const JOB_ID = "99999999-0000-4000-8000-000000000001";
const EXPORT_ID = "88888888-0000-4000-8000-000000000001";

const casePart = (key: keyof typeof PACK_CASES): ExportPart => ({ subject: { kind: "case", id: PACK_CASES[key] }, revisionId: PACK_REVISIONS[key] });
const introPart: ExportPart = { subject: { kind: "client_intro", id: INTRO_ID }, revisionId: INTRO_REVISION_ID };

function deps(options: Parameters<typeof packDeps>[0] = {}, over: Partial<RequestPackDeps> = {}) {
  return {
    ...packDeps(options),
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
    ...over,
  };
}

async function packNow(d: ReturnType<typeof deps>, formats: ExportFormatId[] = ["presentazione_16_9"]) {
  const read = await readPackSources(d, CLIENT_ID, formats);
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

describe("a client's pack (Story 5.9a)", () => {
  it("is the approved intro, then the approved cases in the client's order, read from live revisions only", async () => {
    const d = deps({ order: ["C", "A", "B"] });
    const pack = await packNow(d);
    expect(pack.parts).toEqual([introPart, casePart("C"), casePart("A"), casePart("B")]);
    expect(d.getLiveRevision).toHaveBeenCalledWith({ kind: "client_intro", id: INTRO_ID });
    for (const id of Object.values(PACK_CASES)) expect(d.getLiveRevision).toHaveBeenCalledWith({ kind: "case", id });
    // Intro pages, each case without its own intro page, the client's closing once; numbered on.
    const [drawing] = pack.drawings;
    const caseKeep = revision().doc.formats.presentazione_16_9.pages.filter((p) => p.role !== "intro").length;
    expect(drawing.pageCount).toBe(1 + 3 * caseKeep + 1);
    expect(drawing.code).toBe("LUM");
    expect(drawing.name).toBe("Lumen Srl");
  });

  it("with one case and an approved intro: intro, the case without its intro, closing", async () => {
    const pack = await packNow(deps({ order: ["A"] }));
    expect(pack.parts).toEqual([introPart, casePart("A")]);
    const all = revision().doc.formats.presentazione_16_9.pages;
    expect(pack.drawings[0].pageCount).toBe(1 + all.filter((p) => p.role !== "intro").length + 1);
  });

  it.each(["unapproved", "none"] as const)("without an approved intro (%s): each case whole", async (intro) => {
    const pack = await packNow(deps({ order: ["A", "B"], intro }));
    expect(pack.intro).toBeNull();
    expect(pack.parts).toEqual([casePart("A"), casePart("B")]);
    expect(pack.drawings[0].pageCount).toBe(2 * revision().doc.formats.presentazione_16_9.pages.length);
  });

  it("drops each case's own Carosello Chiusura (none in this document) and keeps the client's closing once", async () => {
    const pack = await packNow(deps({ order: ["A", "B"] }), ["carosello_1_1"]);
    const keep = revision().doc.formats.carosello_1_1.pages.filter((p) => p.role !== "intro" && p.pageKey !== "closing").length;
    expect(pack.drawings[0].pageCount).toBe(1 + 2 * keep + 1);
  });

  it("hashes apart from a case's own export, and anew after an approved revision, the order or the client changed", async () => {
    const d = deps();
    const base = (await packNow(d)).drawings[0].contentHash;
    const single = await readExportSource(d, PACK_CASES.A, "presentazione_16_9");
    expect(single.ok && single.value.contentHash).not.toBe(base);
    expect((await packNow(deps())).drawings[0].contentHash).toBe(base);
    expect((await packNow(deps({ order: ["A", "C", "B"] }))).drawings[0].contentHash).not.toBe(base);
    const updated = deps();
    const live = vi.mocked(updated.getLiveRevision).getMockImplementation()!;
    vi.mocked(updated.getLiveRevision).mockImplementation(async (subject) =>
      subject.kind === "case" && subject.id === PACK_CASES.B ? ok<CaseStudyRevision | null>(revision({ id: INTRO_ID, caseId: PACK_CASES.B })) : live(subject),
    );
    expect((await packNow(updated)).drawings[0].contentHash).not.toBe(base);
    const renamed = deps({}, { getClient: vi.fn(async () => ok({ id: CLIENT_ID, code: "LUM", name: "Lumen SpA" })) });
    expect((await packNow(renamed)).drawings[0].contentHash).not.toBe(base);
  });

  it("refuses a client with no approved case (NOT_APPROVED), enqueueing nothing", async () => {
    const d = deps({ order: [] });
    expect(await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] })).toMatchObject({
      ok: false,
      error: { code: "NOT_APPROVED" },
    });
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("refuses a format a part lacks (FORMAT_NOT_IN_REVISION), enqueueing nothing", async () => {
    const d = deps();
    const live = vi.mocked(d.getLiveRevision).getMockImplementation()!;
    vi.mocked(d.getLiveRevision).mockImplementation(async (subject) => {
      const found = await live(subject);
      if (subject.kind !== "case" || subject.id !== PACK_CASES.B || !found.ok || found.value === null) return found;
      const doc = { ...found.value.doc, formats: { ...found.value.doc.formats, carosello_1_1: { pages: [] } } };
      return ok<CaseStudyRevision | null>({ ...found.value, doc });
    });
    expect(await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9", "carosello_1_1"] })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_IN_REVISION" },
    });
    expect(d.enqueue).not.toHaveBeenCalled();
  });
});

describe("requestPack (Story 5.9a)", () => {
  it("enqueues one export job for the client with all the pack's parts in order", async () => {
    const d = deps();
    expect(await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] })).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    const pack = await packNow(d);
    expect(d.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: "export",
      subjectId: CLIENT_ID,
      inputHash: pack.drawings[0].contentHash,
      payload: {
        subject: { kind: "client", id: CLIENT_ID },
        parts: [introPart, casePart("C"), casePart("A"), casePart("B")],
        format: "presentazione_16_9",
        requestedBy: ACTOR.id,
      },
    });
  });

  it("asks for two formats as one bundle job", async () => {
    const d = deps();
    await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9", "carosello_1_1"] });
    expect(d.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payload: expect.objectContaining({ format: "bundle", formats: ["carosello_1_1", "presentazione_16_9"] }) }),
    );
  });

  it("reuses a stored pack: no job, a file named after the client, an export event on each case", async () => {
    const d = deps();
    const pack = await packNow(d);
    const parts = [...pack.parts];
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(pack.drawings[0].contentHash, parts)));
    const result = await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["presentazione_16_9"] });
    expect(result).toEqual(ok({ status: "ready", exportId: EXPORT_ID, url: "https://storage.test/signed", fileName: "LUM Lumen Srl – Presentazione.pdf" }));
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.recordEvent).toHaveBeenCalledTimes(3);
    expect(d.recordEvent).toHaveBeenCalledWith(ACTOR, {
      caseId: PACK_CASES.C,
      type: "export",
      revisionId: PACK_REVISIONS.C,
      data: { exportId: EXPORT_ID, format: "presentazione_16_9", clientId: CLIENT_ID },
    });
  });

  it("refuses bad input and Video before reading anything", async () => {
    const d = deps();
    expect(await makeRequestPack(d)(ACTOR, { clientId: "x", formats: ["presentazione_16_9"] })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await makeRequestPack(d)(ACTOR, { clientId: CLIENT_ID, formats: ["video_9_16"] })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_EXPORTABLE" },
    });
    expect(d.getClient).not.toHaveBeenCalled();
  });
});

describe("packStatus (Story 5.9a)", () => {
  it("is pending while the client's job runs, and ready with the stored pack once it succeeded", async () => {
    const d = deps();
    const pack = await packNow(d);
    const hash = pack.drawings[0].contentHash;
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "running", inputHash: hash }]));
    expect(await makePackStatus(d)(ACTOR, { clientId: CLIENT_ID, jobId: JOB_ID })).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    expect(d.getJobsFor).toHaveBeenCalledWith(CLIENT_ID);
    vi.mocked(d.getJobsFor).mockResolvedValue(ok([{ id: JOB_ID, kind: "export", status: "succeeded", inputHash: hash }]));
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(hash, [...pack.parts])));
    expect(await makePackStatus(d)(ACTOR, { clientId: CLIENT_ID, jobId: JOB_ID })).toMatchObject({ ok: true, value: { status: "ready" } });
  });

  it("refuses a file of the pack as it was (EXPORT_STALE), and another client's (NOT_FOUND)", async () => {
    const d = deps();
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64), [introPart, casePart("A"), casePart("B"), casePart("C")])));
    expect(await makePackStatus(d)(ACTOR, { clientId: CLIENT_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "EXPORT_STALE" } });
    vi.mocked(d.exports.findById).mockResolvedValue(
      ok(record("a".repeat(64), [{ subject: { kind: "case", id: "cccccccc-0000-4000-8000-0000000000ff" }, revisionId: INTRO_ID }])),
    );
    expect(await makePackStatus(d)(ACTOR, { clientId: CLIENT_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("refuses a client with no approved case before looking anything up (NOT_APPROVED)", async () => {
    const d = deps({ order: [] });
    expect(await makePackStatus(d)(ACTOR, { clientId: CLIENT_ID, jobId: JOB_ID })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    expect(d.getJobsFor).not.toHaveBeenCalled();
  });

  it("names the wrong fields", async () => {
    expect(await makePackStatus(deps())(ACTOR, { clientId: "x" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", details: { fields: ["clientId", "jobId"] } } });
  });
});
