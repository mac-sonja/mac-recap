"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { confirmAssetUpload, listAssets, presignAssetUpload, setAssetFavourite } from "@/app/(tool)/case-studies/actions";
import type { ListedAsset } from "@/modules/material";
import { fill, it } from "@/shared/i18n/it";
import { normalizeContentType, uploadFile } from "../../_lib/upload";
import { THUMBNAIL_POLL_MAX_MS, THUMBNAIL_POLL_MS } from "../material-step";
import { isMedia, type MediaUploadRules } from "./media-files";

const copy = it.configurator.media;
const materialCopy = it.wizard.material;

/** The case's images and videos, as last listed, with the reads and the star that keep them current. */
export interface CaseMedia {
  /** The case's images and videos, oldest first. */
  files: readonly ListedAsset[];
  /** Reads the files again; null (and the list unchanged) on a failure. */
  relist: () => Promise<readonly ListedAsset[] | null>;
  /** Starts a new window of thumbnail polling (after an upload). */
  poll: () => void;
  /** The favourite star: set at once, saved, put back with a message on failure. */
  star: (file: ListedAsset) => Promise<void>;
}

/**
 * The one list of the case's images and videos (Story 4.5c-3), owned by the configurator and
 * shared by the Media tab and the Animazione dialog: read again after an upload, and every
 * THUMBNAIL_POLL_MS (for at most THUMBNAIL_POLL_MAX_MS) while a thumbnail is being made.
 * `onListed` hears each fresh list (the configurator reads the new files' render assets).
 */
export function useCaseMedia({
  caseId,
  initial,
  say,
  onListed,
}: {
  caseId: string;
  initial: readonly ListedAsset[];
  say: (text: string) => void;
  onListed?: (files: readonly ListedAsset[]) => void;
}): CaseMedia {
  const [files, setFiles] = useState<readonly ListedAsset[]>(initial);
  const [pollWindow, setPollWindow] = useState(0);
  const favouriteBusy = useRef(new Set<string>());
  const unmounted = useRef(false);
  const onListedNow = useRef(onListed);
  useEffect(() => {
    onListedNow.current = onListed;
  });

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const relist = useCallback(async (): Promise<readonly ListedAsset[] | null> => {
    try {
      const fresh = await listAssets({ caseId });
      if (!fresh.ok || unmounted.current) return null;
      const media = fresh.value.filter(isMedia);
      // A star still saving keeps the value it shows.
      setFiles((current) => {
        const shownStar = new Map(current.map((f) => [f.id, f.isFavourite]));
        return media.map((f) => (favouriteBusy.current.has(f.id) && shownStar.has(f.id) ? { ...f, isFavourite: shownStar.get(f.id) as boolean } : f));
      });
      onListedNow.current?.(media);
      return media;
    } catch {
      return null;
    }
  }, [caseId]);

  // While a file waits for its thumbnail, re-list every THUMBNAIL_POLL_MS, for at most THUMBNAIL_POLL_MAX_MS.
  const waiting = files.some((file) => file.thumbnailPending);
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + THUMBNAIL_POLL_MAX_MS;
    const tick = async () => {
      await relist();
      if (stopped || Date.now() + THUMBNAIL_POLL_MS > deadline) return;
      handle = setTimeout(() => void tick(), THUMBNAIL_POLL_MS);
    };
    handle = setTimeout(() => void tick(), THUMBNAIL_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(handle);
    };
  }, [waiting, pollWindow, relist]);

  const poll = useCallback(() => setPollWindow((n) => n + 1), []);

  const star = useCallback(
    async (file: ListedAsset) => {
      if (favouriteBusy.current.has(file.id)) return;
      favouriteBusy.current.add(file.id);
      const next = !file.isFavourite;
      const set = (value: boolean) => setFiles((current) => current.map((f) => (f.id === file.id ? { ...f, isFavourite: value } : f)));
      set(next);
      try {
        const saved = await setAssetFavourite({ caseId, assetId: file.id, isFavourite: next });
        if (!saved.ok) throw new Error(saved.error.code);
      } catch {
        if (!unmounted.current) {
          set(!next);
          say(materialCopy.errors.favourite);
        }
      } finally {
        favouriteBusy.current.delete(file.id);
      }
    },
    [caseId, say],
  );

  return { files, relist, poll, star };
}

/** How one presign → PUT → confirm attempt ended; `done` keeps the new asset's id. */
type Attempt =
  | { kind: "done"; assetId: string }
  | { kind: "storage" }
  | { kind: "rejected"; message: string }
  /** `unconfirmed`: confirm threw or answered 5xx, so this asset may have been stored anyway. */
  | { kind: "retry"; unconfirmed?: string };

/** What a drop zone needs: the upload, how many files are still going, and whether storage is off. */
export interface MediaUpload {
  /**
   * Uploads `dropped` to the case's Media and resolves to the ids of the files that went and
   * that the list read again shows, in drop order. One message at the end says what happened; `note`, given those ids, may add
   * a line of the caller's own (or null).
   */
  upload: (dropped: readonly File[], note?: (ids: readonly string[]) => string | null) => Promise<string[]>;
  /** Files still uploading. */
  uploading: number;
  /** Storage isn't configured: drop zones turn off. */
  storageOff: boolean;
}

/**
 * The one upload path into the case's Media (Story 4.5a, shared by the Animazione dialog in
 * 4.5c-3), with Story 2.7's rules: each file checked for type and size before any call, then
 * presigned, sent and confirmed, retried once; a confirm that failed late counts when the
 * list read again shows the file. A refused file is named in one message at the end, through
 * the caller's `say`. Then the list is read again and thumbnail polling restarts.
 */
export function useMediaUpload({ caseId, rules, say, media }: { caseId: string; rules: MediaUploadRules; say: (text: string) => void; media: CaseMedia }): MediaUpload {
  const [uploading, setUploading] = useState(0);
  const [storageOff, setStorageOff] = useState(false);
  const unmounted = useRef(false);
  const { relist, poll } = media;

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const upload = useCallback(
    async (dropped: readonly File[], note?: (ids: readonly string[]) => string | null): Promise<string[]> => {
      const rejections: Readonly<Record<string, string>> = {
        FILE_LIMIT_REACHED: fill(materialCopy.errors.limit, { max: rules.maxFiles }),
        FILE_TOO_LARGE: fill(materialCopy.errors.tooLarge, { size: Math.round(rules.maxFileBytes / (1024 * 1024)) }),
        FILE_TYPE_NOT_ALLOWED: copy.errors.type,
        UPLOAD_REJECTED: materialCopy.errors.rejected,
      };

      const classify = (code: string): Attempt => {
        if (code === "STORAGE_NOT_CONFIGURED") return { kind: "storage" };
        return Object.hasOwn(rejections, code) ? { kind: "rejected", message: rejections[code] } : { kind: "retry" };
      };

      const attempt = async (file: File, contentType: string): Promise<Attempt> => {
        let confirming: string | undefined;
        try {
          const presigned = await presignAssetUpload({ caseId, contentType, sizeBytes: file.size });
          if (!presigned.ok) return classify(presigned.error.code);
          const { assetId, url, method, headers } = presigned.value;
          await uploadFile({ url, method, headers }, file, () => {});
          confirming = assetId;
          const confirmed = await confirmAssetUpload({ caseId, assetId, contentType, fileName: file.name });
          if (!confirmed.ok) {
            const outcome = classify(confirmed.error.code);
            return outcome.kind === "retry" && confirmed.status >= 500 ? { kind: "retry", unconfirmed: assetId } : outcome;
          }
          return { kind: "done", assetId };
        } catch {
          return { kind: "retry", unconfirmed: confirming };
        }
      };

      /** One file, retried once; a confirm that failed late counts as done when the asset was stored after all. */
      const uploadOne = async (file: File, contentType: string): Promise<Attempt> => {
        let outcome: Attempt = { kind: "retry" };
        for (let tries = 0; tries < 2 && outcome.kind === "retry"; tries++) {
          outcome = await attempt(file, contentType);
          const unconfirmed = outcome.kind === "retry" ? outcome.unconfirmed : undefined;
          if (unconfirmed !== undefined) {
            const stored = await relist();
            if (stored?.some((f) => f.id === unconfirmed) === true) return { kind: "done", assetId: unconfirmed };
          }
        }
        return outcome.kind === "retry" ? { kind: "rejected", message: materialCopy.errors.failed } : outcome;
      };

      if (storageOff) {
        say(materialCopy.errors.storage);
        return [];
      }
      const lines: string[] = [];
      const accepted: { file: File; contentType: string }[] = [];
      for (const file of dropped) {
        const contentType = normalizeContentType(file, rules.contentTypes);
        if (contentType === null) lines.push(fill(materialCopy.announce.error, { name: file.name, message: copy.errors.type }));
        else if (file.size > rules.maxFileBytes) lines.push(fill(materialCopy.announce.error, { name: file.name, message: rejections.FILE_TOO_LARGE }));
        else accepted.push({ file, contentType });
      }

      setUploading((n) => n + accepted.length);
      const outcomes = await Promise.all(
        accepted.map(async ({ file, contentType }) => {
          const outcome = await uploadOne(file, contentType);
          if (!unmounted.current) setUploading((n) => n - 1);
          return { name: file.name, outcome };
        }),
      );
      if (unmounted.current) return [];

      const uploaded: string[] = [];
      for (const { outcome } of outcomes) if (outcome.kind === "done") uploaded.push(outcome.assetId);
      if (outcomes.some(({ outcome }) => outcome.kind === "storage")) {
        setStorageOff(true);
        lines.push(materialCopy.errors.storage);
      }
      for (const { name, outcome } of outcomes) {
        if (outcome.kind === "rejected") lines.push(fill(materialCopy.announce.error, { name, message: outcome.message }));
      }
      // Only files the fresh list shows are handed back (none when it can't be read): the rest appear at the next read.
      let ids: string[] = [];
      if (uploaded.length > 0) {
        const fresh = await relist();
        ids = uploaded.filter((id) => fresh?.some((f) => f.id === id) === true);
        poll();
        const done = outcomes.filter(({ outcome }) => outcome.kind === "done");
        lines.unshift(done.length === 1 ? fill(materialCopy.announce.done, { name: done[0].name }) : fill(copy.uploaded, { n: done.length }));
        const extra = ids.length > 0 ? (note?.(ids) ?? null) : null;
        if (extra !== null) lines.push(extra);
      }
      if (lines.length > 0) say(lines.join(" "));
      return ids;
    },
    [caseId, poll, relist, rules, say, storageOff],
  );

  return { upload, uploading, storageOff };
}
