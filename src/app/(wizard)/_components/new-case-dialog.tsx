"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { createCaseStudy } from "@/app/(tool)/case-studies/actions";
import { PRESSABLE, PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { FIELD, FIELD_LABEL } from "@/app/_components/field-styles";
import { wizardHref } from "@/app/_lib/routes";
import type { ClientRef } from "@/modules/case-study";
import { it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { ClientCombobox } from "./client-combobox";
import { RequiredLabel } from "./required-label";

export interface NewCaseDialogProps {
  clients: readonly ClientRef[];
  /** A client to start with (`?clientId=` from a client's page). */
  initialClientId?: string;
  /** The case's year: the current one; Dettagli can change it. */
  year: number;
}

/**
 * The start of a new case (material first, owner 2026-10-21): a dialog over the
 * wizard that asks only for the client. **Avanti** creates the draft with the
 * placeholder title *Nome progetto* and no business line (Dettagli sets both) and
 * opens Materiale. **Annulla** or Esc goes back to Case history; nothing is created.
 */
export function NewCaseDialog({ clients, initialClientId, year }: NewCaseDialogProps) {
  const router = useRouter();
  const fieldId = useId();
  const errorId = useId();
  const [clientId, setClientId] = useState(initialClientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const hasClients = clients.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (clientId === "") {
      setError(it.wizard.errors.client);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const created = await createCaseStudy({ name: it.wizard.untitled, clientId, year });
      if (!created.ok) {
        setError(created.error.code === "CLIENT_NOT_FOUND" ? it.wizard.errors.clientNotFound : it.wizard.errors.generic);
        return;
      }
      // Replace: Back from Materiale returns to where the person started, not to this dialog.
      router.replace(wizardHref(created.value.id, 1));
      return;
    } catch {
      setError(it.wizard.errors.generic);
    }
    busy.current = false;
    setPending(false);
  }

  const [before, after = ""] = it.wizard.noClients.split("{link}");

  return (
    <Dialog open wide onClose={() => router.push("/case-studies")} title={it.wizard.eyebrow} closeLabel={it.download.close}>
      {/* Tall enough for the client list (max-h-64) to open inside the dialog, which clips what overflows. */}
      <form onSubmit={submit} noValidate className="flex min-h-[22rem] flex-col gap-1.5">
        {hasClients ? (
          <>
            <label htmlFor={fieldId} className={FIELD_LABEL}>
              <RequiredLabel>{it.wizard.fields.client}</RequiredLabel>
            </label>
            <ClientCombobox
              id={fieldId}
              clients={clients}
              value={clientId}
              onChange={(picked) => {
                setClientId(picked);
                setError(null);
              }}
              invalid={error !== null}
              describedBy={error === null ? undefined : errorId}
              className={FIELD}
            />
          </>
        ) : (
          <p className="font-body text-sm text-foreground">
            {before}
            <Link href="/clients" className="text-foreground underline underline-offset-2 hover:text-foreground-strong">
              {it.wizard.noClientsLink}
            </Link>
            {after}
          </p>
        )}
        {error !== null && (
          <p id={errorId} className="font-label text-xs text-danger">
            {error}
          </p>
        )}
        <div className="mt-auto flex justify-end gap-3 pt-6">
          <button
            type="button"
            onClick={() => router.push("/case-studies")}
            className={cn("inline-flex h-9 items-center rounded-full px-4 font-label text-sm font-medium text-foreground hover:bg-surface-hover", PRESSABLE)}
          >
            {it.wizard.cancel}
          </button>
          <button
            type="submit"
            aria-disabled={!hasClients || pending ? "true" : undefined}
            disabled={!hasClients}
            className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
          >
            {it.wizard.next}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
