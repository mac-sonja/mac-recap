import { PageHeader } from "@/app/_components/page-header";
import { requireSurface } from "@/app/_lib/surface";
import { ASSIGNABLE_ROLES, listUsers } from "@/modules/access";
import { it } from "@/shared/i18n/it";
import { AddUserButton } from "./_components/add-user-button";
import { UsersTable } from "./_components/users-table";

/**
 * The admin's Users screen (Story 6.3): every enabled, non-system user with name,
 * email, role and added-on date; change a role, approve a designer, remove a
 * user, add one. Only `manage users` (admin) reaches it; anyone else goes to their
 * landing. A failed load throws into Next's error boundary.
 */
export default async function UsersPage() {
  const shell = await requireSurface("manage users");
  if (shell === null) return null;
  const users = await listUsers();
  if (!users.ok) throw new Error(`Users could not be listed: ${users.error.code}`);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={it.users.title} lead={it.users.lead} action={<AddUserButton roles={ASSIGNABLE_ROLES} />} />
      <UsersTable users={users.value} currentUserId={shell.actor.id} roles={ASSIGNABLE_ROLES} />
    </div>
  );
}
