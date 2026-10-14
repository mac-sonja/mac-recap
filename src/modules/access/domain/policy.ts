import type { CaseStatus } from "@/shared/case-status";
import type { Role } from "./actor";

export { CASE_STATUSES, type CaseStatus } from "@/shared/case-status";

/**
 * The AD-11 permission matrix. This file is the only place permissions are
 * defined: no table, environment variable or API changes it (AD-5, AD-11).
 * The admin changes only `profile.role`.
 */
export const ACTIONS = [
  "list cases",
  "create case",
  "upload",
  "fill details",
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

const MATRIX: Readonly<Record<Action, Readonly<Partial<Record<Role, Rule>>>>> = {
  "list cases": { owner_designer: true, account_sales_social: approved },
  "create case": { owner_designer: true },
  upload: { owner_designer: true },
  "fill details": { owner_designer: true },
  generate: { owner_designer: true },
  edit: { owner_designer: true },
  "delete case": { owner_designer: draft },
  approve: { owner_designer: true },
  "update approved version": { owner_designer: true },
  discard: { owner_designer: true },
  view: { owner_designer: approved, account_sales_social: approved },
  export: { owner_designer: approved, account_sales_social: approved },
  "job work": { system: true },
  "create link": { owner_designer: approved, account_sales_social: approved },
  // IR-PERM (interim): any sharer may turn off any link.
  "turn off link": { owner_designer: true, account_sales_social: true },
  // IR-C4 (interim): in the matrix, no surface yet.
  "manage templates": { owner_designer: true },
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
