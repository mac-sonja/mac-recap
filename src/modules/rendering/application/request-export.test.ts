import { describe, expect, it, vi } from "vitest";
import type { CaseStudyRevision } from "@/modules/case-study";
import { caseHistoryV2 } from "@/modules/generation";
import {
  ACTOR,
  CASE_ID,
  caseStudy,
  clientInfo,
  REVISION_ID,
  revision,
  sourceDeps,
} from "@/modules/rendering/application/export.fixtures";
import { contentHash } from "@/modules/rendering/application/content-hash";
import { readExportSource } from "@/modules/rendering/application/export-source";
import { EXPORT_URL_TTL_SECONDS, makeExportStatus, makeRequestExport, type RequestExportDeps } from "@/modules/rendering/application/request-export";
import type { ExportRecord } from "@/modules/rendering/domain/export";
import { err, ok } from "@/shared/result";

const JOB_ID = "99999999-0000-4000-8000-000000000001";
const EXPORT_ID = "88888888-0000-4000-8000-000000000001";

const record = (hash: string, over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: EXPORT_ID,
  contentHash: hash,
  format: "presentazione_16_9",
  parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }],
  path: `exports/${hash}/presentazione_16_9.pdf`,
  contentType: "application/pdf",
  sizeBytes: 1234,
  createdBy: ACTOR.id,
  createdAt: "2026-11-04T10:00:00Z",
  ...over,
});

function deps(over: Partial<RequestExportDeps> = {}) {
  const all = {
    ...sourceDeps(),
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
  return all;
}

async function hashNow(d: ReturnType<typeof deps>, format: "presentazione_16_9" | "carosello_1_1" = "presentazione_16_9") {
  const source = await readExportSource(d, CASE_ID, format);
  if (!source.ok) throw new Error(source.error.code);
  return source.value.contentHash;
}

describe("requestExport (Story 5.3)", () => {
  it("enqueues one export job for the live approved revision, with the content hash, and returns it pending", async () => {
    const d = deps();
    const result = await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "presentazione_16_9" });
    expect(result).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    const hash = await hashNow(d);
    expect(d.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: "export",
      subjectId: CASE_ID,
      inputHash: hash,
      payload: { parts: [{ subject: { kind: "case", id: CASE_ID }, revisionId: REVISION_ID }], format: "presentazione_16_9", requestedBy: ACTOR.id },
    });
    expect(d.getLiveRevision).toHaveBeenCalledWith({ kind: "case", id: CASE_ID });
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("reuses a stored export with the same hash: no job, a signed link named after the case, and an export event with the actor", async () => {
    const d = deps();
    const hash = await hashNow(d);
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(hash)));
    const result = await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "presentazione_16_9" });
    expect(result).toEqual(
      ok({ status: "ready", exportId: EXPORT_ID, url: "https://storage.test/signed", fileName: "LUM-2026-01 Rebrand Lumen – Presentazione.pdf" }),
    );
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.exports.findByHash).toHaveBeenCalledWith(hash);
    expect(d.storage.presignDownload).toHaveBeenCalledWith(`exports/${hash}/presentazione_16_9.pdf`, EXPORT_URL_TTL_SECONDS, "LUM-2026-01 Rebrand Lumen – Presentazione.pdf");
    expect(EXPORT_URL_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
    expect(d.recordEvent).toHaveBeenCalledExactlyOnceWith(ACTOR, {
      caseId: CASE_ID,
      type: "export",
      revisionId: REVISION_ID,
      data: { exportId: EXPORT_ID, format: "presentazione_16_9" },
    });
  });

  it("asks again after the client's name changed: a new hash, so a new job", async () => {
    const d = deps();
    const before = await hashNow(d);
    vi.mocked(d.exports.findByHash).mockImplementation(async (hash: string) => ok(hash === before ? record(before) : null));
    vi.mocked(d.getClientInfoForCase).mockResolvedValue(ok(clientInfo({ name: "Lumen Spa" })));
    const result = await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "presentazione_16_9" });
    expect(result).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    const [[job]] = vi.mocked(d.enqueue).mock.calls as unknown as [[{ inputHash: string }]];
    expect(job.inputHash).not.toBe(before);
  });

  it("refuses NOT_APPROVED and enqueues nothing when the case has no approved revision", async () => {
    const d = deps({ getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(null)) });
    const result = await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "presentazione_16_9" });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    expect(d.enqueue).not.toHaveBeenCalled();
    expect(d.exports.findByHash).not.toHaveBeenCalled();
  });

  it("refuses FORMAT_NOT_IN_REVISION and enqueues nothing when the revision has no Carosello pages", async () => {
    const doc = caseHistoryV2(["presentazione_16_9", "carosello_1_1", "video_9_16"]);
    const empty = { ...doc, formats: { ...doc.formats, carosello_1_1: { pages: [] } } };
    const d = deps({ getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(revision({ doc: empty }))) });
    const result = await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "carosello_1_1" });
    expect(result).toMatchObject({ ok: false, error: { code: "FORMAT_NOT_IN_REVISION" } });
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("refuses FORMAT_NOT_IN_REVISION when the revision lacks the format altogether", async () => {
    const doc = caseHistoryV2(["presentazione_16_9", "video_9_16"]);
    const d = deps({ getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(revision({ doc }))) });
    expect(await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "carosello_1_1" })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_IN_REVISION" },
    });
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("refuses Video (still In arrivo) and unknown formats without reading anything", async () => {
    const d = deps();
    expect(await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "video_9_16" })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_EXPORTABLE" },
    });
    expect(await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "deck_16_9" })).toMatchObject({
      ok: false,
      error: { code: "FORMAT_NOT_IN_REVISION" },
    });
    expect(d.getCase).not.toHaveBeenCalled();
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it.each([{}, { caseId: "nope", format: "presentazione_16_9" }, { caseId: CASE_ID }, null])("refuses %j as INVALID_INPUT", async (input) => {
    const d = deps();
    expect(await makeRequestExport(d)(ACTOR, input)).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(d.enqueue).not.toHaveBeenCalled();
  });

  it("passes on a deleted or unknown case as NOT_FOUND", async () => {
    const d = deps({ getCase: vi.fn(async () => err({ code: "NOT_FOUND", message: "No." })) });
    expect(await makeRequestExport(d)(ACTOR, { caseId: CASE_ID, format: "presentazione_16_9" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(d.enqueue).not.toHaveBeenCalled();
  });
});

describe("exportStatus (Story 5.3)", () => {
  const job = (status: "queued" | "running" | "succeeded" | "failed", inputHash = "h") => ({ id: JOB_ID, kind: "export", status, inputHash });

  it.each(["queued", "running"] as const)("is pending while the job is %s", async (status) => {
    const d = deps({ getJobsFor: vi.fn(async () => ok([job(status)])) });
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, jobId: JOB_ID })).toEqual(ok({ status: "pending", jobId: JOB_ID }));
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("is failed once the job failed for good, and changes nothing", async () => {
    const d = deps({ getJobsFor: vi.fn(async () => ok([job("failed")])) });
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, jobId: JOB_ID })).toEqual(ok({ status: "failed" }));
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("is ready with a signed link and records the export event once the job succeeded", async () => {
    const hash = contentHash([], "presentazione_16_9");
    const d = deps({ getJobsFor: vi.fn(async () => ok([job("succeeded", hash)])) });
    vi.mocked(d.exports.findByHash).mockResolvedValue(ok(record(hash)));
    const result = await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, jobId: JOB_ID.toUpperCase() });
    expect(result).toMatchObject({ ok: true, value: { status: "ready", exportId: EXPORT_ID, url: "https://storage.test/signed" } });
    expect(d.exports.findByHash).toHaveBeenCalledWith(hash);
    expect(d.recordEvent).toHaveBeenCalledOnce();
  });

  it("reads a stored export by id", async () => {
    const d = deps();
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64))));
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, exportId: EXPORT_ID })).toMatchObject({ ok: true, value: { status: "ready" } });
  });

  it("hands out nothing once the case has no approved revision any more", async () => {
    const d = deps({ getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(null)) });
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64))));
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "NOT_APPROVED" } });
    expect(d.storage.presignDownload).not.toHaveBeenCalled();
    expect(d.recordEvent).not.toHaveBeenCalled();
  });

  it("is EXPORT_STALE when a newer version was approved since the file was drawn", async () => {
    const d = deps({ getLiveRevision: vi.fn(async () => ok<CaseStudyRevision | null>(revision({ id: "eeeeeeee-0000-4000-8000-000000000009" }))) });
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64))));
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "EXPORT_STALE" } });
    expect(d.storage.presignDownload).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND for an unknown job, another kind's job, or another case's export", async () => {
    const d = deps({ getJobsFor: vi.fn(async () => ok([{ ...job("succeeded"), kind: "generate" }])) });
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, jobId: JOB_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, jobId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    vi.mocked(d.exports.findById).mockResolvedValue(
      ok(record("a".repeat(64), { parts: [{ subject: { kind: "case", id: "cccccccc-0000-4000-8000-000000000002" }, revisionId: REVISION_ID }] })),
    );
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, exportId: EXPORT_ID })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(d.storage.presignDownload).not.toHaveBeenCalled();
  });

  it("refuses a malformed input", async () => {
    expect(await makeExportStatus(deps())(ACTOR, { caseId: CASE_ID })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  });

  it("names the file after the case", async () => {
    const d = deps({ getCase: vi.fn(async () => ok(caseStudy({ name: "Nuovo nome" }))) });
    vi.mocked(d.exports.findById).mockResolvedValue(ok(record("a".repeat(64), { format: "carosello_1_1", path: `exports/${"a".repeat(64)}/carosello_1_1.zip`, contentType: "application/zip" })));
    expect(await makeExportStatus(d)(ACTOR, { caseId: CASE_ID, exportId: EXPORT_ID })).toMatchObject({
      ok: true,
      value: { fileName: "LUM-2026-01 Nuovo nome – Carosello.zip" },
    });
  });
});
