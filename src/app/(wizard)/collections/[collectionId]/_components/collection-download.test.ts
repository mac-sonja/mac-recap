import { beforeEach, describe, expect, it, vi } from "vitest";
import { fill, it as dict } from "@/shared/i18n/it";

const { requestCollectionExport, getCollectionExportStatus } = vi.hoisted(() => ({ requestCollectionExport: vi.fn(), getCollectionExportStatus: vi.fn() }));
vi.mock("@/app/(wizard)/collections/[collectionId]/actions", () => ({ requestCollectionExport, getCollectionExportStatus }));

const { collectionDownload } = await import("./collection-download");

const COLLECTION_ID = "c0c0c0c0-0000-4000-8000-000000000001";
const refused = (code: string) => ({ ok: false, status: 409, error: { code, message: "x" } });

beforeEach(() => {
  requestCollectionExport.mockReset();
  getCollectionExportStatus.mockReset();
});

describe("collectionDownload (Story 5.10b)", () => {
  it("asks the server for the collection in the ticked formats; a pending job is polled by its id", async () => {
    requestCollectionExport.mockResolvedValue({ ok: true, value: { status: "pending", jobId: "job-1" } });
    const { onDownload, onPoll } = collectionDownload(COLLECTION_ID, "Pitch moda");
    expect(await onDownload(["presentazione_16_9", "carosello_1_1"])).toEqual({ kind: "pending", ticket: "job-1" });
    expect(requestCollectionExport).toHaveBeenCalledExactlyOnceWith({ collectionId: COLLECTION_ID, formats: ["presentazione_16_9", "carosello_1_1"] });

    getCollectionExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "pending", jobId: "job-1" } });
    expect(await onPoll("job-1")).toEqual({ kind: "pending" });
    expect(getCollectionExportStatus).toHaveBeenCalledWith({ collectionId: COLLECTION_ID, jobId: "job-1" });
    getCollectionExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "Pitch moda.zip" } });
    expect(await onPoll("job-1")).toEqual({ kind: "ready", url: "u", fileName: "Pitch moda.zip" });
    getCollectionExportStatus.mockResolvedValueOnce({ ok: true, value: { status: "failed" } });
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
    getCollectionExportStatus.mockResolvedValueOnce(refused("EXPORT_STALE"));
    expect(await onPoll("job-1")).toEqual({ kind: "failed" });
  });

  it("hands a stored file over at once", async () => {
    requestCollectionExport.mockResolvedValue({ ok: true, value: { status: "ready", exportId: "e", url: "u", fileName: "f.pdf" } });
    expect(await collectionDownload(COLLECTION_ID, "Pitch moda").onDownload(["presentazione_16_9"])).toEqual({ kind: "ready", url: "u", fileName: "f.pdf" });
  });

  it.each([
    ["NOT_APPROVED", dict.download.collectionNotApproved],
    ["FORMAT_NOT_IN_REVISION", dict.download.collectionFormatMissing],
    ["FORBIDDEN", fill(dict.download.failedCollection, { name: "Pitch moda" })],
    ["COLLECTION_NOT_FOUND", fill(dict.download.failedCollection, { name: "Pitch moda" })],
  ])("turns %s into the dialog's line", async (code, message) => {
    requestCollectionExport.mockResolvedValue(refused(code));
    expect(await collectionDownload(COLLECTION_ID, "Pitch moda").onDownload(["presentazione_16_9"])).toEqual({ kind: "refused", message });
  });
});
