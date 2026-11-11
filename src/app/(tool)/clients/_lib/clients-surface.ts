import { can, type Actor } from "@/modules/access";
import type { SurfaceUse } from "@/app/_lib/surface";

/**
 * Who reaches Clienti (Story 5.9b): a role that may `list clients` sees and manages
 * them as before; a role that may only `download client pack` (approved) gets the
 * read-only list and client page, limited to clients with an approved case.
 */
export const CLIENTS_SURFACE: readonly SurfaceUse[] = [
  { action: "list clients" },
  { action: "download client pack", resource: { status: "approved" } },
];

/** How `actor` uses Clienti: `full` (`list clients`), `read-only` (`download client pack` only), or `null` (not at all). */
export function clientsAccess(actor: Actor): "full" | "read-only" | null {
  if (can(actor, "list clients")) return "full";
  if (can(actor, "download client pack", { status: "approved" })) return "read-only";
  return null;
}
