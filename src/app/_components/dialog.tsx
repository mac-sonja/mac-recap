"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * The single-open slot: at most one Dialog is shown at a time (UX-DR1, UX-DR27).
 * Holds the owner token of the open Dialog, or null.
 */
let openOwner: symbol | null = null;

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface DialogProps {
  /** Controlled: the caller owns the open state. */
  open: boolean;
  /** Called on Esc (or any browser-initiated close); the caller then sets `open` false. */
  onClose: () => void;
  /** Labels the dialog (`aria-labelledby`). */
  title: ReactNode;
  /** Describes the dialog (`aria-describedby`) when given. */
  description?: ReactNode;
  children?: ReactNode;
  /** The caller's Cancel/confirm controls; the Dialog adds no strings of its own. */
  actions?: ReactNode;
}

/**
 * The only dialog in the app: a native `<dialog>` opened with `showModal()`, so the
 * browser makes the rest of the page inert (the focus trap). One level deep: opening
 * a second Dialog while one is open is refused with a warning. Focus moves into the
 * dialog on open and returns to the opener on close. A backdrop click does not close it.
 */
export function Dialog({ open, onClose, title, description, children, actions }: DialogProps) {
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

    if (openOwner !== null) {
      console.warn("Dialog: another dialog is already open; dialogs never stack, so this one stays closed.");
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Esc fires `cancel`: hand it to the caller instead of closing natively.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    // A browser may still close the dialog itself (e.g. repeated Esc without user
    // activation); keep the caller's state in sync.
    const handleNativeClose = () => onCloseRef.current();

    // Claim the slot only once showModal() has succeeded, so a throw never leaks it.
    dialog.showModal();
    const owner = Symbol("dialog");
    openOwner = owner;
    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleNativeClose);
    // A caller's autofocus (e.g. on Cancel) wins over the first focusable element.
    // React's `autoFocus` prop renders no attribute on the client, so callers mark
    // the element with `data-autofocus`; a literal `autofocus` attribute also counts.
    (
      dialog.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ??
      dialog.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog
    ).focus();

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleNativeClose);
      if (dialog.open) dialog.close();
      if (openOwner === owner) openOwner = null;
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="m-auto w-full max-w-md rounded-md border border-border bg-surface-raised p-6 text-foreground backdrop:bg-foreground/50"
    >
      <h2 id={titleId} className="font-heading text-lg text-foreground">
        {title}
      </h2>
      {description ? (
        <p id={descriptionId} className="mt-2 font-body text-sm text-foreground-muted">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-4 font-body text-sm">{children}</div> : null}
      {actions ? <div className="mt-6 flex justify-end gap-3">{actions}</div> : null}
    </dialog>
  );
}
