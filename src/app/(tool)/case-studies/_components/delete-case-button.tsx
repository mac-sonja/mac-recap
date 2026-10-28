"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DANGER_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { FIELD, FIELD_LABEL } from "@/app/_components/field-styles";
import { Dialog } from "@/app/_components/dialog";
import { deleteCaseStudy } from "@/app/(tool)/case-studies/actions";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";

interface DeleteCaseButtonBase {
  caseId: string;
  /** The case name, for the row trigger's accessible name and the row and approved dialogs' title. */
  name: string;
}

/**
 * `status` is the status the person confirms deleting; the server refuses when the case is
 * no longer in it. A draft has two variants:
 * `row` (default): a quiet bin icon in the Case list; after the delete the list reloads.
 * `bar`: **Elimina bozza** bottom left in the opened draft's footer (owner, 2026-10-22); after the
 * delete the browser goes to the Case list.
 * An approved case has one: **Elimina** bottom left of its page (owner, 2026-10-28); after the
 * delete the browser goes to the Case list.
 */
export type DeleteCaseButtonProps = DeleteCaseButtonBase &
  ({ status: "draft"; variant?: "row" | "bar" } | { status: "approved"; variant?: never });

/** Whether the typed text is the confirmation word: trimmed, any letter case. */
export function isDeleteWord(typed: string): boolean {
  return typed.trim().toLowerCase() === it.caseStudies.delete.word;
}

/**
 * **Elimina** for a draft (Story 4.1, UX-DR4: Delete on a Bozza row, with confirm; owner,
 * 2026-10-22: also inside the opened draft, and the person types *elimina*) or for an
 * approved case on its page (Story 5.2, owner 2026-10-28). It opens a Dialog saying the
 * case goes and it can't be undone; **Elimina** stays inactive, with its reason linked,
 * until the typed word matches (`isDeleteWord`). Rendered only for a role that may
 * `delete case` in `status`, and the action is sent that status. After the delete, or
 * when the case is already gone, the row variant reloads the list and the bar and
 * approved ones go to `/case-studies`. A case that left `status` meanwhile
 * (`CASE_NOT_DELETABLE`) says so and reloads the page; any other failure, a thrown call
 * included, shows a retry message.
 */
export function DeleteCaseButton(props: DeleteCaseButtonProps) {
  const { caseId, name, status } = props;
  const variant = props.status === "draft" ? (props.variant ?? "row") : "approved";
  const copy = it.caseStudies.delete;
  const router = useRouter();
  const inputId = useId();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const label = fill(copy.button, { name });

  const matches = isDeleteWord(typed);
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
    let done = false;
    try {
      const result = await deleteCaseStudy({ caseId, status });
      if (result.ok || result.error.code === "NOT_FOUND") {
        done = true;
      } else if (result.error.code === "CASE_NOT_DELETABLE") {
        setFailure(status === "approved" ? copy.statusChanged : copy.notDraft);
        router.refresh();
      } else {
        setFailure(copy.failed);
      }
    } catch {
      setFailure(copy.failed);
    }
    if (done && variant !== "row") {
      // Stays pending while the browser leaves the page.
      router.push("/case-studies");
      return;
    }
    setPending(false);
    if (done) {
      setOpen(false);
      setTyped("");
      router.refresh();
    }
  };

  return (
    <>
      {variant !== "row" ? (
        <button type="button" onClick={() => setOpen(true)} className={cn(DANGER_ACTION, "shrink-0")}>
          {variant === "bar" ? copy.barButton : copy.approvedButton}
        </button>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setOpen(true)}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-surface-hover hover:text-danger active:scale-[0.97]"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
      <Dialog
        open={open}
        onClose={close}
        title={variant === "bar" ? copy.titleOpen : fill(copy.title, { name })}
        description={status === "approved" ? copy.approvedDescription : copy.description}
        actions={
          <>
            <button type="button" onClick={close} className={SECONDARY_ACTION}>
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
        <label htmlFor={inputId} className={cn(FIELD_LABEL, "block")}>
          {copy.confirmLabel}
        </label>
        <input
          id={inputId}
          type="text"
          data-autofocus
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
          className={cn(FIELD, "mt-2")}
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
    </>
  );
}
