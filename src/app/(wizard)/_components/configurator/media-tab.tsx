"use client";

import { Film, ImageIcon, Star } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ListedAsset } from "@/modules/material";
import type { RenderAsset } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { acceptFor } from "../../_lib/upload";
import { formatLength, MEDIA_DRAG_TYPE, type MediaUploadRules } from "./media-files";
import { EYEBROW } from "./styles";
import type { MediaUpload } from "./use-media-upload";

const copy = it.configurator.media;

/** A stable empty list, so the default keeps its identity across renders. */
const NO_FILES: readonly ListedAsset[] = [];

const listClass = (view: "grid" | "list") => (view === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-0.5");

/** A video's display copy, whose metadata gives its length. */
const videoUrlOf = (assets: Readonly<Record<string, RenderAsset>>, id: string) => (assets[id]?.kind === "video" ? assets[id]?.url : undefined);

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
  onPick,
}: {
  file: ListedAsset;
  view: "grid" | "list";
  onPage: boolean;
  videoUrl: string | undefined;
  /** The favourite star; undefined for a client file (Story 4.5c-2: no star there). */
  onStar?: (file: ListedAsset) => void;
  /** A click: the file goes on the page (Story 4.5b); undefined while nothing can be placed. */
  onPick: ((file: ListedAsset) => void) | undefined;
}) {
  const seconds = useVideoLength(file.kind === "video" ? videoUrl : undefined);
  const length = seconds === null ? null : formatLength(seconds);
  // An expired or broken thumbnail URL falls back to the type icon.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumbnail = file.thumbnailUrl !== null && file.thumbnailUrl !== brokenUrl ? file.thumbnailUrl : null;
  const star = file.isFavourite ? copy.favourite.remove : copy.favourite.add;
  const grid = view === "grid";
  // With somewhere to put it, the thumbnail and name are one button; the star stays its own.
  const Pick = onPick === undefined ? "span" : "button";
  const notes = [onPage ? copy.onPage : null, length !== null ? fill(copy.videoLength, { length }) : null].filter((note) => note !== null);

  return (
    <li
      data-media={file.id}
      data-on-page={onPage ? "" : undefined}
      draggable={onPick !== undefined}
      onDragStart={(event) => {
        // The id in a private type: the canvas takes it, the drop zone and the browser ignore it.
        event.dataTransfer.setData(MEDIA_DRAG_TYPE, file.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "group relative flex min-w-0 rounded-xl transition-colors duration-150",
        grid ? "flex-col gap-1.5 bg-surface-control p-1.5 hover:bg-surface-selected" : "flex-row items-center gap-2.5 px-1.5 py-1 hover:bg-surface-hover",
      )}
    >
      <Pick
        {...(onPick === undefined ? {} : { type: "button" as const, title: copy.place, onClick: () => onPick(file) })}
        className={cn(
          "flex min-w-0 rounded-lg text-left outline-none focus-visible:outline-2 focus-visible:outline-focus-ring",
          grid ? "flex-col gap-1.5" : "flex-1 flex-row items-center gap-2.5",
          onPick !== undefined && "cursor-pointer",
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
      </Pick>
      {onStar !== undefined && (
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
      )}
    </li>
  );
}

export interface MediaTabProps {
  hidden: boolean;
  /** The case's images and videos, oldest first, as last listed (the configurator owns the list, Story 4.5c-3). */
  files: readonly ListedAsset[];
  /**
   * The client's images and videos, in position order (Story 4.5c-2): the "Del cliente"
   * group below the case's files, hidden when there are none. Placed like the case's; no
   * star, no removal, never uploaded to from here.
   */
  clientFiles?: readonly ListedAsset[];
  rules: MediaUploadRules;
  /** By asset id: a video's `url` gives its length. */
  assets: Readonly<Record<string, RenderAsset>>;
  /** Lowercased ids on a page of the format in view. */
  onPage: ReadonlySet<string>;
  query: string;
  view: "grid" | "list";
  /** The favourite star (set at once, saved, put back on failure). */
  onStar: (file: ListedAsset) => void;
  /** The case's one upload path (shared with the Animazione dialog). */
  upload: MediaUpload;
  /** A tile clicked: the file goes on the page (Story 4.5b); undefined while nothing can be placed (tiles neither click nor drag). */
  onPick?: (file: ListedAsset) => void;
}

/**
 * The right panel's **Media** tab (Story 4.5a, mockup `renderRight`): the case's images and
 * videos, oldest first, filtered by **Cerca** on file name, as tiles or a list. A file on a
 * page of the format in view is marked (●), a video shows its length. The star sets the
 * favourite (the server records the event; status never changes), at once, put back with a
 * message on failure. The drop zone at the foot uploads images and videos to the case's
 * material through the case's one upload path (`useMediaUpload`, Story 4.5c-3), which reads
 * the list again and polls while thumbnails are made. A tile clicked or dragged onto a
 * block puts its file on the page (Story 4.5b). Below them, under "Del cliente", the
 * client's images and videos (Story 4.5c-2): filtered and placed the same way, with no star;
 * the group is hidden when the client has none (or none matches **Cerca**). Kept mounted
 * while hidden.
 */
export function MediaTab({ hidden, files, clientFiles = NO_FILES, rules, assets, onPage, query, view, onStar, upload, onPick }: MediaTabProps) {
  const clientHeadingId = useId();

  const q = query.trim().toLocaleLowerCase("it");
  const matches = (file: ListedAsset) => q === "" || file.originalFileName.toLocaleLowerCase("it").includes(q);
  const shown = files.filter(matches);
  const clientShown = clientFiles.filter(matches);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    // A tile dragged back over the tab is not an upload.
    if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = upload.storageOff ? "none" : "copy";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const dropped = [...event.dataTransfer.files];
    if (dropped.length > 0) void upload.upload(dropped);
  }

  return (
    // Files dropped anywhere on the tab upload too: the browser never opens them in place of the configurator.
    <div hidden={hidden} onDragOver={onDragOver} onDrop={onDrop} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3.5">
        {shown.length > 0 ? (
          <ul aria-label={copy.label} className={listClass(view)}>
            {shown.map((file) => (
              <MediaTile
                key={file.id}
                file={file}
                view={view}
                onPage={onPage.has(file.id.toLowerCase())}
                videoUrl={videoUrlOf(assets, file.id)}
                onStar={onStar}
                onPick={onPick}
              />
            ))}
          </ul>
        ) : q !== "" && clientShown.length > 0 ? null : files.length === 0 && (q === "" || clientFiles.length === 0) ? (
          <p className="font-label text-[12.5px] text-foreground-muted">{copy.empty}</p>
        ) : (
          <p className="font-label text-[12.5px] text-foreground-muted">{fill(copy.noMatch, { query: query.trim() })}</p>
        )}
        {clientShown.length > 0 && (
          <div className={cn(shown.length > 0 || q === "" ? "mt-5" : undefined)}>
            <h3 id={clientHeadingId} className={EYEBROW}>
              {copy.clientGroup}
            </h3>
            <ul aria-labelledby={clientHeadingId} className={listClass(view)}>
              {clientShown.map((file) => (
                <MediaTile
                  key={file.id}
                  file={file}
                  view={view}
                  onPage={onPage.has(file.id.toLowerCase())}
                  videoUrl={videoUrlOf(assets, file.id)}
                  onPick={onPick}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-border bg-surface-sidebar px-3.5 py-3">
        <MediaDropZone label={`${copy.drop.lead}, ${copy.drop.choose}`} lead={copy.drop.lead} hint={copy.drop.hint} rules={rules} upload={upload} onFiles={(chosen) => void upload.upload(chosen)} />
      </div>
    </div>
  );
}

/**
 * A drop zone into the case's Media (the Media tab's foot, and the Animazione dialog's in
 * Story 4.5c-3): files dropped on it, or chosen with a click, Enter or Space, go to
 * `onFiles`. A Media tile dragged over it is not an upload. While files upload it says how
 * many; with storage off it is inactive.
 */
export function MediaDropZone({
  label,
  lead,
  hint,
  rules,
  upload,
  onFiles,
  className,
}: {
  /** The zone's accessible name (it is a button: it opens the file picker). */
  label: string;
  lead: string;
  hint: ReactNode;
  rules: MediaUploadRules;
  upload: Pick<MediaUpload, "uploading" | "storageOff">;
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  const { uploading, storageOff } = upload;
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const hintId = useId();

  function browse() {
    if (!storageOff) input.current?.click();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      browse();
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={storageOff ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={storageOff || undefined}
        data-drag-over={over ? "" : undefined}
        onClick={browse}
        onKeyDown={onKeyDown}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
          depth.current += 1;
          if (!storageOff) setOver(true);
        }}
        onDragLeave={(event) => {
          if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
          // Enter/leave also fire on children; only the last leave ends the drag.
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = storageOff ? "none" : "copy";
        }}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return;
          event.preventDefault();
          event.stopPropagation();
          depth.current = 0;
          setOver(false);
          const dropped = [...event.dataTransfer.files];
          if (dropped.length > 0) onFiles(dropped);
        }}
        className={cn(
          "cursor-pointer rounded-2xl border-[1.5px] border-dashed border-border-strong bg-surface-hover p-3.5 text-center transition-[border-color,background-color] duration-150",
          over && "border-accent bg-accent/5",
          storageOff && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        <b className="block font-label text-[13.5px] font-semibold text-foreground">{lead}</b>
        <span id={hintId} aria-live="polite" className="font-label text-[12.5px] text-foreground-muted">
          {uploading > 0 ? fill(copy.drop.uploading, { n: uploading }) : hint}
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
          if (chosen.length > 0) onFiles(chosen);
        }}
      />
    </>
  );
}
