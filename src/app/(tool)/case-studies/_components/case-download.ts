import type { DownloadButtonProps, DownloadPoll, DownloadStart } from "@/app/_components/download-button";
import { getCaseExportStatus, requestCaseExport } from "@/app/(tool)/case-studies/export-actions";
import { it } from "@/shared/i18n/it";

/** The dialog's line for a refused request: no approved version, a format it lacks, or anything else. */
function refusalFor(code: string): string {
  if (code === "NOT_APPROVED") return it.download.notApproved;
  if (code === "FORMAT_NOT_IN_REVISION") return it.download.formatMissing;
  return it.download.failed;
}

/**
 * **Scarica** for one approved case (Story 5.3): the picker's handlers, through the
 * export server actions. The ticked formats go as `formats` (Story 5.4): one asks for
 * that format's file, two or more for one ZIP of them. A ready file comes with its
 * signed link and name; a pending one
 * is polled by its job; a poll that fails or answers an error counts as not finished.
 */
export function caseDownload(caseId: string): Required<Pick<DownloadButtonProps, "onDownload" | "onPoll">> {
  return {
    async onDownload(formats): Promise<DownloadStart> {
      const result = await requestCaseExport({ caseId, formats });
      if (!result.ok) return { kind: "refused", message: refusalFor(result.error.code) };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      if (ticket.status === "pending") return { kind: "pending", ticket: ticket.jobId };
      return { kind: "refused", message: it.download.failed };
    },
    async onPoll(jobId): Promise<DownloadPoll> {
      const result = await getCaseExportStatus({ caseId, jobId });
      if (!result.ok) return { kind: "failed" };
      const ticket = result.value;
      if (ticket.status === "ready") return { kind: "ready", url: ticket.url, fileName: ticket.fileName };
      return ticket.status === "pending" ? { kind: "pending" } : { kind: "failed" };
    },
  };
}
