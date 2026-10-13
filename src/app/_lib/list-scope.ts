import { can, type Actor } from "@/modules/access";
import type { ListScope } from "@/modules/case-study";

/**
 * The widest scope the policy grants `actor` for `list cases`: every status when
 * `can(…, {})`, else approved only when `can(…, { status: "approved" })`, else
 * `null` (nothing may be listed, so nothing is queried).
 */
export function listScopeFor(actor: Actor): ListScope | null {
  if (can(actor, "list cases", {})) return {};
  if (can(actor, "list cases", { status: "approved" })) return { status: "approved" };
  return null;
}
