"use client";

import { useMemo } from "react";
import { DownloadButton } from "@/app/_components/download-button";
import { fill, it } from "@/shared/i18n/it";
import { clientDownload } from "./client-download";

export interface ClientPackButtonProps {
  clientId: string;
  name: string;
  /** The client's approved cases: shown only with one or more. */
  approvedCount: number;
  /**
   * Whether the client's intro is approved: without it, each case keeps its own intro and
   * closing, and the dialog says so. Null when unknown (the read failed): no note, no claim.
   */
  introApproved: boolean | null;
}

/**
 * **Scarica** for a client's pack (Story 5.9a), on a Clienti card and the client's page:
 * the export dialog of a case, wired to the client's pack. Nothing without an approved case.
 */
export function ClientPackButton({ clientId, name, approvedCount, introApproved }: ClientPackButtonProps) {
  const handlers = useMemo(() => clientDownload(clientId, name), [clientId, name]);
  if (approvedCount < 1) return null;
  // An intro that couldn't be read (null) is claimed neither way: no "Intro e…", no note.
  const description =
    introApproved === true
      ? approvedCount === 1
        ? it.download.packDescriptionOne
        : fill(it.download.packDescription, { n: approvedCount })
      : approvedCount === 1
        ? it.download.packDescriptionNoIntroOne
        : fill(it.download.packDescriptionNoIntro, { n: approvedCount });
  return (
    <DownloadButton
      label={fill(it.download.packLabel, { name })}
      title={fill(it.download.packTitle, { name })}
      description={description}
      onDownload={handlers.onDownload}
      onPoll={handlers.onPoll}
      failedMessage={fill(it.download.failedPack, { name })}
      {...(introApproved === false ? { note: it.download.packIntroNote } : {})}
    />
  );
}
