"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface SheetProps {
  /** Controlled: the caller owns the open state. */
  open: boolean;
  /** Called on Esc and on the × (the caller decides whether to close, e.g. after a confirm). */
  onClose: () => void;
  /** Labels the sheet (`aria-labelledby`). */
  title: ReactNode;
  /** The line under the title, describing the sheet (`aria-describedby`). */
  description?: ReactNode;
  /** The ×'s accessible name. */
  closeLabel: string;
  /** The scrolling body. */
  children: ReactNode;
  /** The footer, always visible under the body (the caller's actions). */
  footer?: ReactNode;
  /** Marks the sheet busy while a save runs. */
  busy?: boolean;
}

/**
 * A modal side sheet (client panel, owner's mock 2026-10-21): a native `<dialog>`
 * opened with `showModal()`, full height at the right edge, about 500 px wide, over
 * a scrim, so the page behind stays visible but inert. A header (title, line, ×), a
 * body that scrolls, a footer that stays. It slides in from the right (≤300 ms,
 * ease-out; instant with reduced motion). Focus moves to the caller's
 * `data-autofocus` element (else the first focusable) and returns to the opener on
 * close. Esc and the × call `onClose` (also when the browser closed it on a repeated
 * Esc: it is shown again first); a click on the scrim does nothing.
 *
 * Unlike `Dialog` it does not take the single-open slot, so a `Dialog` (e.g.
 * **Elimina cliente**'s) may open on top of it.
 */
export function Sheet({ open, onClose, title, description, closeLabel, children, footer, busy = false }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Esc fires `cancel` on the topmost dialog only; it does not bubble from a Dialog on top.
    const handleCancel = (event: Event) => {
      if (event.target !== dialog) return;
      event.preventDefault();
      onCloseRef.current();
    };
    // A repeated Esc may fire a `cancel` that can't be prevented, and the browser closes
    // the dialog while the caller still has it open: show it again and ask the caller.
    const handleNativeClose = () => {
      if (dialog.open) return;
      dialog.showModal();
      onCloseRef.current();
    };
    dialog.showModal();
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleNativeClose);
    (dialog.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog).focus();

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleNativeClose);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-busy={busy || undefined}
      className="m-0 ml-auto h-dvh max-h-dvh w-[500px] max-w-full flex-col overflow-hidden bg-surface text-foreground shadow-popover backdrop:bg-scrim/40 backdrop:backdrop-blur-[2px] open:flex open:motion-safe:animate-sheet-in"
    >
      <header className="flex items-start justify-between gap-4 bg-surface-raised px-6 pt-6 pb-5 shadow-card">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id={titleId} className="font-heading text-xl font-semibold tracking-[-0.015em] text-foreground-strong">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="font-body text-sm leading-relaxed text-foreground-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="-mt-1 -mr-2 flex size-8 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground-strong"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      {/* Only the body scrolls: `relative` keeps visually hidden text (live regions) inside it, and the sheet clips. */}
      <div data-sheet-body="" className="relative min-h-0 flex-1 overflow-y-auto px-6 py-6">
        {children}
      </div>
      {footer ? (
        <footer data-sheet-footer="" className="bg-surface-raised px-6 py-4 shadow-card">
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
