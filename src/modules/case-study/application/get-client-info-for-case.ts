import { z } from "zod";
import type { CaseClientInfo } from "@/modules/case-study/domain/case-study";
import { err, ok, type Result } from "@/shared/result";
import type { ClientRepository } from "@/modules/case-study/ports/client-repository";

const notFound = (id: unknown) => err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id } });

/**
 * The current client info for a case: `{ clientId, name, industries, description,
 * logoId, brief }`, always the client's current values (client info is live, owner
 * 2026-10-16). Epic 3 reads it at render time, not at enqueue, so an edit to the
 * client shows in every case history, draft or approved. Unknown, malformed or
 * soft-deleted case ids are `NOT_FOUND`.
 */
export function makeGetClientInfoForCase(clients: ClientRepository) {
  return async function getClientInfoForCase(caseId: unknown): Promise<Result<CaseClientInfo>> {
    const parsed = z.uuid().safeParse(caseId);
    if (!parsed.success) return notFound(caseId);
    const found = await clients.findClientInfoByCaseId(parsed.data);
    if (!found.ok) return found;
    return found.value === null ? notFound(parsed.data) : ok(found.value);
  };
}
