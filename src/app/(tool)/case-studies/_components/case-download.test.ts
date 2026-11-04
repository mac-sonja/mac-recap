import { beforeEach, describe, expect, it, vi } from "vitest";
import { it as dict } from "@/shared/i18n/it";

const { requestCaseExport, getCaseExportStatus } = vi.hoisted(() => ({ requestCaseExport: vi.fn(), getCaseExportStatus: vi.fn() }));
vi.mock("@/app/(tool)/case-studies/export-actions", () => ({ requestCaseExport, getCaseExportStatus }));

const { caseDownload } = await import("./case-download");

const CASE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const refused = (code: string) => ({ ok: false, status: 409, error: { code, message: "x" } });

beforeEach(() => {
  requestCaseExport.mockReset();
  getCaseExportStatus.mockReset();
});

describe("caseDownload (Story 5.3)", () => {
  it("asks the server for the case and format; a pending job is polled by its id", async () => {
    requestCaseExport.mockResolvedValue({ ok: true, value: { status: "pending", jobId: "job-1" } });
    const { onDownload, onPoll } = caseDownload(CASE_ID);
    expect(await onDownload("carosello_1_1")).toEqual({ kind: "pending", ticket: "job-1" });
    expect(requestCaseExport).toHaveBeenCalledExactlyOnceWith({ caseId: CASE_ID, format: "carosello_1_1" });

    getCaseExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "pending", jobId: "job-1" } });
    expect(await onPoll("job-1")).toEqual({ kind: "pending" });
    expect(getCaseExportStatus).toHaveBeenCalledWith({ caseId: CASE_ID, jobId: "job-1" });
    getCaseExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "f.pdf" } });
    expect(await onPoll("job-1")).toEqual({ kind: "ready", url: "u", fileName: "f.pdf" });
    getCaseExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "failed" } });
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
    getCaseExportStatus.mockResolvedValueOnce(refused("EXPORT_STALE"));
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
  });

  it("hands a reused file over at once", async () => {
    requestCaseExport.mockResolvedValue({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "f.pdf" } });
    expect(await caseDownload(CASE_ID).onDownload("presentazione_16_9")).toEqual({ kind: "ready", url: "u", fileName: "f.pdf" });
  });

  it.each([
    ["NOT_APPROVED", dict.download.notApproved],
    ["FORMAT_NOT_IN_REVISION", dict.download.formatMissing],
    ["FORBIDDEN", dict.download.failed],
  ])("turns %s into the dialog's line", async (code, message) => {
    requestCaseExport.mockResolvedValue(refused(code));
    expect(await caseDownload(CASE_ID).onDownload("presentazione_16_9")).toEqual({ kind: "refused", message });
  });
});
