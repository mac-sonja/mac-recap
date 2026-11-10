import { beforeEach, describe, expect, it, vi } from "vitest";
import { it as dict } from "@/shared/i18n/it";

const { requestClientExport, getClientExportStatus } = vi.hoisted(() => ({ requestClientExport: vi.fn(), getClientExportStatus: vi.fn() }));
vi.mock("@/app/(tool)/clients/export-actions", () => ({ requestClientExport, getClientExportStatus }));

const { clientDownload } = await import("./client-download");

const CLIENT_ID = "cccccccc-0000-4000-8000-000000000001";
const refused = (code: string) => ({ ok: false, status: 409, error: { code, message: "x" } });

beforeEach(() => {
  requestClientExport.mockReset();
  getClientExportStatus.mockReset();
});

describe("clientDownload (Story 5.9a)", () => {
  it("asks the server for the client's pack in the ticked formats; a pending job is polled by its id", async () => {
    requestClientExport.mockResolvedValue({ ok: true, value: { status: "pending", jobId: "job-1" } });
    const { onDownload, onPoll } = clientDownload(CLIENT_ID);
    expect(await onDownload(["presentazione_16_9", "carosello_1_1"])).toEqual({ kind: "pending", ticket: "job-1" });
    expect(requestClientExport).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID, formats: ["presentazione_16_9", "carosello_1_1"] });

    getClientExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "pending", jobId: "job-1" } });
    expect(await onPoll("job-1")).toEqual({ kind: "pending" });
    expect(getClientExportStatus).toHaveBeenCalledWith({ clientId: CLIENT_ID, jobId: "job-1" });
    getClientExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "LUM Lumen.zip" } });
    expect(await onPoll("job-1")).toEqual({ kind: "ready", url: "u", fileName: "LUM Lumen.zip" });
    getClientExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "failed" } });
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
    getClientExportStatus.mockResolvedValueOnce(refused("EXPORT_STALE"));
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
  });

  it("hands a stored pack over at once", async () => {
    requestClientExport.mockResolvedValue({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "f.pdf" } });
    expect(await clientDownload(CLIENT_ID).onDownload(["presentazione_16_9"])).toEqual({ kind: "ready", url: "u", fileName: "f.pdf" });
  });

  it.each([
    ["NOT_APPROVED", dict.download.packNotApproved],
    ["FORMAT_NOT_IN_REVISION", dict.download.packFormatMissing],
    ["FORBIDDEN", dict.download.failed],
  ])("turns %s into the dialog's line", async (code, message) => {
    requestClientExport.mockResolvedValue(refused(code));
    expect(await clientDownload(CLIENT_ID).onDownload(["presentazione_16_9"])).toEqual({ kind: "refused", message });
  });
});
