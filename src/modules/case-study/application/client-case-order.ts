import { z } from "zod";
import type { Actor } from "@/modules/access";
import {
  orderClientCases,
  setClientCaseOrderInputSchema,
  type ClientCaseOrder,
} from "@/modules/case-study/domain/client-case-order";
import type { ListedCaseStudy } from "@/modules/case-study/domain/case-study";
import { parseInput } from "@/modules/case-study/domain/validation";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";
import type { ClientCaseOrderRepository } from "@/modules/case-study/ports/client-case-order-repository";
import { ok, type Result } from "@/shared/result";

/**
 * Saves the order of a client's cases (Story 4.12b): input `{ clientId, caseIds }`, the case
 * ids in the order wanted, each once. Replaces any saved order; changes no case, intro or
 * revision. The caller has already authorized `manage clients`. Errors: `INVALID_INPUT` (also
 * an id that isn't one of the client's own non-deleted cases), `CLIENT_NOT_FOUND`; nothing is
 * written on any of them.
 */
export function makeSetClientCaseOrder(orders: ClientCaseOrderRepository) {
  return async function setClientCaseOrder(actor: Actor, input: unknown): Promise<Result<ClientCaseOrder>> {
    const parsed = parseInput(setClientCaseOrderInputSchema, input);
    if (!parsed.ok) return parsed;
    const { clientId, caseIds } = parsed.value;
    const saved = await orders.set(clientId, caseIds, actor.id);
    if (!saved.ok) return saved;
    return ok({ clientId, caseIds: saved.value });
  };
}

/**
 * A client's approved cases in the client's order (`orderClientCases`): its saved order, then
 * any approved case not in it, newest created first; with no saved order, newest created
 * first. `INVALID_INPUT` for a malformed id; otherwise `err` only when a read fails.
 */
export function makeListClientCasesInOrder(cases: CaseStudyRepository, orders: ClientCaseOrderRepository) {
  return async function listClientCasesInOrder(clientId: unknown): Promise<Result<ListedCaseStudy[]>> {
    const parsed = parseInput(z.uuid(), clientId);
    if (!parsed.ok) return parsed;
    const [approved, saved] = await Promise.all([cases.list({ clientId: parsed.value, status: "approved" }), orders.find(parsed.value)]);
    if (!approved.ok) return approved;
    if (!saved.ok) return saved;
    return ok(orderClientCases(approved.value, saved.value));
  };
}
