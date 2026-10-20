"use client";

import { ArrowUp } from "lucide-react";
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

const copy = it.wizard.material.drop;
const TYPES = Object.values(copy.types);

export interface DropZoneProps {
  /** The file input's `accept`. */
  accept: string;
  maxFiles: number;
  /** Shown in the hint, in MB. */
  maxFileMegabytes: number;
  /** With files in the list it compacts: no icon, the types join the hint. */
  compact: boolean;
  /** Storage is off: the zone is inactive and ignores drops. */
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

/**
 * The Material drop zone (DESIGN.md drop zone): drag and drop, or the whole zone
 * as one button (click, Enter or Space) that opens the hidden multi-file input
 * behind the lime *sfoglia* link. Accepted types show as mono chips while empty.
 */
export function DropZone({ accept, maxFiles, maxFileMegabytes, compact, disabled, onFiles }: DropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hint = fill(copy.hint, { max: maxFiles, size: maxFileMegabytes });

  function browse() {
    if (!disabled) input.current?.click();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      browse();
    }
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    if (disabled) return;
    const files = [...event.dataTransfer.files];
    if (files.length > 0) onFiles(files);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${copy.lead} ${copy.browse}`}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        data-drag-over={over ? "" : undefined}
        onClick={browse}
        onKeyDown={onKeyDown}
        onDragOver={onDragOver}
        onDragEnter={() => {
          depth.current += 1;
        }}
        onDragLeave={() => {
          // Enter/leave also fire on children (the link, the chips); only the last leave ends the drag.
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={onDrop}
        className={cn(
          "cursor-pointer rounded-xl border-[1.5px] border-dashed border-border-strong bg-surface-raised text-center font-body text-[15px] text-foreground transition-[border-color,background-color] duration-200 ease-out hover:border-foreground-muted/60",
          compact ? "p-6" : "px-6 py-12",
          over && "border-accent bg-accent/5",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {!compact && (
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground"
          >
            <ArrowUp className="size-5" />
          </div>
        )}
        <p>
          {copy.lead} <span className="font-medium text-foreground-strong underline decoration-primary decoration-2 underline-offset-[4px]">{copy.browse}</span>
        </p>
        <div id={hintId}>
          <p className="mt-1.5 font-label text-xs text-foreground-muted">
            {compact ? `${hint} ${TYPES.join(", ")}.` : hint}
          </p>
          {!compact && (
            <ul className="mt-5 flex flex-wrap justify-center gap-2">
              {TYPES.map((type) => (
                <li
                  key={type}
                  className="rounded-full bg-surface-control px-2.5 py-1 font-mono text-[11px] text-foreground-muted"
                >
                  {type}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        tabIndex={-1}
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Clear it, so choosing the same file again still fires a change.
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}
