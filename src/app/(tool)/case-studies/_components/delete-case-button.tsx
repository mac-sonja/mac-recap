"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DANGER_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { deleteCaseStudy } from "@/app/(tool)/case-studies/actions";
import { fill, it } from "@/shared/i18n/it";

export interface DeleteCaseButtonProps {
  caseId: string;
  /** The case name, for the trigger's accessible name and the dialog title. */
  name: string;
}

/**
 * The row's **Elimina** (Story 4.1, UX-DR4: Delete on a Bozza row, with confirm): a
 * quiet bin icon that opens a Dialog naming the draft and saying it can't be undone.
 * The table renders it only on draft rows, and only for a role that may `delete case`.
 * After the delete, or when the case is already gone, the dialog closes and the list
 * reloads without it. A case that left Bozza meanwhile (`CASE_NOT_DELETABLE`) reloads
 * the list and says so; any other failure, a thrown call included, shows a retry message.
 */
export function DeleteCaseButton({ caseId, name }: DeleteCaseButtonProps) {
  const copy = it.caseStudies.delete;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const label = fill(copy.button, { name });

  const close = () => {
    if (pending) return;
    setOpen(false);
    setFailure(null);
  };

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    let done = false;
    try {
      const result = await deleteCaseStudy({ caseId });
      if (result.ok || result.error.code === "NOT_FOUND") {
        done = true;
      } else if (result.error.code === "CASE_NOT_DELETABLE") {
        setFailure(copy.notDraft);
        router.refresh();
      } else {
        setFailure(copy.failed);
      }
    } catch {
      setFailure(copy.failed);
    } finally {
      setPending(false);
    }
    if (done) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-hover hover:text-danger active:scale-[0.97]"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
      <Dialog
        open={open}
        onClose={close}
        title={fill(copy.title, { name })}
        description={copy.description}
        actions={
          <>
            <button type="button" data-autofocus onClick={close} className={SECONDARY_ACTION}>
              {copy.cancel}
            </button>
            <button
              type="button"
              aria-disabled={pending || undefined}
              onClick={confirm}
              className={DANGER_ACTION}
            >
              {copy.confirm}
            </button>
          </>
        }
      >
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </Dialog>
    </>
  );
}
