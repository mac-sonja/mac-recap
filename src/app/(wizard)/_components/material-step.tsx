"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  confirmAssetUpload,
  listAssets,
  presignAssetUpload,
  removeAsset,
  setAssetFavourite,
} from "@/app/(tool)/case-studies/actions";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { STEP_HEADING } from "@/app/_components/field-styles";
import type { ActionResult } from "@/app/_lib/action-result";
import { wizardHref } from "@/app/_lib/routes";
import type { Asset, ListedAsset } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { acceptFor, normalizeContentType, uploadFile, UploadError } from "../_lib/upload";
import { AssetRow, type ListedRow, type MaterialRow, type PendingRow, type RowKind, type StepAsset } from "./asset-row";
import { DropZone } from "./drop-zone";
import { WizardFooter } from "./wizard-frame";

const copy = it.wizard.material;

/** A signed upload, as the presign action returns it. */
export interface PresignedMaterialUpload {
  assetId: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

/**
 * The server calls the step makes, bound to whatever owns the files (a case by
 * default, or a client). Error codes are the case material ones
 * (`FILE_LIMIT_REACHED`, `FILE_TOO_LARGE`, `FILE_TYPE_NOT_ALLOWED`,
 * `UPLOAD_REJECTED`, `STORAGE_NOT_CONFIGURED`, `NOT_FOUND` on remove).
 */
export interface MaterialActions {
  presign(input: { contentType: string; sizeBytes: number }): Promise<ActionResult<PresignedMaterialUpload>>;
  confirm(input: { assetId: string; contentType: string; fileName: string }): Promise<ActionResult<StepAsset>>;
  list(): Promise<ActionResult<StepAsset[]>>;
  remove(assetId: string): Promise<ActionResult<void>>;
  /** Absent: the rows have no **Preferito** toggle. */
  setFavourite?(assetId: string, isFavourite: boolean): Promise<ActionResult<void>>;
}

/** The step's footer action, active once `ready`. */
export interface MaterialFooterAction {
  label: string;
  href: string;
  /** Why it is inactive, linked through `aria-describedby`. */
  reason: string;
}

export interface MaterialStepProps {
  /** The case the files belong to; with no `actions` the case actions are used (default). */
  caseId?: string;
  /** The live files, oldest first (or in position order). */
  initialAssets: StepAsset[];
  /** `MAX_ASSETS_PER_CASE`, or the client cap. */
  maxAssets: number;
  /** `MAX_FILE_BYTES`. */
  maxFileBytes: number;
  /** `ALLOWED_CONTENT_TYPES`. */
  allowedContentTypes: readonly string[];
  /** The server calls (default: the case material actions for `caseId`). */
  actions?: MaterialActions;
  /** Copy overrides: the heading, a line above the drop zone, and the cap error (default: the case step's). */
  copy?: { heading?: string; intro?: string; limit?: string };
  /** More server codes that name what is wrong with a file, with the row message for each (shown, never retried). */
  rejections?: Readonly<Record<string, string>>;
  /** Whether the footer action is active (default: one stored file). */
  ready?: (listed: readonly StepAsset[]) => boolean;
  /** The footer action (default: **Avanti** to the case's step 2 Dettagli). */
  footerAction?: MaterialFooterAction;
  /**
   * An extra browser check before a file is uploaded (e.g. image pixels); a message
   * refuses that file on its row, null lets it upload.
   */
  checkFile?: (file: File, contentType: string) => Promise<string | null>;
}

interface UploadJob {
  key: string;
  file: File;
  contentType: string;
}

/** How one presign → POST → confirm attempt ended. */
type Attempt =
  | { kind: "done"; asset: StepAsset }
  | { kind: "storage" }
  | { kind: "rejected"; message: string }
  /** `unconfirmed`: confirm threw or answered 5xx, so this asset may have been stored anyway. */
  | { kind: "retry"; unconfirmed?: string }
  | { kind: "cancelled" };

/** Server codes that name what is wrong with the file: shown on the row, never retried. */
const REJECTION_CODES = ["FILE_LIMIT_REACHED", "FILE_TOO_LARGE", "FILE_TYPE_NOT_ALLOWED", "UPLOAD_REJECTED"] as const;

/** A just-confirmed case file: no thumbnail yet; an image or video waits for its thumbnail rendition. */
const toListed = ({ id, kind, originalFileName, contentType, sizeBytes, createdAt, isFavourite }: Asset): ListedAsset => ({
  id,
  kind,
  originalFileName,
  contentType,
  sizeBytes,
  createdAt,
  isFavourite,
  thumbnailUrl: null,
  thumbnailPending: kind === "image" || kind === "video",
});

/** The step re-lists this often while a listed image or video still waits for its thumbnail rendition (Story 3.2). */
export const THUMBNAIL_POLL_MS = 5_000;
/** It stops re-listing this long after the step opened or the last such file was added. */
export const THUMBNAIL_POLL_MAX_MS = 2 * 60_000;

const waitsForThumbnail = (row: MaterialRow) => row.state === "listed" && row.asset.thumbnailPending === true;

function kindOf(contentType: string | null): RowKind {
  if (contentType === null) return "other";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("text/")) return "text";
  return "document";
}

/** How many live-region lines stay mounted. */
const ANNOUNCEMENTS_KEPT = 5;

const listedRow = (asset: StepAsset): ListedRow => ({ key: asset.id, state: "listed", asset });

/**
 * Puts the listed rows that carry a `position` back in position order, in the slots
 * listed rows already hold, so pending rows stay where they are. Rows without a
 * position (case files) keep their order.
 */
function sortByPosition(rows: MaterialRow[]): MaterialRow[] {
  const positionOf = (row: MaterialRow) => (row.state === "listed" ? row.asset.position : undefined);
  const slots = rows.flatMap((row, i) => (positionOf(row) === undefined ? [] : [i]));
  const sorted = slots.map((i) => rows[i]).sort((a, b) => (positionOf(a) as number) - (positionOf(b) as number));
  const next = [...rows];
  slots.forEach((slot, k) => {
    next[slot] = sorted[k];
  });
  return next;
}

/** The case material actions for one case (the default). */
function caseActions(caseId: string): MaterialActions {
  return {
    presign: ({ contentType, sizeBytes }) => presignAssetUpload({ caseId, contentType, sizeBytes }),
    async confirm({ assetId, contentType, fileName }) {
      const confirmed = await confirmAssetUpload({ caseId, assetId, contentType, fileName });
      return confirmed.ok ? { ok: true, value: toListed(confirmed.value) } : confirmed;
    },
    list: () => listAssets({ caseId }),
    remove: (assetId) => removeAsset({ caseId, assetId }),
    setFavourite: (assetId, isFavourite) => setAssetFavourite({ caseId, assetId, isFavourite }),
  };
}

/**
 * Step 1, Material (EXPERIENCE.md, Story 2.7; step 1 since material first, owner 2026-10-21). Files go straight from the
 * browser to storage, in parallel: presign, a PUT with progress, then confirm. Each
 * file is checked first (type from the allowlist, ≤ `maxFileBytes`, a free slot of 20
 * counting in-flight uploads); only that file is rejected, on its row. An upload or
 * confirm that fails for any other reason presigns again and retries once (a
 * confirmed `assetId` can't be reused). `STORAGE_NOT_CONFIGURED` shows one message
 * and turns the drop zone off. Favourite and remove apply at once and roll back on
 * failure; remove has no undo. **Avanti** opens step 3 Genera once one file is stored.
 * Progress and rejections are announced in a polite live region. Case status never changes.
 * The client wizard reuses it (Story 2.16) with its own `actions`, copy, footer action,
 * readiness rule and an image pixel check; the defaults keep the case step as it was.
 * Case images and videos show their thumbnail rendition once the worker has made it
 * (Story 3.2): while a listed one still waits for it, the step re-lists every 5 s for
 * up to 2 minutes (an image shows its original meanwhile, a video its type icon).
 * Client files never wait, so the client step only re-lists once after an image upload, as before.
 */
export function MaterialStep({
  caseId,
  initialAssets,
  maxAssets,
  maxFileBytes,
  allowedContentTypes,
  actions: givenActions,
  copy: copyOverrides,
  rejections: extraRejections = {},
  ready: isReady = (listed) => listed.length > 0,
  footerAction,
  checkFile,
}: MaterialStepProps) {
  if (givenActions === undefined && caseId === undefined) throw new Error("MaterialStep needs a caseId or actions");
  const actions = givenActions ?? caseActions(caseId as string);
  const footer: MaterialFooterAction = footerAction ?? {
    label: it.wizard.next,
    href: wizardHref(caseId as string, 2),
    reason: copy.nextReason,
  };
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
  // The latest server calls, for the thumbnail polling effect.
  const actionsRef = useRef(actions);
  // Bumped when a file that waits for its thumbnail is added: the polling window starts again.
  const [pollWindow, setPollWindow] = useState(0);

  useEffect(() => {
    actionsRef.current = actions;
  });

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
  const limit = copyOverrides?.limit ?? fill(copy.errors.limit, { max: maxAssets });
  const rejections: Readonly<Record<(typeof REJECTION_CODES)[number], string>> = {
    FILE_LIMIT_REACHED: limit,
    FILE_TOO_LARGE: tooLarge,
    FILE_TYPE_NOT_ALLOWED: copy.errors.type,
    UPLOAD_REJECTED: copy.errors.rejected,
  };

  function classify(code: string): Attempt {
    if (code === "STORAGE_NOT_CONFIGURED") return { kind: "storage" };
    if (Object.hasOwn(extraRejections, code)) return { kind: "rejected", message: extraRejections[code] };
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
      const presigned = await actions.presign({ contentType, sizeBytes: file.size });
      if (!presigned.ok) return classify(presigned.error.code);
      if (cancelled.current.has(key)) return { kind: "cancelled" };
      const { assetId, url, method, headers } = presigned.value;
      await uploadFile({ url, method, headers }, file, (progress) => patchPending(key, { progress }), { signal });
      if (cancelled.current.has(key) || unmounted.current) return { kind: "cancelled" };
      confirming = assetId;
      const confirmed = await actions.confirm({ assetId, contentType, fileName: file.name });
      if (!confirmed.ok) {
        const outcome = classify(confirmed.error.code);
        return outcome.kind === "retry" && confirmed.status >= 500 ? { kind: "retry", unconfirmed: assetId } : outcome;
      }
      return { kind: "done", asset: confirmed.value };
    } catch (error) {
      if (error instanceof UploadError && error.aborted) return { kind: "cancelled" };
      return { kind: "retry", unconfirmed: confirming };
    }
  }

  /** After a confirm that threw or answered 5xx: the asset if it was stored after all, so it isn't uploaded twice. */
  async function storedAfterAll(assetId: string): Promise<StepAsset | null> {
    try {
      const fresh = await actions.list();
      return fresh.ok ? (fresh.value.find((asset) => asset.id === assetId) ?? null) : null;
    } catch {
      return null;
    }
  }

  async function refreshThumbnails() {
    await refreshThumbnailsWith(actions);
  }

  /**
   * Re-lists and takes each listed row's new thumbnail: a row without a URL takes
   * the listed one, and a row waiting for its rendition takes the rendition once
   * it is ready. Nothing else on the row changes.
   */
  async function refreshThumbnailsWith(calls: MaterialActions) {
    try {
      const fresh = await calls.list();
      if (!fresh.ok || unmounted.current) return;
      const byId = new Map(fresh.value.map((asset) => [asset.id, asset]));
      update((current) =>
        current.map((row) => {
          if (row.state !== "listed") return row;
          const next = byId.get(row.asset.id);
          if (next === undefined) return row;
          const waiting = row.asset.thumbnailPending === true;
          if (waiting && next.thumbnailPending !== true) {
            return { ...row, asset: { ...row.asset, thumbnailUrl: next.thumbnailUrl ?? row.asset.thumbnailUrl, thumbnailPending: false } };
          }
          if (row.asset.thumbnailUrl === null && next.thumbnailUrl) {
            return { ...row, asset: { ...row.asset, thumbnailUrl: next.thumbnailUrl } };
          }
          return row;
        }),
      );
    } catch {
      // The row keeps its type icon.
    }
  }

  // While a listed image or video waits for its thumbnail rendition, re-list every
  // THUMBNAIL_POLL_MS, for at most THUMBNAIL_POLL_MAX_MS (client files never wait).
  const waiting = rows.some(waitsForThumbnail);
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + THUMBNAIL_POLL_MAX_MS;
    const tick = async () => {
      await refreshThumbnailsWith(actionsRef.current);
      if (stopped || Date.now() + THUMBNAIL_POLL_MS > deadline) return;
      handle = setTimeout(() => void tick(), THUMBNAIL_POLL_MS);
    };
    handle = setTimeout(() => void tick(), THUMBNAIL_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(handle);
    };
    // refreshThumbnailsWith only reads refs and the state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, pollWindow]);

  async function upload(job: UploadJob) {
    const controller = new AbortController();
    controllers.current.set(job.key, controller);
    try {
      if (checkFile !== undefined) {
        const problem = await checkFile(job.file, job.contentType);
        if (unmounted.current || cancelled.current.has(job.key)) return;
        if (problem !== null) {
          patchPending(job.key, { error: problem });
          announce([fill(copy.announce.error, { name: job.file.name, message: problem })]);
          return;
        }
      }
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
          update((current) => sortByPosition(current.map((r) => (r.key === job.key ? row : r))));
          announce([fill(copy.announce.done, { name: outcome.asset.originalFileName })]);
          if (outcome.asset.kind === "image" && outcome.asset.thumbnailUrl === null) void refreshThumbnails();
          if (outcome.asset.thumbnailPending === true) setPollWindow((n) => n + 1);
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
  async function removeAfterCancel(asset: StepAsset) {
    let removed: boolean;
    try {
      const result = await actions.remove(asset.id);
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

  const saveFavourite = actions.setFavourite;

  async function toggleFavourite(row: ListedRow) {
    if (saveFavourite === undefined) return;
    const { id, isFavourite } = row.asset;
    if (favouriteBusy.current.has(id)) return;
    favouriteBusy.current.add(id);
    const next = !isFavourite;
    patchListed(id, (r) => ({ ...r, asset: { ...r.asset, isFavourite: next }, message: undefined }));
    try {
      const saved = await saveFavourite(id, next);
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
      const removed = await actions.remove(id);
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

  const ready = isReady(listed.map((row) => row.asset));
  const intro: ReactNode = copyOverrides?.intro;

  return (
    <div>
      <h2 className={cn(STEP_HEADING, intro === undefined ? "mb-6" : "mb-1.5")}>
        {copyOverrides?.heading ?? copy.heading}
      </h2>
      {intro !== undefined && <p className="mb-6 font-body text-sm text-foreground-muted">{intro}</p>}

      {/* Always mounted, so screen readers announce the message when it appears. */}
      <div role="alert" className="mb-4 rounded-md bg-danger/10 px-4 py-3 font-body text-sm text-foreground shadow-[inset_0_0_0_1px] shadow-danger/30 empty:hidden">
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
          <ul aria-labelledby={`${reasonId}-list`} className="overflow-hidden rounded-lg shadow-card">
            {rows.map((row) => (
              <AssetRow
                key={row.key}
                row={row}
                onToggleFavourite={saveFavourite === undefined ? undefined : toggleFavourite}
                onRemove={remove}
              />
            ))}
          </ul>
        </section>
      )}

      <WizardFooter
        start={ready ? undefined : <span id={reasonId}>{footer.reason}</span>}
        action={
          ready ? (
            <Link href={footer.href} className={cn(PRIMARY_ACTION, "h-10 px-5")}>
              {footer.label}
            </Link>
          ) : (
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={reasonId}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, "cursor-not-allowed h-10 px-5")}
            >
              {footer.label}
            </button>
          )
        }
      />
    </div>
  );
}
