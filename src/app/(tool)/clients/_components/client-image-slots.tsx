"use client";

import { FileText, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { FIELD_HINT } from "@/app/_components/field-styles";
import type { ActionResult } from "@/app/_lib/action-result";
import {
  confirmClientMaterialUpload,
  listClientMaterial,
  removeClientMaterial,
  requestClientMaterialUpload,
} from "@/app/(tool)/clients/actions";
import { acceptFor, normalizeContentType, uploadFile, UploadError } from "@/app/(wizard)/_lib/upload";
import { RequiredMark } from "@/app/(wizard)/_components/required-label";
import type { ListedClientAsset } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import type { ClientMaterialLimits } from "../_lib/client-limits";
import { imageSize } from "./use-client-logo";

const copy = it.clientPanel.images;

/**
 * One image slot: a file the client already has (`stored`), or a picked file that
 * waits in the browser (`local`: a new client has no id yet, or its upload failed
 * and **Salva** retries it).
 */
export type ImageSlot =
  | { key: string; state: "stored"; asset: ListedClientAsset; error: string | null; removing: boolean }
  | { key: string; state: "local"; file: File; contentType: string; previewUrl: string; uploading: boolean; error: string | null };

export interface ClientImages {
  slots: readonly ImageSlot[];
  /** Images held or waiting: what counts toward `minImages`. */
  imageCount: number;
  /** Picked files not stored yet. */
  hasLocal: boolean;
  /** A rejection at pick time or a refused upload; the counter does not change. */
  error: string | null;
  /** An upload or a removal is running. */
  busy: boolean;
  /** Checks a picked file and adds it to the first free slot; uploads it at once when the client exists. */
  pick: (file: File) => Promise<void>;
  remove: (key: string) => Promise<void>;
  /** Uploads every waiting file, in slot order; true when all are stored. */
  uploadAll: (clientId: string) => Promise<boolean>;
}

/** How one upload ended: stored, refused for good (the slot goes), or worth a retry (the slot stays). */
type Outcome = { kind: "done"; asset: ListedClientAsset } | { kind: "rejected"; message: string } | { kind: "retry"; message: string };

/** The formats as people know them, for `{types}`. */
const TYPE_NAMES: Readonly<Record<string, string>> = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP" };

/** "PNG, JPEG o WebP" from the allowed image types. */
export function imageTypeNames(types: readonly string[]): string {
  const known = Object.keys(TYPE_NAMES).filter((type) => types.includes(type));
  const names = [...known, ...types.filter((type) => !known.includes(type))].map(
    (type) => TYPE_NAMES[type] ?? type.replace("image/", "").toUpperCase(),
  );
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")}${copy.lastSeparator}${names[names.length - 1]}`;
}

let nextKey = 0;
const newKey = () => `slot-${nextKey++}`;

/**
 * The client's images (Story 2.16's client material, images only in the panel):
 * up to `maxFiles` slots. A pick is checked first (an image type, 1 B–50 MB, and the
 * pixels when the browser can measure them, as `checkFile` did); a refused one shows
 * its reason and takes no slot. With a client id (`clientId()`), a pick uploads at
 * once (presign → PUT → confirm) and a removal is immediate, row and object, as
 * today; without one the file waits for `uploadAll`, which **Aggiungi** calls after
 * the client is created. A confirm that threw or answered 5xx is checked against the
 * list, so a stored file isn't uploaded twice. A file the client has that is not an
 * image (an older upload) keeps its slot with an icon and can be removed. Each
 * upload and removal is told to `announce` (a polite live region).
 */
export function useClientImages(
  limits: ClientMaterialLimits,
  initialAssets: readonly ListedClientAsset[],
  clientId: () => string | null,
  announce: (text: string) => void = () => undefined,
): ClientImages {
  const [slots, setSlots] = useState<readonly ImageSlot[]>(() =>
    initialAssets.map((asset) => ({ key: newKey(), state: "stored", asset, error: null, removing: false })),
  );
  const slotsRef = useRef(slots);
  const [error, setError] = useState<string | null>(null);
  const unmounted = useRef(false);
  const imageTypes = limits.contentTypes.filter((type) => type.startsWith("image/"));
  const pixels = fill(copy.errors.pixels, { min: limits.minShortSide, max: limits.maxSide });
  const typeError = fill(copy.errors.type, { types: imageTypeNames(imageTypes) });

  useEffect(() => {
    unmounted.current = false;
    const current = slotsRef;
    return () => {
      unmounted.current = true;
      for (const slot of current.current) if (slot.state === "local") URL.revokeObjectURL(slot.previewUrl);
    };
  }, []);

  function update(change: (current: readonly ImageSlot[]) => readonly ImageSlot[]) {
    slotsRef.current = change(slotsRef.current);
    if (!unmounted.current) setSlots(slotsRef.current);
  }
  const patch = (key: string, next: (slot: ImageSlot) => ImageSlot) =>
    update((current) => current.map((slot) => (slot.key === key ? next(slot) : slot)));
  const drop = (key: string) => update((current) => current.filter((slot) => slot.key !== key));

  function messageFor(code: string, status: number): { final: boolean; message: string } {
    switch (code) {
      case "CLIENT_MATERIAL_LIMIT":
        return { final: true, message: fill(copy.errors.limit, { max: limits.maxFiles }) };
      case "CLIENT_IMAGE_SIZE_INVALID":
        return { final: true, message: pixels };
      case "FILE_TOO_LARGE":
        return { final: true, message: fill(copy.errors.tooLarge, { size: Math.round(limits.maxFileBytes / (1024 * 1024)) }) };
      case "FILE_TYPE_NOT_ALLOWED":
        return { final: true, message: typeError };
      case "UPLOAD_REJECTED":
        return { final: true, message: copy.errors.rejected };
      case "STORAGE_NOT_CONFIGURED":
        return { final: false, message: copy.errors.storage };
      default:
        // Any other refusal under 500 is final: a retry would be refused again.
        return status < 500 ? { final: true, message: copy.errors.refused } : { final: false, message: copy.errors.failed };
    }
  }

  function refused(result: Extract<ActionResult<unknown>, { ok: false }>): Outcome {
    const { final, message } = messageFor(result.error.code, result.status);
    return final ? { kind: "rejected", message } : { kind: "retry", message };
  }

  /** After a confirm that threw or answered 5xx: the file, if it was stored after all. */
  async function storedAfterAll(id: string, assetId: string): Promise<ListedClientAsset | null> {
    try {
      const fresh = await listClientMaterial({ clientId: id });
      return fresh.ok ? (fresh.value.find((asset) => asset.id === assetId) ?? null) : null;
    } catch {
      return null;
    }
  }

  async function attempt(id: string, file: File, contentType: string): Promise<Outcome> {
    let confirming: string | null = null;
    try {
      const presigned = await requestClientMaterialUpload({ clientId: id, contentType, sizeBytes: file.size });
      if (!presigned.ok) return refused(presigned);
      const { assetId, url, method, headers } = presigned.value;
      await uploadFile({ url, method, headers }, file, () => undefined);
      confirming = assetId;
      const confirmed = await confirmClientMaterialUpload({ clientId: id, assetId, contentType, fileName: file.name });
      if (confirmed.ok) return { kind: "done", asset: confirmed.value };
      if (confirmed.status < 500) return refused(confirmed);
    } catch (error) {
      // Storage refusing the file (4xx) is final; a dropped connection is retried on Salva,
      // unless the file was stored after all (below).
      if (error instanceof UploadError && error.status >= 400 && error.status < 500) return { kind: "rejected", message: copy.errors.refused };
    }
    const stored = confirming === null ? null : await storedAfterAll(id, confirming);
    return stored === null ? { kind: "retry", message: copy.errors.failed } : { kind: "done", asset: stored };
  }

  async function upload(id: string, key: string): Promise<boolean> {
    const slot = slotsRef.current.find((candidate) => candidate.key === key);
    if (slot?.state !== "local" || slot.uploading) return slot?.state === "stored";
    patch(key, (current) => (current.state === "local" ? { ...current, uploading: true, error: null } : current));
    const outcome = await attempt(id, slot.file, slot.contentType);
    if (outcome.kind === "done") {
      URL.revokeObjectURL(slot.previewUrl);
      patch(key, () => ({ key, state: "stored", asset: outcome.asset, error: null, removing: false }));
      announce(fill(copy.announce.done, { name: slot.file.name }));
      return true;
    }
    if (outcome.kind === "rejected") {
      URL.revokeObjectURL(slot.previewUrl);
      drop(key);
      if (!unmounted.current) setError(outcome.message);
      announce(fill(copy.announce.error, { name: slot.file.name, message: outcome.message }));
      return false;
    }
    announce(fill(copy.announce.error, { name: slot.file.name, message: outcome.message }));
    patch(key, (current) => (current.state === "local" ? { ...current, uploading: false, error: outcome.message } : current));
    return false;
  }

  async function pick(file: File) {
    if (slotsRef.current.length >= limits.maxFiles) return;
    setError(null);
    const contentType = normalizeContentType(file, imageTypes);
    if (contentType === null) return setError(typeError);
    if (file.size < 1) return setError(copy.errors.empty);
    if (file.size > limits.maxFileBytes) {
      return setError(fill(copy.errors.tooLarge, { size: Math.round(limits.maxFileBytes / (1024 * 1024)) }));
    }
    const size = await imageSize(file);
    if (size !== null) {
      const short = Math.min(size.width, size.height);
      const long = Math.max(size.width, size.height);
      if (short < limits.minShortSide || long > limits.maxSide) return setError(pixels);
    }
    // Another pick filled the last slot while this one was measured.
    if (unmounted.current || slotsRef.current.length >= limits.maxFiles) return;
    const key = newKey();
    update((current) => [...current, { key, state: "local", file, contentType, previewUrl: URL.createObjectURL(file), uploading: false, error: null }]);
    const id = clientId();
    if (id !== null) await upload(id, key);
  }

  async function remove(key: string) {
    const slot = slotsRef.current.find((candidate) => candidate.key === key);
    if (slot === undefined) return;
    setError(null);
    if (slot.state === "local") {
      if (slot.uploading) return;
      URL.revokeObjectURL(slot.previewUrl);
      return drop(key);
    }
    const id = clientId();
    if (slot.removing || id === null) return;
    patch(key, (current) => (current.state === "stored" ? { ...current, removing: true, error: null } : current));
    let ok: boolean;
    try {
      const removed = await removeClientMaterial({ clientId: id, assetId: slot.asset.id });
      // Already gone counts as removed.
      ok = removed.ok || removed.error.code === "NOT_FOUND";
    } catch {
      ok = false;
    }
    if (ok) {
      drop(key);
      announce(fill(copy.announce.removed, { name: slot.asset.fileName }));
    } else {
      patch(key, (current) => (current.state === "stored" ? { ...current, removing: false, error: copy.errors.remove } : current));
      announce(fill(copy.announce.error, { name: slot.asset.fileName, message: copy.errors.remove }));
    }
  }

  async function uploadAll(id: string): Promise<boolean> {
    let all = true;
    for (const slot of slotsRef.current) {
      if (slot.state !== "local") continue;
      if (!(await upload(id, slot.key))) all = false;
    }
    return all && slotsRef.current.every((slot) => slot.state === "stored");
  }

  const imageCount = slots.filter((slot) => slot.state === "local" || slot.asset.kind === "image").length;
  return {
    slots,
    imageCount,
    hasLocal: slots.some((slot) => slot.state === "local"),
    error,
    busy: slots.some((slot) => (slot.state === "local" ? slot.uploading : slot.removing)),
    pick,
    remove,
    uploadAll,
  };
}

export interface ClientImageSlotsProps {
  images: ClientImages;
  limits: ClientMaterialLimits;
  /** A save is running: no picks or removals. */
  disabled: boolean;
}

const TILE = "relative aspect-[4/3] overflow-hidden rounded-lg";

/**
 * The image slots under the logo: a counter ("{n} di 3"), `maxFiles` tiles (a
 * thumbnail with a remove ×, or **+ Aggiungi** on the first free one) and the hint.
 * A tile's own error shows under it; a pick's rejection under the hint.
 */
export function ClientImageSlots({ images, limits, disabled }: ClientImageSlotsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const hintId = `${labelId}-hint`;
  const errorId = `${labelId}-error`;
  const imageTypes = limits.contentTypes.filter((type) => type.startsWith("image/"));
  const free = Math.max(0, limits.maxFiles - images.slots.length);

  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-0.5">
        <span id={labelId} className="font-label text-[13px] font-medium text-foreground">
          {it.clientPanel.details.labels.images}
        </span>
        <RequiredMark />
        <p aria-live="polite" className="ml-auto font-mono text-xs text-foreground-muted tabular-nums">
          {fill(copy.counter, { n: images.imageCount, max: limits.maxFiles })}
        </p>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {images.slots.map((slot, index) => {
          const name = slot.state === "stored" ? slot.asset.fileName : slot.file.name;
          const thumbnail = slot.state === "stored" ? (slot.asset.kind === "image" ? slot.asset.thumbnailUrl : null) : slot.previewUrl;
          const pending = slot.state === "local" ? slot.uploading : slot.removing;
          const slotErrorId = `${labelId}-slot-${index}-error`;
          return (
            <li key={slot.key} data-slot={slot.state} className="flex flex-col gap-1">
              <div className={cn(TILE, "bg-surface-control")} aria-busy={pending || undefined}>
                {thumbnail === null ? (
                  <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-foreground-muted">
                    <FileText aria-hidden="true" className="size-5" />
                    <span className="w-full truncate text-center font-label text-[11px]">{name}</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnail} alt={fill(copy.alt, { n: index + 1 })} className="size-full object-cover" />
                )}
                {pending ? (
                  <span className="absolute inset-x-0 bottom-0 bg-surface-raised/85 px-2 py-1 text-center font-label text-[11px] text-foreground">{copy.uploading}</span>
                ) : null}
                <button
                  type="button"
                  aria-label={fill(copy.remove, { name })}
                  aria-disabled={disabled || pending || undefined}
                  aria-describedby={slot.error === null ? undefined : slotErrorId}
                  onClick={() => {
                    if (!disabled && !pending) void images.remove(slot.key);
                  }}
                  className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-surface-raised text-foreground shadow-control transition-colors duration-150 hover:bg-surface-hover"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
              {slot.state === "stored" && slot.asset.kind !== "image" ? <p className={FIELD_HINT}>{copy.notCounted}</p> : null}
              {slot.error === null ? null : (
                <p id={slotErrorId} className="font-label text-xs text-danger">
                  {slot.error}
                </p>
              )}
            </li>
          );
        })}
        {Array.from({ length: free }, (_, index) =>
          index === 0 ? (
            <li key="add">
              <button
                type="button"
                aria-label={copy.addLabel}
                aria-disabled={disabled || undefined}
                aria-describedby={[hintId, images.error !== null && errorId].filter(Boolean).join(" ")}
                onClick={() => {
                  if (!disabled) inputRef.current?.click();
                }}
                className={cn(
                  TILE,
                  "flex w-full flex-col items-center justify-center gap-1 border border-dashed border-border-strong font-label text-xs font-medium text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <Plus aria-hidden="true" className="size-4" />
                {copy.add}
              </button>
            </li>
          ) : (
            <li key={`empty-${index}`} aria-hidden="true" className={cn(TILE, "border border-dashed border-border")} />
          ),
        )}
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept={acceptFor(imageTypes)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so picking the same file again fires `change`.
          event.target.value = "";
          if (file !== undefined && !disabled) void images.pick(file);
        }}
      />
      <p id={hintId} className={FIELD_HINT}>
        {fill(copy.hint, { min: limits.minImages, max: limits.maxFiles, px: limits.minShortSide, types: imageTypeNames(imageTypes) })}
      </p>
      {images.error === null ? null : (
        <p id={errorId} role="alert" className="font-label text-xs text-danger">
          {images.error}
        </p>
      )}
    </div>
  );
}
