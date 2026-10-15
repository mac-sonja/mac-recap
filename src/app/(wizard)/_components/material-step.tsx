"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  confirmAssetUpload,
  listAssets,
  presignAssetUpload,
  removeAsset,
  setAssetFavourite,
} from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { Asset, ListedAsset } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { acceptFor, normalizeContentType, uploadFile, UploadError } from "../_lib/upload";
import { AssetRow, type ListedRow, type MaterialRow, type PendingRow, type RowKind } from "./asset-row";
import { DropZone } from "./drop-zone";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.material;

export interface MaterialStepProps {
  caseId: string;
  /** The case's live files from `listAssets`, oldest first. */
  initialAssets: ListedAsset[];
  /** `MAX_ASSETS_PER_CASE`. */
  maxAssets: number;
  /** `MAX_FILE_BYTES`. */
  maxFileBytes: number;
  /** `ALLOWED_CONTENT_TYPES`. */
  allowedContentTypes: readonly string[];
}

interface UploadJob {
  key: string;
  file: File;
  contentType: string;
}

/** How one presign → POST → confirm attempt ended. */
type Attempt =
  | { kind: "done"; asset: ListedAsset }
  | { kind: "storage" }
  | { kind: "rejected"; message: string }
  /** `unconfirmed`: confirm threw or answered 5xx, so this asset may have been stored anyway. */
  | { kind: "retry"; unconfirmed?: string }
  | { kind: "cancelled" };

/** Server codes that name what is wrong with the file: shown on the row, never retried. */
const REJECTION_CODES = ["FILE_LIMIT_REACHED", "FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED", "UPLOAD_REJECTED"] as const;

const toListed = ({ id, kind, originalFileName, contentType, sizeBytes, createdAt, isFavourite }: Asset): ListedAsset => ({
  id,
  kind,
  originalFileName,
  contentType,
  sizeBytes,
  createdAt,
  isFavourite,
  thumbnailUrl: null,
});

function kindOf(contentType: string | null): RowKind {
  if (contentType === null) return "other";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("text/")) return "text";
  return "document";
}

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;

const listedRow = (asset: ListedAsset): ListedRow => ({ key: asset.id, state: "listed", asset });

/**
 * Step 1, Material (EXPERIENCE.md step 1, Story 2.7). Files go straight from the
 * browser to storage, in parallel: presign, a PUT with progress, then confirm. Each
 * file is checked first (type from the allowlist, ≤ `maxFileBytes`, a free slot of 20
 * counting in-flight uploads); only that file is rejected, on its row. An upload or
 * confirm that fails for any other reason presigns again and retries once (a
 * confirmed `assetId` can't be reused). `STORAGE_NOT_CONFIGURED` shows one message
 * and turns the drop zone off. Favourite and remove apply at once and roll back on
 * failure; remove has no undo. **Avanti** opens step 2 once one file is stored.
 * Progress and rejections are announced in a polite live region. Case status never changes.
 */
export function MaterialStep({ caseId, initialAssets, maxAssets, maxFileBytes, allowedContentTypes }: MaterialStepProps) {
  const reasonId = useId();
  const [rows, setRows] = useState<MaterialRow[]>(() => initialAssets.map(listedRow));
  const [storageOff, setStorageOff] = useState(false);
  const [announcements, setAnnouncements] = useState<ReadonlyArray<{ id: number; text: string }>>([]);

  // The current rows, read synchronously so parallel uploads and quick drops count slots right.
  const rowsRef = useRef(rows);
  const nextKey = useRef(0);
  const nextAnnouncement = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  // Separate, so a favourite save in flight never blocks remove (and the reverse).
  const favouriteBusy = useRef(new Set<string>());
  const removeBusy = useRef(new Set<string>());
  const unmounted = useRef(false);

  // Leaving the step aborts every upload still running; confirmed files stay.
  useEffect(() => {
    unmounted.current = false;
    const running = controllers.current;
    return () => {
      unmounted.current = true;
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  const tooLarge = fill(copy.errors.tooLarge, { size: Math.round(maxFileBytes / (1024 * 1024)) });
  const limit = fill(copy.errors.limit, { max: maxAssets });
  const rejections: Readonly<Record<(typeof REJECTION_CODES)[number], string>> = {
    FILE_LIMIT_REACHED: limit,
    FILE_TOO_LARGE: tooLarge,
    FILE_TYPE_NOT_ALLOWED: copy.errors.type,
    UPLOAD_REJECTED: copy.errors.rejected,
  };

  function classify(code: string): Attempt {
    if (code === "STORAGE_NOT_CONFIGURED") return { kind: "storage" };
    return (REJECTION_CODES as readonly string[]).includes(code)
      ? { kind: "rejected", message: rejections[code as (typeof REJECTION_CODES)[number]] }
      : { kind: "retry" };
  }

  function update(change: (current: MaterialRow[]) => MaterialRow[]) {
    rowsRef.current = change(rowsRef.current);
    setRows(rowsRef.current);
  }

  const patchPending = (key: string, patch: Partial<PendingRow>) =>
    update((current) => current.map((row) => (row.key === key && row.state === "pending" ? { ...row, ...patch } : row)));

  const patchListed = (id: string, patch: (row: ListedRow) => ListedRow) =>
    update((current) => current.map((row) => (row.state === "listed" && row.asset.id === id ? patch(row) : row)));

  const dropRow = (key: string) => update((current) => current.filter((row) => row.key !== key));

  // Lines are appended (the last few kept), so a quick "caricato" never replaces a rejection before it is read.
  const announce = (lines: string[]) => {
    if (lines.length === 0) return;
    const line = { id: nextAnnouncement.current++, text: lines.join(" ") };
    setAnnouncements((current) => [...current, line].slice(-ANNOUNCEMENTS_KEPT));
  };

  const listed = rows.filter((row): row is ListedRow => row.state === "listed");

  async function attempt({ key, file, contentType }: UploadJob, signal: AbortSignal): Promise<Attempt> {
    let confirming: string | undefined;
    try {
      const presigned = await presignAssetUpload({ caseId, contentType, sizeBytes: file.size });
      if (!presigned.ok) return classify(presigned.error.code);
      if (cancelled.current.has(key)) return { kind: "cancelled" };
      const { assetId, url, method, headers } = presigned.value;
      await uploadFile({ url, method, headers }, file, (progress) => patchPending(key, { progress }), { signal });
      if (cancelled.current.has(key) || unmounted.current) return { kind: "cancelled" };
      confirming = assetId;
      const confirmed = await confirmAssetUpload({ caseId, assetId, contentType, fileName: file.name });
      if (!confirmed.ok) {
        const outcome = classify(confirmed.error.code);
        return outcome.kind === "retry" && confirmed.status >= 500 ? { kind: "retry", unconfirmed: assetId } : outcome;
      }
      return { kind: "done", asset: toListed(confirmed.value) };
    } catch (error) {
      if (error instanceof UploadError && error.aborted) return { kind: "cancelled" };
      return { kind: "retry", unconfirmed: confirming };
    }
  }

  /** After a confirm that threw or answered 5xx: the asset if it was stored after all, so it isn't uploaded twice. */
  async function storedAfterAll(assetId: string): Promise<ListedAsset | null> {
    try {
      const fresh = await listAssets({ caseId });
      return fresh.ok ? (fresh.value.find((asset) => asset.id === assetId) ?? null) : null;
    } catch {
      return null;
    }
  }

  async function refreshThumbnails() {
    try {
      const fresh = await listAssets({ caseId });
      if (!fresh.ok) return;
      const urls = new Map(fresh.value.map((asset) => [asset.id, asset.thumbnailUrl]));
      update((current) =>
        current.map((row) =>
          row.state === "listed" && row.asset.thumbnailUrl === null && urls.get(row.asset.id)
            ? { ...row, asset: { ...row.asset, thumbnailUrl: urls.get(row.asset.id) ?? null } }
            : row,
        ),
      );
    } catch {
      // The row keeps its type icon.
    }
  }

  async function upload(job: UploadJob) {
    const controller = new AbortController();
    controllers.current.set(job.key, controller);
    try {
      for (let tries = 0; tries < 2; tries++) {
        if (tries > 0) patchPending(job.key, { progress: 0 });
        let outcome = await attempt(job, controller.signal);
        if (outcome.kind === "retry" && outcome.unconfirmed !== undefined) {
          const stored = await storedAfterAll(outcome.unconfirmed);
          if (stored !== null) outcome = { kind: "done", asset: stored };
        }

        if (unmounted.current) return;
        if (cancelled.current.has(job.key) || outcome.kind === "cancelled") {
          // Removed while uploading: a file that still got stored is removed again.
          if (outcome.kind === "done") void removeAfterCancel(outcome.asset);
          return;
        }
        if (outcome.kind === "done") {
          const row = listedRow(outcome.asset);
          update((current) => current.map((r) => (r.key === job.key ? row : r)));
          announce([fill(copy.announce.done, { name: outcome.asset.originalFileName })]);
          if (outcome.asset.kind === "image" && outcome.asset.thumbnailUrl === null) void refreshThumbnails();
          return;
        }
        if (outcome.kind === "storage") {
          setStorageOff(true);
          dropRow(job.key);
          return;
        }
        if (outcome.kind === "rejected") {
          patchPending(job.key, { error: outcome.message });
          announce([fill(copy.announce.error, { name: job.file.name, message: outcome.message })]);
          return;
        }
      }
      patchPending(job.key, { error: copy.errors.failed });
      announce([fill(copy.announce.error, { name: job.file.name, message: copy.errors.failed })]);
    } finally {
      controllers.current.delete(job.key);
      cancelled.current.delete(job.key);
    }
  }

  /** A file stored although its row was removed: remove it again; if that fails, show it with the remove error. */
  async function removeAfterCancel(asset: ListedAsset) {
    let removed: boolean;
    try {
      const result = await removeAsset({ caseId, assetId: asset.id });
      removed = result.ok || result.error.code === "NOT_FOUND";
    } catch {
      removed = false;
    }
    if (removed || unmounted.current) return;
    update((current) => [...current, { ...listedRow(asset), message: copy.errors.remove }]);
    announce([fill(copy.announce.error, { name: asset.originalFileName, message: copy.errors.remove })]);
  }

  function addFiles(files: File[]) {
    if (storageOff) return;
    const current = rowsRef.current;
    const live = current.filter((row) => row.state === "listed").length;
    const inFlight = current.filter((row) => row.state === "pending" && row.error === undefined).length;
    let slots = maxAssets - live - inFlight;

    const jobs: UploadJob[] = [];
    const lines: string[] = [];
    const added = files.map((file): PendingRow => {
      const contentType = normalizeContentType(file, allowedContentTypes);
      const row: PendingRow = { key: `pending-${nextKey.current++}`, state: "pending", name: file.name, kind: kindOf(contentType), progress: 0 };
      let error: string | undefined;
      if (contentType === null) error = copy.errors.type;
      else if (file.size > maxFileBytes) error = tooLarge;
      else if (file.size === 0) error = copy.errors.failed;
      else if (slots <= 0) error = limit;

      if (error !== undefined) {
        lines.push(fill(copy.announce.error, { name: file.name, message: error }));
        return { ...row, error };
      }
      slots -= 1;
      jobs.push({ key: row.key, file, contentType: contentType as string });
      lines.push(fill(copy.announce.started, { name: file.name }));
      return row;
    });

    update((rows) => [...rows, ...added]);
    announce(lines);
    for (const job of jobs) void upload(job);
  }

  async function toggleFavourite(row: ListedRow) {
    const { id, isFavourite } = row.asset;
    if (favouriteBusy.current.has(id)) return;
    favouriteBusy.current.add(id);
    const next = !isFavourite;
    patchListed(id, (r) => ({ ...r, asset: { ...r.asset, isFavourite: next }, message: undefined }));
    try {
      const saved = await setAssetFavourite({ caseId, assetId: id, isFavourite: next });
      if (!saved.ok) throw new Error(saved.error.code);
    } catch {
      patchListed(id, (r) => ({ ...r, asset: { ...r.asset, isFavourite }, message: copy.errors.favourite }));
      announce([fill(copy.announce.error, { name: row.asset.originalFileName, message: copy.errors.favourite })]);
    } finally {
      favouriteBusy.current.delete(id);
    }
  }

  async function remove(row: MaterialRow) {
    if (row.state === "pending") {
      // An upload in flight is cancelled; a rejected row is just dismissed.
      if (row.error === undefined) {
        cancelled.current.add(row.key);
        controllers.current.get(row.key)?.abort();
      }
      dropRow(row.key);
      return;
    }

    const { id, originalFileName } = row.asset;
    if (removeBusy.current.has(id)) return;
    removeBusy.current.add(id);
    const index = rowsRef.current.findIndex((r) => r.key === row.key);
    dropRow(row.key);
    announce([fill(copy.announce.removed, { name: originalFileName })]);
    try {
      const removed = await removeAsset({ caseId, assetId: id });
      // NOT_FOUND: it is already gone, which is what was asked.
      if (!removed.ok && removed.error.code !== "NOT_FOUND") throw new Error(removed.error.code);
    } catch {
      update((current) => {
        const next = [...current];
        next.splice(Math.min(Math.max(index, 0), next.length), 0, { ...row, message: copy.errors.remove });
        return next;
      });
      announce([fill(copy.announce.error, { name: originalFileName, message: copy.errors.remove })]);
    } finally {
      removeBusy.current.delete(id);
    }
  }

  const ready = listed.length > 0;

  return (
    <div>
      <h2 className="font-heading text-xl font-medium text-foreground-strong mb-6">{copy.heading}</h2>

      {/* Always mounted, so screen readers announce the message when it appears. */}
      <div role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 font-body text-sm text-foreground empty:hidden">
        {storageOff ? copy.errors.storage : null}
      </div>

      <DropZone
        accept={acceptFor(allowedContentTypes)}
        maxFiles={maxAssets}
        maxFileMegabytes={Math.round(maxFileBytes / (1024 * 1024))}
        compact={rows.length > 0}
        disabled={storageOff}
        onFiles={addFiles}
      />

      <div role="status" aria-live="polite" aria-relevant="additions" className="sr-only">
        {announcements.map((line) => (
          <p key={line.id}>{line.text}</p>
        ))}
      </div>

      {rows.length > 0 && (
        <section>
          <div className="mt-6 mb-2 flex items-baseline justify-between">
            <h3 id={`${reasonId}-list`} className="font-label text-xs font-normal text-foreground-muted">
              {copy.list.label}
            </h3>
            <span className="font-mono text-xs text-foreground-muted">
              {fill(copy.list.count, { n: listed.length, max: maxAssets })}
            </span>
          </div>
          <ul aria-labelledby={`${reasonId}-list`} className="overflow-hidden rounded-lg border">
            {rows.map((row) => (
              <AssetRow key={row.key} row={row} onToggleFavourite={toggleFavourite} onRemove={remove} />
            ))}
          </ul>
        </section>
      )}

      <WizardFooter
        current={1}
        start={ready ? undefined : <span id={reasonId}>{copy.nextReason}</span>}
        action={
          ready ? (
            <Link href={wizardHref(caseId, 2)} className={cn(PRIMARY_ACTION, "px-[18px] py-2.5")}>
              {it.wizard.next}
            </Link>
          ) : (
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={reasonId}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, "cursor-not-allowed px-[18px] py-2.5")}
            >
              {it.wizard.next}
            </button>
          )
        }
      />
    </div>
  );
}
