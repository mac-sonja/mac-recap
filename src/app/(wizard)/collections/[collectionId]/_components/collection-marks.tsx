"use client";

import { EyeOff } from "lucide-react";
import { useLayoutEffect, useState, type RefObject, type SyntheticEvent } from "react";
import type { FormatId } from "@/modules/rendering";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { PAGE_WIDTH } from "@/app/(wizard)/_components/configurator/styles";

/** A free text with the collection's words, as its mark shows it. */
export interface TextMark {
  elementId: string;
  /** The original changed since the edit was saved. */
  originalChanged: boolean;
  /** The original's words now; null when it can't be read. */
  original: string | null;
  /** **Ripristina testo originale** / **Usa originale**. */
  onRestore: () => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
}

/** Keeps a click, a double-click or a press on a mark from reaching the page (it would select or open a text). */
const keep = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Story 5.11a: under each free text of a page that has the collection's words, a mark:
 * "Modificato in questa raccolta" with **Ripristina testo originale**, or, when the original
 * changed since, "Il testo originale è cambiato" with **Vedi originale** and **Usa originale**.
 * Placed by the text's box in the rendered page (`host`), measured again when the page reflows.
 */
export function TextMarks({ host, marks }: { host: RefObject<HTMLElement | null>; marks: readonly TextMark[] }) {
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  const [open, setOpen] = useState<string | null>(null);
  const ids = marks.map((m) => m.elementId).join(",");
  useLayoutEffect(() => {
    const el = host.current;
    if (el === null || ids === "") return;
    const measure = () => {
      const outer = el.getBoundingClientRect();
      const next: Record<string, Box> = {};
      for (const id of ids.split(",")) {
        const node = el.querySelector(`[data-element-id="${id}"]`);
        if (node === null) continue;
        const inner = node.getBoundingClientRect();
        next[id] = { top: inner.bottom - outer.top, left: inner.left - outer.left, width: inner.width };
      }
      setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [host, ids]);

  const copy = it.collection.edits;
  return (
    <>
      {marks.map((mark) => {
        const box = boxes[mark.elementId] ?? { top: 0, left: 0, width: 0 };
        const showing = open === mark.elementId;
        return (
          <div
            key={mark.elementId}
            data-text-mark={mark.elementId}
            onClick={keep}
            onDoubleClick={keep}
            onPointerDown={keep}
            className="absolute z-20 flex max-w-[420px] cursor-default flex-col items-start gap-1"
            style={{ top: box.top + 4, left: box.left }}
          >
            <span
              className={cn(
                "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full px-2.5 py-1 font-label text-[11.5px] leading-tight font-medium shadow-control",
                mark.originalChanged ? "bg-warning text-warning-foreground" : "bg-surface-raised text-foreground",
              )}
            >
              <span>{mark.originalChanged ? copy.originalChanged : copy.edited}</span>
              {mark.originalChanged && (
                <button type="button" aria-expanded={showing} onClick={() => setOpen(showing ? null : mark.elementId)} className="font-semibold underline underline-offset-2">
                  {showing ? copy.hideOriginal : copy.showOriginal}
                </button>
              )}
              <button type="button" onClick={mark.onRestore} className="font-semibold underline underline-offset-2">
                {mark.originalChanged ? copy.useOriginal : copy.restoreText}
              </button>
            </span>
            {showing && (
              <div role="note" aria-label={copy.originalLabel} className="rounded-lg bg-surface-raised px-3 py-2 font-body text-[13px] whitespace-pre-wrap text-foreground shadow-popover motion-safe:animate-dialog-in">
                <span className="mb-0.5 block font-label text-[11px] font-semibold tracking-[0.04em] text-foreground-muted uppercase">{copy.originalLabel}</span>
                {mark.original === null || mark.original === "" ? copy.originalEmpty : mark.original}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Story 5.11a: a hidden page's collapsed strip, where the page sat, with **Ripristina**. */
export function HiddenPageStrip({ formatId, pageKey, name, onRestore }: { formatId: FormatId; pageKey: string; name: string; onRestore: () => void }) {
  return (
    <div
      data-hidden-page={pageKey}
      className={cn(
        "mt-3.5 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border-strong bg-surface-raised/60 px-3 py-2 font-label text-[12.5px] text-foreground-muted",
        PAGE_WIDTH[formatId],
      )}
    >
      <EyeOff aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{fill(it.collection.edits.hiddenStrip, { name })}</span>
      <button
        type="button"
        onClick={onRestore}
        className="shrink-0 rounded-md px-2 py-1 font-semibold text-foreground transition-colors duration-150 hover:bg-surface-hover"
      >
        {it.collection.edits.restorePage}
      </button>
    </div>
  );
}
