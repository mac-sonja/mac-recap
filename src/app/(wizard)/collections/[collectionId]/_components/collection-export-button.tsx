"use client";

import { useMemo } from "react";
import { DownloadButton } from "@/app/_components/download-button";
import type { FormatId } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { collectionDownload } from "./collection-download";

export interface CollectionExportButtonProps {
  collectionId: string;
  name: string;
  /** The collection's cases with an approved revision: shown only with one or more. */
  availableCount: number;
  /** Its "Non disponibile" cases, left out of the file: the dialog says so. */
  unavailableCount: number;
  /** The format in view, ticked when the dialog opens. */
  currentFormat?: FormatId;
}

/**
 * **Esporta** on a collection (Story 5.10b), in its top bar: the export dialog of a case and a
 * client pack, wired to the collection. Nothing without an available case. When cases are left
 * out because they are "Non disponibile", the dialog says how many.
 */
export function CollectionExportButton({ collectionId, name, availableCount, unavailableCount, currentFormat }: CollectionExportButtonProps) {
  const handlers = useMemo(() => collectionDownload(collectionId, name), [collectionId, name]);
  if (availableCount < 1) return null;
  return (
    <DownloadButton
      actionLabel={it.download.collectionAction}
      label={fill(it.download.collectionLabel, { name })}
      title={fill(it.download.collectionTitle, { name })}
      description={availableCount === 1 ? it.download.collectionDescriptionOne : fill(it.download.collectionDescription, { n: availableCount })}
      onDownload={handlers.onDownload}
      onPoll={handlers.onPoll}
      failedMessage={fill(it.download.failedCollection, { name })}
      {...(currentFormat === undefined ? {} : { currentFormat })}
      {...(unavailableCount > 0 ? { note: fill(it.download.collectionUnavailable, { n: unavailableCount }) } : {})}
    />
  );
}
