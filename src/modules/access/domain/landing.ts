import type { Role } from "./actor";

/**
 * Where each role lands (owner/designer: the Home dashboard, 2026-10-20): `/` and any surface the role cannot use redirect here.
 * Defined only here. `/library` is registered by Story 5.1; the admin reaches every
 * page and lands on Home too (owner, 2026-10-28). `system` is the worker and has no UI.
 */
const LANDING: Readonly<Record<Role, string | null>> = {
  owner_designer: "/home",
  account_sales_social: "/library",
  admin: "/home",
  system: null,
};

/** The role's landing path, or `null` when the role has no UI. */
export function landingFor(role: Role): string | null {
  return Object.hasOwn(LANDING, role) ? LANDING[role] : null;
}
