"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DANGER_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { deleteClient } from "@/app/(tool)/clients/actions";
import { normalizeClientConfirmName } from "@/shared/client-name";
import { fill, it } from "@/shared/i18n/it";

export interface DeleteClientButtonProps {
  clientId: string;
  /** The client's name as stored (trimmed, inner whitespace collapsed). */
  name: string;
  /** The client's non-deleted case history count. */
  caseCount: number;
}

/**
 * **Elimina cliente** (owner, 2026-10-19: clients can be deleted (soft), with their
 * cases), on step 1 of an existing client only. Rendered inside the wizard frame's
 * wide-screen area, so it is hidden below 1024 px; the page renders it only for
 * `manage clients`. It opens a Dialog that names the client and its case history
 * count; **Elimina** stays inactive, with its reason linked, until the typed name
 * (`normalizeClientConfirmName`, the SQL rule) equals the client's name exactly.
 * After the delete, or when the client is already gone, the browser goes to
 * `/clients`. A name changed elsewhere refreshes the page data and says so; any other
 * failure, a thrown call included, shows a retry message.
 */
export function DeleteClientButton({ clientId, name, caseCount }: DeleteClientButtonProps) {
  const copy = it.clientWizard.delete;
  const router = useRouter();
  const inputId = useId();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const matches = normalizeClientConfirmName(typed) === name;
  const inactive = !matches || pending;

  const close = () => {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setFailure(null);
  };

  const confirm = async () => {
    if (inactive) return;
    setPending(true);
    setFailure(null);
    let navigating = false;
    try {
      const result = await deleteClient({ clientId, confirmName: typed });
      if (result.ok || result.error.code === "CLIENT_NOT_FOUND") {
        navigating = true;
        router.push("/clients");
      } else if (result.error.code === "CLIENT_DELETE_NAME_MISMATCH") {
        setFailure(copy.nameChanged);
        router.refresh();
      } else {
        setFailure(copy.failed);
      }
    } catch {
      setFailure(copy.failed);
    } finally {
      if (!navigating) setPending(false);
    }
  };

  return (
    <div className="mt-10 border-t pt-6">
      <button type="button" className={DANGER_ACTION} onClick={() => setOpen(true)}>
        {copy.button}
      </button>
      <Dialog
        open={open}
        onClose={close}
        title={fill(copy.title, { name })}
        description={caseCount > 0 ? fill(copy.withCases, { n: caseCount }) : copy.noCases}
        actions={
          <>
            <button
              type="button"
              data-autofocus
              onClick={close}
              className="inline-flex items-center rounded-md bg-surface-control px-3 py-2 font-label text-sm text-foreground hover:bg-surface-selected"
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              aria-disabled={inactive || undefined}
              aria-describedby={matches ? undefined : reasonId}
              onClick={confirm}
              className={DANGER_ACTION}
            >
              {copy.confirm}
            </button>
          </>
        }
      >
        <label htmlFor={inputId} className="block font-label text-sm text-foreground">
          {copy.confirmLabel}
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void confirm();
            }
          }}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-foreground"
        />
        {!matches && (
          <p id={reasonId} className="mt-2 font-body text-xs text-foreground-muted">
            {copy.confirmReason}
          </p>
        )}
        <p role="alert" className="mt-3 font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </Dialog>
    </div>
  );
}
