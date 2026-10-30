"use client";

import { Film, ImageIcon, Star } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { confirmAssetUpload, listAssets, presignAssetUpload, setAssetFavourite } from "@/app/(tool)/case-studies/actions";
import type { ListedAsset } from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { acceptFor, normalizeContentType, uploadFile } from "../../_lib/upload";
import { THUMBNAIL_POLL_MAX_MS, THUMBNAIL_POLL_MS } from "../material-step";
import { formatLength, isMedia, type MediaUploadRules } from "./media-files";

const copy = it.configurator.media;
const materialCopy = it.wizard.material;

/** A video's length, read in the browser from its metadata; null until known (or without a URL). */
function useVideoLength(url: string | undefined): number | null {
  const [length, setLength] = useState<{ url: string; seconds: number } | null>(null);
  useEffect(() => {
    if (url === undefined) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const read = () => {
      if (Number.isFinite(video.duration)) setLength({ url, seconds: video.duration });
    };
    video.addEventListener("loadedmetadata", read);
    video.src = url;
    return () => {
      video.removeEventListener("loadedmetadata", read);
      video.removeAttribute("src");
    };
  }, [url]);
  return length !== null && length.url === url ? length.seconds : null;
}

function MediaTile({
  file,
  view,
  onPage,
  videoUrl,
  onStar,
}: {
  file: ListedAsset;
  view: "grid" | "list";
  onPage: boolean;
  videoUrl: string | undefined;
  onStar: (file: ListedAsset) => void;
}) {
  const seconds = useVideoLength(file.kind === "video" ? videoUrl : undefined);
  const length = seconds === null ? null : formatLength(seconds);
  // An expired or broken thumbnail URL falls back to the type icon.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumbnail = file.thumbnailUrl !== null && file.thumbnailUrl !== brokenUrl ? file.thumbnailUrl : null;
  const star = file.isFavourite ? copy.favourite.remove : copy.favourite.add;
  const grid = view === "grid";
  const notes = [onPage ? copy.onPage : null, length !== null ? fill(copy.videoLength, { length }) : null].filter((note) => note !== null);

  return (
    <li
      data-media={file.id}
      data-on-page={onPage ? "" : undefined}
      className={cn(
        "group relative flex min-w-0 rounded-xl transition-colors duration-150",
        grid ? "flex-col gap-1.5 bg-surface-control p-1.5 hover:bg-surface-selected" : "flex-row items-center gap-2.5 px-1.5 py-1 hover:bg-surface-hover",
      )}
    >
      <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-surface-selected text-foreground-muted", grid ? "aspect-square w-full rounded-lg" : "size-9 rounded-md")}>
        {thumbnail !== null ? (
          // A presigned GET of the thumbnail rendition, or of an image's original; no next/image (as the Material step).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" onError={() => setBrokenUrl(thumbnail)} className="absolute inset-0 size-full object-cover" />
        ) : file.kind === "video" ? (
          <Film aria-hidden="true" className="size-4" />
        ) : (
          <ImageIcon aria-hidden="true" className="size-4" />
        )}
        {grid && file.kind === "video" && (
          <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-scrim/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-surface-inverse-foreground">
            {length === null ? "▶" : `▶ ${length}`}
          </span>
        )}
      </span>
      <small className="min-w-0 flex-1 truncate font-label text-[12.5px] text-foreground-muted">
        {onPage && (
          <span aria-hidden="true" className="text-accent">
            {"● "}
          </span>
        )}
        {file.originalFileName}
        {notes.length > 0 && <span className="sr-only">{`, ${notes.join(", ")}`}</span>}
      </small>
      <button
        type="button"
        aria-pressed={file.isFavourite}
        aria-label={`${star}: ${file.originalFileName}`}
        title={star}
        onClick={() => onStar(file)}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full transition-opacity duration-150 active:scale-[0.97]",
          grid
            ? "absolute top-3 right-3 bg-scrim/60 text-surface-inverse-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100 aria-pressed:text-primary"
            : "text-foreground-muted hover:text-foreground aria-pressed:text-foreground-strong",
        )}
      >
        <Star aria-hidden="true" className={cn("size-3", file.isFavourite && "fill-current")} />
      </button>
    </li>
  );
}

/** How one presign → PUT → confirm attempt ended. */
type Attempt =
  | { kind: "done" }
  | { kind: "storage" }
  | { kind: "rejected"; message: string }
  /** `unconfirmed`: confirm threw or answered 5xx, so this asset may have been stored anyway. */
  | { kind: "retry"; unconfirmed?: string };

export interface MediaTabProps {
  hidden: boolean;
  caseId: string;
  /** The case's images and videos, oldest first, as the page listed them. */
  initialFiles: readonly ListedAsset[];
  rules: MediaUploadRules;
  /** By asset id: a video's `url` gives its length. */
  assets: Readonly<Record<string, RenderAsset>>;
  /** Lowercased ids on a page of the format in view. */
  onPage: ReadonlySet<string>;
  query: string;
  view: "grid" | "list";
  /** A message at the top of the canvas. */
  say: (text: string) => void;
}

/**
 * The right panel's **Media** tab (Story 4.5a, mockup `renderRight`): the case's images and
 * videos, oldest first, filtered by **Cerca** on file name, as tiles or a list. A file on a
 * page of the format in view is marked (●), a video shows its length. The star sets the
 * favourite (the server records the event; status never changes), at once, put back with a
 * message on failure. The drop zone at the foot uploads images and videos to the case's
 * material with Story 2.7's rules: each file presigned, sent and confirmed, retried once;
 * a refused file is named in one message at the end. Then the list is read again, and
 * again every few seconds while a thumbnail is being made. Placing a file on a page comes
 * with Story 4.5b. Kept mounted while hidden, so uploads and stars survive a tab switch.
 */
export function MediaTab({ hidden, caseId, initialFiles, rules, assets, onPage, query, view, say }: MediaTabProps) {
  const [files, setFiles] = useState<readonly ListedAsset[]>(initialFiles);
  const [uploading, setUploading] = useState(0);
  const [storageOff, setStorageOff] = useState(false);
  const [over, setOver] = useState(false);
  const [pollWindow, setPollWindow] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const favouriteBusy = useRef(new Set<string>());
  const unmounted = useRef(false);
  const hintId = useId();

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);

  const q = query.trim().toLocaleLowerCase("it");
  const shown = q === "" ? files : files.filter((file) => file.originalFileName.toLocaleLowerCase("it").includes(q));

  /** Reads the case's files again; the list keeps what it had on a failure. */
  async function relist(): Promise<readonly ListedAsset[] | null> {
    try {
      const fresh = await listAssets({ caseId });
      if (!fresh.ok || unmounted.current) return null;
      const media = fresh.value.filter(isMedia);
      // A star still saving keeps the value it shows.
      setFiles((current) => {
        const shownStar = new Map(current.map((f) => [f.id, f.isFavourite]));
        return media.map((f) => (favouriteBusy.current.has(f.id) && shownStar.has(f.id) ? { ...f, isFavourite: shownStar.get(f.id) as boolean } : f));
      });
      return media;
    } catch {
      return null;
    }
  }

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
    // relist reads only the case id and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, pollWindow]);

  async function star(file: ListedAsset) {
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
  }

  const rejections: Readonly<Record<string, string>> = {
    FILE_LIMIT_REACHED: fill(materialCopy.errors.limit, { max: rules.maxFiles }),
    FILE_TOO_LARGE: fill(materialCopy.errors.tooLarge, { size: Math.round(rules.maxFileBytes / (1024 * 1024)) }),
    FILE_TYPE_NOT_ALLOWED: copy.errors.type,
    UPLOAD_REJECTED: materialCopy.errors.rejected,
  };

  function classify(code: string): Attempt {
    if (code === "STORAGE_NOT_CONFIGURED") return { kind: "storage" };
    return Object.hasOwn(rejections, code) ? { kind: "rejected", message: rejections[code] } : { kind: "retry" };
  }

  async function attempt(file: File, contentType: string): Promise<Attempt> {
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
      return { kind: "done" };
    } catch {
      return { kind: "retry", unconfirmed: confirming };
    }
  }

  /** One file, retried once; a confirm that failed late counts as done when the asset was stored after all. */
  async function uploadOne(file: File, contentType: string): Promise<Attempt> {
    let outcome: Attempt = { kind: "retry" };
    for (let tries = 0; tries < 2 && outcome.kind === "retry"; tries++) {
      outcome = await attempt(file, contentType);
      const unconfirmed = outcome.kind === "retry" ? outcome.unconfirmed : undefined;
      if (unconfirmed !== undefined) {
        const stored = await relist();
        if (stored?.some((f) => f.id === unconfirmed) === true) return { kind: "done" };
      }
    }
    return outcome.kind === "retry" ? { kind: "rejected", message: materialCopy.errors.failed } : outcome;
  }

  async function upload(dropped: File[]) {
    if (storageOff) {
      say(materialCopy.errors.storage);
      return;
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
    if (unmounted.current) return;

    const done = outcomes.filter(({ outcome }) => outcome.kind === "done");
    if (outcomes.some(({ outcome }) => outcome.kind === "storage")) {
      setStorageOff(true);
      lines.push(materialCopy.errors.storage);
    }
    for (const { name, outcome } of outcomes) {
      if (outcome.kind === "rejected") lines.push(fill(materialCopy.announce.error, { name, message: outcome.message }));
    }
    if (done.length > 0) {
      await relist();
      setPollWindow((n) => n + 1);
      lines.unshift(done.length === 1 ? fill(materialCopy.announce.done, { name: done[0].name }) : fill(copy.uploaded, { n: done.length }));
    }
    if (lines.length > 0) say(lines.join(" "));
  }

  function browse() {
    if (!storageOff) input.current?.click();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      browse();
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = storageOff ? "none" : "copy";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setOver(false);
    const dropped = [...event.dataTransfer.files];
    if (dropped.length > 0) void upload(dropped);
  }

  return (
    // Files dropped anywhere on the tab upload too: the browser never opens them in place of the configurator.
    <div hidden={hidden} onDragOver={onDragOver} onDrop={onDrop} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3.5">
        {files.length === 0 ? (
          <p className="font-label text-[12.5px] text-foreground-muted">{copy.empty}</p>
        ) : shown.length === 0 ? (
          <p className="font-label text-[12.5px] text-foreground-muted">{fill(copy.noMatch, { query: query.trim() })}</p>
        ) : (
          <ul aria-label={copy.label} className={cn(view === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-0.5")}>
            {shown.map((file) => (
              <MediaTile
                key={file.id}
                file={file}
                view={view}
                onPage={onPage.has(file.id.toLowerCase())}
                videoUrl={assets[file.id]?.kind === "video" ? assets[file.id]?.url : undefined}
                onStar={(f) => void star(f)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-surface-sidebar px-3.5 py-3">
        <div
          role="button"
          tabIndex={storageOff ? -1 : 0}
          aria-label={`${copy.drop.lead}, ${copy.drop.choose}`}
          aria-describedby={hintId}
          aria-disabled={storageOff || undefined}
          data-drag-over={over ? "" : undefined}
          onClick={browse}
          onKeyDown={onKeyDown}
          onDragEnter={() => {
            depth.current += 1;
            if (!storageOff) setOver(true);
          }}
          onDragLeave={() => {
            // Enter/leave also fire on children; only the last leave ends the drag.
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setOver(false);
          }}
          className={cn(
            "cursor-pointer rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface-hover p-3.5 text-center transition-[border-color,background-color] duration-150",
            over && "border-accent bg-accent/5",
            storageOff && "cursor-not-allowed opacity-60",
          )}
        >
          <b className="block font-label text-[13.5px] font-semibold text-foreground">{copy.drop.lead}</b>
          <span id={hintId} aria-live="polite" className="font-label text-[12.5px] text-foreground-muted">
            {uploading > 0 ? fill(copy.drop.uploading, { n: uploading }) : copy.drop.hint}
          </span>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={acceptFor(rules.contentTypes)}
          tabIndex={-1}
          className="hidden"
          disabled={storageOff}
          onChange={(event) => {
            const chosen = [...(event.target.files ?? [])];
            // Clear it, so choosing the same file again still fires a change.
            event.target.value = "";
            if (chosen.length > 0) void upload(chosen);
          }}
        />
      </div>
    </div>
  );
}
