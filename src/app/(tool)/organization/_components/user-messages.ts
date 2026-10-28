import { it } from "@/shared/i18n/it";

/** The Italian message for a failed Users action. */
export function usersError(code: string): string {
  switch (code) {
    case "LAST_ADMIN":
      return it.users.errors.lastAdmin;
    case "USER_EXISTS":
      return it.users.errors.exists;
    case "INVALID_INPUT":
      return it.users.errors.invalid;
    case "INVITE_FAILED":
    case "RATE_LIMITED":
      return it.users.errors.invite;
    default:
      return it.users.errors.failed;
  }
}

/** Role label from the dictionary; `system` has none. */
export function roleName(role: string): string {
  return Object.hasOwn(it.role, role) ? it.role[role as keyof typeof it.role] : "";
}
