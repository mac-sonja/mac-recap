"use client";

import { File, FileText, Film, Star, X } from "lucide-react";
import { useId, useState } from "react";
import type { AssetKind, ListedAsset } from "@/modules/material";
import { formatBytes } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

const copy = it.wizard.material;

/** What a row's icon is drawn from; `other` is a file whose type isn't allowed. */
export type RowKind = AssetKind | "other";

/** A file the server has stored, as listed (or just confirmed). */
export interface ListedRow {
  key: string;
  state: "listed";
  asset: ListedAsset;
  /** A failed favourite or remove, shown on the row. */
  message?: string;
}

/** A file being uploaded, or one that was rejected and never stored. */
export interface PendingRow {
  key: string;
  state: "pending";
  name: string;
  kind: RowKind;
  /** 0–100. */
  progress: number;
  /** Set when the file was rejected or the upload failed; the row then stays until dismissed. */
  error?: string;
}

export type MaterialRow = ListedRow | PendingRow;

const FAVOURITABLE: readonly RowKind[] = ["image", "video"];

function TypeIcon({ kind }: { kind: RowKind }) {
  const Icon = kind === "video" ? Film : kind === "document" || kind === "text" ? FileText : File;
  return <Icon aria-hidden="true" className="size-[18px]" />;
}

/**
 * One row of the Material list (EXPERIENCE.md step 1, DESIGN.md favourite toggle):
 * thumbnail or type icon, the file name, then the size in mono, the upload
 * progress bar, or the row's error line. Images and videos that are stored carry
 * the **Preferito** toggle (`aria-pressed`). Every row has a named ✕.
 */
export function AssetRow({
  row,
  onToggleFavourite,
  onRemove,
}: {
  row: MaterialRow;
  onToggleFavourite: (row: ListedRow) => void;
  onRemove: (row: MaterialRow) => void;
}) {
  const name = row.state === "listed" ? row.asset.originalFileName : row.name;
  const kind = row.state === "listed" ? row.asset.kind : row.kind;
  const nameId = useId();
  // An expired or broken thumbnail URL falls back to the type icon.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const url = row.state === "listed" && row.asset.kind === "image" ? row.asset.thumbnailUrl : null;
  const thumbnail = url !== null && url !== brokenUrl ? url : null;
  const uploading = row.state === "pending" && row.error === undefined;
  const error = row.state === "pending" ? row.error : row.message;

  return (
    <li
      data-row-state={row.state === "listed" ? "listed" : uploading ? "uploading" : "rejected"}
      className="flex items-center gap-3.5 border-b bg-surface-raised px-4 py-3 last:border-b-0"
    >
      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-control text-foreground-muted">
        {thumbnail !== null ? (
          // A presigned GET of the original, scaled by the browser (IR-OP12); no next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" onError={() => setBrokenUrl(thumbnail)} className="size-full object-cover" />
        ) : (
          <TypeIcon kind={kind} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div id={nameId} className="truncate font-body text-sm text-foreground">
          {name}
        </div>
        {row.state === "listed" && <div className="font-mono text-xs text-foreground-muted">{formatBytes(row.asset.sizeBytes)}</div>}
        {uploading && (
          <div
            role="progressbar"
            aria-label={fill(copy.list.progress, { name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={row.progress}
            className="mt-1.5 h-1 w-[200px] overflow-hidden rounded-full bg-surface-selected"
          >
            <span className="block h-full bg-accent" style={{ width: `${row.progress}%` }} />
          </div>
        )}
        {error !== undefined && <div className="font-label text-xs text-danger">{error}</div>}
      </div>
      {uploading && <span className="font-mono text-xs text-foreground-muted">{`${row.progress}%`}</span>}
      {row.state === "listed" && FAVOURITABLE.includes(kind) && (
        <button
          type="button"
          aria-pressed={row.asset.isFavourite}
          aria-describedby={nameId}
          onClick={() => onToggleFavourite(row)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border-strong px-2.5 py-1 font-label text-xs text-foreground-muted",
            "aria-pressed:border-accent/40 aria-pressed:bg-accent/10 aria-pressed:text-info",
          )}
        >
          <Star
            aria-hidden="true"
            className={cn("size-3.5", row.asset.isFavourite && "fill-accent text-accent")}
          />
          {copy.list.favourite}
        </button>
      )}
      <button
        type="button"
        aria-label={fill(copy.list.remove, { name })}
        onClick={() => onRemove(row)}
        className="grid size-7 shrink-0 place-items-center rounded-sm text-foreground-muted hover:text-foreground"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}
