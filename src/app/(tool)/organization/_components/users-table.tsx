"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DANGER_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { CARD, FIELD, TH } from "@/app/_components/field-styles";
import type { AssignableRole, ListedUser } from "@/modules/access";
import { formatDate } from "@/shared/i18n/format";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { changeJobTitle, changeRole, removeUser } from "../actions";
import { roleName, usersError } from "./user-messages";

const SMALL_ACTION = "h-8 px-3 text-xs";

/**
 * The Organizzazione list: name (a pending Owner request under it), email, the
 * free-text **Ruolo** (saved when the field loses focus or on Enter), the
 * **Permessi** dropdown, added-on date and **Rimuovi**. A change of Permessi
 * applies at that user's next request; **Approva** grants Owner. Failures (the last
 * admin, above all) show one line above the table and the list reloads.
 * Below 1024 px the table scrolls sideways inside its card.
 */
export function UsersTable({
  users,
  currentUserId,
  roles,
}: {
  users: ListedUser[];
  currentUserId: string;
  /** The assignable roles, from the server (`system` is never among them). */
  roles: readonly AssignableRole[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ListedUser | null>(null);

  async function run(id: string, call: () => Promise<{ ok: boolean; error?: { code: string } }>) {
    setBusy(id);
    setFailure(null);
    try {
      const result = await call();
      if (!result.ok) setFailure(usersError(result.error?.code ?? ""));
      return result.ok;
    } catch {
      setFailure(it.users.errors.failed);
      return false;
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  const setRole = (user: ListedUser, role: AssignableRole) => run(user.id, () => changeRole({ profileId: user.id, role }));

  function saveJobTitle(user: ListedUser, value: string) {
    if (value.trim() === (user.jobTitle ?? "")) return;
    void run(user.id, () => changeJobTitle({ profileId: user.id, jobTitle: value }));
  }

  async function confirmRemove() {
    if (removing === null) return;
    const user = removing;
    const done = await run(user.id, () => removeUser({ profileId: user.id }));
    if (done) setRemoving(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="alert" className="font-body text-sm text-danger empty:hidden">
        {removing === null ? (failure ?? "") : ""}
      </p>
      <div className={cn(CARD, "overflow-x-auto")}>
        {users.length === 0 ? (
          <p className="px-6 py-10 text-center font-body text-sm text-foreground-muted">{it.users.empty}</p>
        ) : (
          <table className="w-full min-w-[880px] text-left">
            <thead className="border-b">
              <tr>
                <th className={TH}>{it.users.columns.name}</th>
                <th className={TH}>{it.users.columns.email}</th>
                <th className={TH}>{it.users.columns.jobTitle}</th>
                <th className={TH}>{it.users.columns.role}</th>
                <th className={TH}>{it.users.columns.added}</th>
                <th className={cn(TH, "text-right")}>
                  <span className="sr-only">{it.users.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const pending = user.designerRequestedAt !== null && user.role !== "owner_designer";
                const role = user.role as AssignableRole;
                return (
                  <tr key={user.id} aria-busy={busy === user.id || undefined} className="border-b last:border-b-0">
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-body text-sm font-medium text-foreground-strong">
                        {user.displayName}
                        {user.id === currentUserId ? (
                          <span className="ml-1.5 font-normal text-foreground-muted">({it.users.you})</span>
                        ) : null}
                      </p>
                      {pending ? (
                        <p className="mt-1 flex items-center gap-1.5 font-label text-xs font-medium text-primary-ink">
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary-ink" />
                          {it.users.designerRequest}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 align-top font-body text-sm break-all text-foreground">{user.email}</td>
                    <td className="px-4 py-3 align-top">
                      <input
                        // Remounts after a save or a reload, so the field shows what is stored.
                        key={user.jobTitle ?? ""}
                        defaultValue={user.jobTitle ?? ""}
                        maxLength={60}
                        autoComplete="off"
                        placeholder={it.users.jobTitlePlaceholder}
                        aria-label={fill(it.users.jobTitleLabel, { name: user.displayName })}
                        disabled={busy === user.id}
                        onBlur={(event) => saveJobTitle(user, event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        className={cn(FIELD, "w-auto min-w-40 py-1.5")}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <select
                        aria-label={fill(it.users.roleLabel, { name: user.displayName })}
                        value={role}
                        disabled={busy === user.id}
                        onChange={(event) => void setRole(user, event.target.value as AssignableRole)}
                        className={cn(FIELD, "w-auto min-w-44 py-1.5")}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {roleName(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 align-top font-mono text-xs whitespace-nowrap text-foreground-muted">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        {pending ? (
                          <button
                            type="button"
                            aria-label={fill(it.users.approveLabel, { name: user.displayName })}
                            aria-disabled={busy === user.id || undefined}
                            onClick={() => busy === null && void setRole(user, "owner_designer")}
                            className={cn(SECONDARY_ACTION, SMALL_ACTION)}
                          >
                            {it.users.approve}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-label={fill(it.users.removeLabel, { name: user.displayName })}
                          onClick={() => {
                            setFailure(null);
                            setRemoving(user);
                          }}
                          className={cn(SECONDARY_ACTION, SMALL_ACTION, "text-danger")}
                        >
                          {it.users.remove}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Dialog
        open={removing !== null}
        onClose={() => busy === null && setRemoving(null)}
        title={fill(it.users.removeDialog.title, { name: removing?.displayName ?? "" })}
        description={it.users.removeDialog.description}
        actions={
          <>
            <button type="button" data-autofocus onClick={() => setRemoving(null)} className={SECONDARY_ACTION}>
              {it.users.removeDialog.cancel}
            </button>
            <button
              type="button"
              aria-disabled={busy !== null || undefined}
              onClick={() => busy === null && void confirmRemove()}
              className={DANGER_ACTION}
            >
              {it.users.removeDialog.confirm}
            </button>
          </>
        }
      >
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </Dialog>
    </div>
  );
}
