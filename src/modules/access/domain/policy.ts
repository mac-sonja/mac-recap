import type { CaseStatus } from "@/shared/case-status";
import type { Role } from "./actor";

export { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";

/**
 * The AD-11 permission matrix. This file is the only place permissions are
 * defined: no table, environment variable or API changes it (AD-5, AD-11).
 * The admin changes only `profile.role`; it never changes this matrix.
 */
export const ACTIONS = [
  "list cases",
  "create case",
  "list clients",
  "manage clients",
  "upload",
  "fill details",
  "mark favourites",
  "generate",
  "edit",
  "delete case",
  "approve",
  "update approved version",
  "discard",
  "view",
  "export",
  "job work",
  "create link",
  "turn off link",
  "manage templates",
  "manage users",
  "change permissions or guardrails",
] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * What an action is performed on. `status` is the case's status; for `list cases`
 * it is the status scope the list is restricted to (absent means every status).
 * A condition that needs a field fails closed when the field is absent.
 */
export interface Resource {
  status?: CaseStatus;
  link?: { id: string };
}

type Rule = true | ((resource: Resource) => boolean);

const approved: Rule = (r) => r.status === "approved";
const draft: Rule = (r) => r.status === "draft";

/**
 * The admin sees and does everything an owner does, plus `manage users`
 * (owner, 2026-10-28: the admin reaches every page, not only the Organizzazione).
 */
const owners = (rule: Rule) => ({ owner_designer: rule, admin: rule });

const MATRIX: Readonly<Record<Action, Readonly<Partial<Record<Role, Rule>>>>> = {
  "list cases": { ...owners(true), account_sales_social: approved },
  "create case": { ...owners(true) },
  // AD-21: the step 0 client picker (Sprint Change Proposal 2026-10-15).
  "list clients": { ...owners(true) },
  // AD-21: add, edit and delete (owner, 2026-10-19: clients can be deleted (soft), with their cases).
  "manage clients": { ...owners(true) },
  upload: { ...owners(true) },
  "fill details": { ...owners(true) },
  // AD-14: favourites replace the retired taxonomy (Sprint Change Proposal 2026-10-14).
  "mark favourites": { ...owners(true) },
  generate: { ...owners(true) },
  edit: { ...owners(true) },
  "delete case": { ...owners(draft) },
  approve: { ...owners(true) },
  "update approved version": { ...owners(true) },
  discard: { ...owners(true) },
  view: { ...owners(approved), account_sales_social: approved },
  export: { ...owners(approved), account_sales_social: approved },
  "job work": { system: true },
  "create link": { ...owners(approved), account_sales_social: approved },
  // IR-PERM (interim): any sharer may turn off any link.
  "turn off link": { ...owners(true), account_sales_social: true },
  // IR-C4 (interim): in the matrix, no surface yet.
  "manage templates": { ...owners(true) },
  // The last-admin rule is enforced by the Story 6.3 use case.
  "manage users": { admin: true },
  // Denied to every role, admin and system included (AD-5).
  "change permissions or guardrails": {},
};

/** Pure policy decision: may `role` perform `action` on `resource`? Unknown inputs are denied. */
export function can(role: Role, action: Action, resource: Resource = {}): boolean {
  if (!Object.hasOwn(MATRIX, action)) return false;
  const row = MATRIX[action];
  if (!Object.hasOwn(row, role)) return false;
  const rule = row[role];
  if (rule === undefined) return false;
  return rule === true ? true : rule(resource);
}
