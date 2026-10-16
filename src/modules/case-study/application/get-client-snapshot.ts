import { z } from "zod";
import type { ClientSnapshot } from "@/modules/case-study/domain/case-study";
import { err, ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

const notFound = (id: unknown) => err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id } });

/**
 * The client info of a case, with the client's current values (AD-22):
 * `{ clientId, name, sector, description, logoId }`. Unknown, malformed or
 * soft-deleted case ids are `NOT_FOUND`. Epic 3 copies it into each `generate`
 * job and revision; a later client edit never changes those copies.
 */
export function makeGetClientSnapshot(clients: ClientRepository) {
  return async function getClientSnapshot(caseId: unknown): Promise<Result<ClientSnapshot>> {
    const parsed = z.uuid().safeParse(caseId);
    if (!parsed.success) return notFound(caseId);
    const found = await clients.findSnapshotByCaseId(parsed.data);
    if (!found.ok) return found;
    return found.value === null ? notFound(parsed.data) : ok(found.value);
  };
}
