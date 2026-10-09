import type { Actor } from "@/modules/access/domain/actor";
import { can, type Action, type Resource } from "@/modules/access/domain/policy";
import { err, ok, type Result } from "@/shared/result";

/**
 * The policy decision every server action and route handler makes before any
 * use case (AD-11). Returns `FORBIDDEN` when the matrix denies the action.
 */
export function authorize(actor: Actor, action: Action, resource: Resource = {}): Result<void> {
  if (can(actor.role, action, resource)) return ok(undefined);
  return err({
    code: "FORBIDDEN",
    message: "This action is not allowed for your role.",
    details: { action, role: actor.role },
  });
}
