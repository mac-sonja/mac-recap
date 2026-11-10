import type { DownloadButtonProps, DownloadPoll, DownloadStart } from "@/app/_components/download-button";
import { getClientExportStatus, requestClientExport } from "@/app/(tool)/clients/export-actions";
import { fill, it } from "@/shared/i18n/it";

/** The dialog's line for a refused pack of client `name`: no approved case, a format a part lacks, or anything else. */
export function packRefusalFor(code: string, name: string): string {
  if (code === "NOT_APPROVED") return it.download.packNotApproved;
  if (code === "FORMAT_NOT_IN_REVISION") return it.download.packFormatMissing;
  return fill(it.download.failedPack, { name });
}

/**
 * **Scarica** for a client's pack (Story 5.9a): the picker's handlers, through the client
 * export server actions, as `caseDownload` for a case. The ticked formats go as `formats`:
 * one asks for that format's file, two or more for one ZIP of them. A ready file comes with
 * its signed link and name; a pending one is polled by its job; a poll that fails or answers
 * an error is `failed` (the toast with **Riprova**). `name` is the client's, for the lines.
 */
export function clientDownload(clientId: string, name: string): Required<Pick<DownloadButtonProps, "onDownload" | "onPoll">> {
  return {
    async onDownload(formats): Promise<DownloadStart> {
      const result = await requestClientExport({ clientId, formats });
      if (!result.ok) return { kind: "refused", message: packRefusalFor(result.error.code, name) };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      if (ticket.status === "pending") return { kind: "pending", ticket: ticket.jobId };
      return { kind: "refused", message: fill(it.download.failedPack, { name }) };
    },
    async onPoll(jobId): Promise<DownloadPoll> {
      const result = await getClientExportStatus({ clientId, jobId });
      if (!result.ok) return { kind: "failed" };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      return ticket.status === "pending" ? { kind: "pending" } : { kind: "failed" };
    },
  };
}
