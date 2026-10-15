"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { createClient, renameClient } from "@/app/(tool)/clients/actions";
import type { Client } from "@/modules/case-study";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

export type ClientNameDialogMode = { kind: "add" } | { kind: "rename"; client: Client };

export interface ClientNameDialogProps {
  mode: ClientNameDialogMode;
  /** The longest accepted name after trimming (`CLIENT_NAME_MAX`). */
  maxLength: number;
  /** Esc or Annulla: the caller unmounts the dialog, and focus goes back to the opener. */
  onClose: () => void;
  /** After a successful save: the caller closes the dialog and refreshes the page. */
  onSaved: (client: Client) => void;
}

const INPUT =
  "w-full rounded-md border bg-surface-control px-3 py-2 font-body text-sm text-foreground placeholder:text-foreground-muted aria-invalid:border-danger";
const SECONDARY =
  "rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected";

/**
 * One dialog for **Aggiungi cliente** and **Modifica nome**: a name field only
 * (no code field; the code is automatic and never changes). Mounted open by the
 * caller. The name is checked here first (1–`maxLength` characters after trimming:
 * an inline error, no request, focus stays in the field). The server's refusals
 * map to inline errors under the field (`CLIENT_NAME_TAKEN`, `CLIENT_CODE_EXHAUSTED`,
 * `INVALID_INPUT` on name); anything else, `CLIENT_NOT_FOUND` included, shows one
 * generic line. On any error the dialog stays open with the typed name. While a
 * save is in flight, Annulla and Esc are ignored and a second submit sends nothing.
 */
export function ClientNameDialog({ mode, maxLength, onClose, onSaved }: ClientNameDialogProps) {
  const formId = useId();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const inFlight = useRef(false);
  const [name, setName] = useState(mode.kind === "rename" ? mode.client.name : "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const adding = mode.kind === "add";

  // While a save is in flight the client may still be created or renamed: Annulla and Esc do nothing.
  function cancel() {
    if (!inFlight.current) onClose();
  }

  function showFieldError(message: string) {
    // Commit aria-invalid and the message before focus moves, so they are announced.
    flushSync(() => setFieldError(message));
    document.getElementById(inputId)?.focus();
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const trimmed = name.trim();
    if (trimmed === "") return showFieldError(it.clients.errors.nameRequired);
    if (trimmed.length > maxLength) return showFieldError(fill(it.clients.errors.nameTooLong, { max: maxLength }));

    inFlight.current = true;
    setPending(true);
    setFailed(false);
    setFieldError(null);
    let saved = false;
    try {
      const result = adding ? await createClient({ name: trimmed }) : await renameClient({ clientId: mode.client.id, name: trimmed });
      if (result.ok) {
        saved = true;
        onSaved(result.value);
        return;
      }
      const { code, fields } = result.error;
      if (code === "CLIENT_NAME_TAKEN") showFieldError(it.clients.errors.nameTaken);
      else if (code === "CLIENT_CODE_EXHAUSTED") showFieldError(it.clients.errors.codeExhausted);
      else if (code === "INVALID_INPUT" && fields?.length === 1 && fields[0] === "name") {
        showFieldError(it.clients.errors.nameRequired);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      if (!saved) {
        inFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <Dialog
      open
      onClose={cancel}
      title={adding ? it.clients.dialog.addTitle : it.clients.dialog.renameTitle}
      description={
        adding ? it.clients.dialog.addDescription : fill(it.clients.dialog.renameDescription, { code: mode.client.code })
      }
      actions={
        <>
          <button type="button" onClick={cancel} aria-disabled={pending || undefined} className={SECONDARY}>
            {it.clients.dialog.cancel}
          </button>
          <button
            type="submit"
            form={formId}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
          >
            {adding ? it.clients.dialog.submitAdd : it.clients.dialog.submitRename}
          </button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} aria-busy={pending || undefined} className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="font-label text-xs text-foreground-muted">
          {it.clients.dialog.nameLabel}
        </label>
        <input
          id={inputId}
          name="name"
          type="text"
          autoComplete="off"
          required
          aria-required="true"
          aria-invalid={fieldError !== null || undefined}
          aria-describedby={fieldError === null ? undefined : errorId}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldError(null);
          }}
          className={INPUT}
        />
        {fieldError === null ? null : (
          <p id={errorId} className="font-label text-xs text-danger">
            {fieldError}
          </p>
        )}
        {/* Always mounted, so screen readers announce the generic error when it appears. */}
        <div role="alert" className="mt-2 font-body text-sm text-danger empty:hidden">
          {failed ? it.clients.errors.generic : null}
        </div>
      </form>
    </Dialog>
  );
}
