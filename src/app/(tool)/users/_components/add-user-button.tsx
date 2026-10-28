"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { FIELD, FIELD_LABEL } from "@/app/_components/field-styles";
import type { AssignableRole } from "@/modules/access";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { addUser } from "../actions";
import { roleName, usersError } from "./user-messages";

const FORM_ID = "add-user-form";

/**
 * **Aggiungi utente**: a dialog with name, surname, email and exactly one role
 * (never `system`). On success the list refreshes and a line says the invite went
 * out (or that the person already has a login).
 */
/** `roles`: the assignable roles, from the server (`system` is never among them). */
export function AddUserButton({ roles }: { roles: readonly AssignableRole[] }) {
  const copy = it.users.addDialog;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ message: string; fields: string[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setFailure(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(["firstName", "lastName", "email", "role"].map((k) => [k, String(form.get(k) ?? "")]));
    setPending(true);
    setFailure(null);
    try {
      const result = await addUser(input);
      if (result.ok) {
        const email = result.value.user.email;
        setNotice(fill(result.value.invited ? it.users.added : it.users.addedNoInvite, { email }));
        setOpen(false);
        router.refresh();
      } else {
        setFailure({ message: usersError(result.error.code), fields: result.error.fields ?? [] });
      }
    } catch {
      setFailure({ message: it.users.errors.failed, fields: [] });
    } finally {
      setPending(false);
    }
  }

  const invalid = (name: string) => failure?.fields.includes(name) || undefined;

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" className={PRIMARY_ACTION} onClick={() => { setNotice(null); setOpen(true); }}>
        {it.users.add}
      </button>
      <p role="status" className="max-w-sm text-right font-body text-xs text-foreground-muted empty:hidden">
        {notice ?? ""}
      </p>
      <Dialog
        open={open}
        onClose={close}
        title={copy.title}
        description={copy.description}
        closeLabel={copy.close}
        actions={
          <>
            <button type="button" onClick={close} className={SECONDARY_ACTION}>
              {copy.cancel}
            </button>
            <button
              type="submit"
              form={FORM_ID}
              aria-disabled={pending || undefined}
              className={cn(PRIMARY_ACTION, PRIMARY_ACTION_INACTIVE)}
            >
              {copy.submit}
            </button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>{copy.firstName}</span>
              <input name="firstName" required maxLength={40} autoComplete="off" aria-invalid={invalid("firstName")} className={FIELD} data-autofocus />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>{copy.lastName}</span>
              <input name="lastName" required maxLength={40} autoComplete="off" aria-invalid={invalid("lastName")} className={FIELD} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>{copy.email}</span>
            <input name="email" type="email" required autoComplete="off" aria-invalid={invalid("email")} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>{copy.role}</span>
            <select name="role" required defaultValue="account_sales_social" aria-invalid={invalid("role")} className={FIELD}>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleName(role)}
                </option>
              ))}
            </select>
          </label>
          <p role="alert" className="font-body text-sm text-danger empty:hidden">
            {failure?.message ?? ""}
          </p>
        </form>
      </Dialog>
    </div>
  );
}
