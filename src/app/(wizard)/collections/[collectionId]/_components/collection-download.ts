import type { DownloadButtonProps, DownloadPoll, DownloadStart } from "@/app/_components/download-button";
import { getCollectionExportStatus, requestCollectionExport } from "@/app/(wizard)/collections/[collectionId]/actions";
import { fill, it } from "@/shared/i18n/it";

/** The dialog's line for a refused export of collection `name`: no available case, a format a part lacks, too many parts, a change since, or anything else. */
export function collectionRefusalFor(code: string, name: string): string {
  if (code === "NOT_APPROVED") return it.download.collectionNotApproved;
  if (code === "FORMAT_NOT_IN_REVISION") return it.download.collectionFormatMissing;
  if (code === "EXPORT_TOO_LARGE") return it.download.collectionTooLarge;
  if (code === "EXPORT_STALE") return it.download.collectionStale;
  return fill(it.download.failedCollection, { name });
}

/**
 * **Esporta** on a collection (Story 5.10b): the picker's handlers, through the collection's
 * export server actions, as `clientDownload` for a client's pack. The ticked formats go as
 * `formats`: one asks for that format's file, two or more for one ZIP of them. A ready file
 * comes with its signed link and name; a pending one is polled by its job; a poll that fails or
 * answers an error is `failed` (the toast with **Riprova**, which asks again for the collection
 * as it is now), with its own line when the collection changed since (`EXPORT_STALE`). `name` is the collection's, for the lines.
 */
export function collectionDownload(collectionId: string, name: string): Required<Pick<DownloadButtonProps, "onDownload" | "onPoll">> {
  return {
    async onDownload(formats): Promise<DownloadStart> {
      const result = await requestCollectionExport({ collectionId, formats });
      if (!result.ok) return { kind: "refused", message: collectionRefusalFor(result.error.code, name) };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      if (ticket.status === "pending") return { kind: "pending", ticket: ticket.jobId };
      return { kind: "refused", message: fill(it.download.failedCollection, { name }) };
    },
    async onPoll(jobId): Promise<DownloadPoll> {
      const result = await getCollectionExportStatus({ collectionId, jobId });
      // Changed since the request: the toast says so, and **Riprova** asks for it as it is now.
      if (!result.ok) return result.error.code === "EXPORT_STALE" ? { kind: "failed", message: it.download.collectionStale } : { kind: "failed" };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      return ticket.status === "pending" ? { kind: "pending" } : { kind: "failed" };
    },
  };
}
