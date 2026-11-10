import type { ClientCaseOrderRepository } from "@/modules/case-study/ports/client-case-order-repository";
import { log } from "@/shared/log";
import { err, ok } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";
import { refusalOf, type Refusals } from "./refusal";

/** `set_client_case_order` raises these as P0001; nothing is written then. */
const SET_REFUSALS: Refusals = {
  INVALID_INPUT: { code: "INVALID_INPUT", message: "Every id must be one of the client's own cases, each once." },
  CLIENT_NOT_FOUND: { code: "CLIENT_NOT_FOUND", message: "No client with this id." },
};

/** A stored list of ids, or null when it isn't one. */
const idsOf = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((id) => typeof id === "string") ? (value as string[]) : null;

export function createSupabaseClientCaseOrderRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): ClientCaseOrderRepository {
  return {
    async find(clientId) {
      const { data, error } = await client().from("client_case_order").select("case_ids").eq("client_id", clientId).maybeSingle();
      if (error) {
        log.error(`client case order lookup failed: ${error.code}`, { clientId });
        return err({ code: "CLIENT_LOOKUP_FAILED", message: "Could not read the order of the client's cases.", details: { clientId } });
      }
      if (data === null) return ok(null);
      const ids = idsOf(data.case_ids);
      if (ids === null) {
        return err({ code: "CLIENT_INVALID", message: "A client case order row failed validation.", details: { clientId } });
      }
      return ok(ids);
    },

    async set(clientId, caseIds, actorId) {
      const { data, error } = await client().rpc("set_client_case_order", {
        p_client_id: clientId,
        p_case_ids: [...caseIds],
        p_actor_id: actorId,
      });
      if (error) {
        const refused = refusalOf(error, SET_REFUSALS);
        if (refused) return err({ ...refused, details: refused.code === "INVALID_INPUT" ? { fields: ["caseIds"] } : { clientId } });
        log.error(`client case order save failed: ${error.code}`, { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the order of the client's cases.", details: { clientId } });
      }
      const ids = idsOf(data);
      if (ids === null) {
        log.error("client case order save failed: no ids returned", { actorId, clientId });
        return err({ code: "CLIENT_WRITE_FAILED", message: "Could not save the order of the client's cases.", details: { clientId } });
      }
      return ok(ids);
    },
  };
}
