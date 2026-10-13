import {
  detailsFormSchema,
  emptyDetailsForm,
  FIELD_TOO_LONG_MESSAGE,
  unknownField,
  type DetailsForm,
} from "@/modules/material/domain/details-form";
import type { DetailsFormRepository } from "@/modules/material/ports/details-form-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** Postgres raise_exception: `save_context_field` raises it with `NOT_FOUND` or `UNKNOWN_FIELD`. */
const RAISE_EXCEPTION = "P0001";
/** Postgres check_violation: with a `context_form_*_check` it means a field over the length limit. */
const CHECK_VIOLATION = "23514";

/** Never logs field text: only Postgres error codes and correlation ids. */
export function createSupabaseDetailsFormRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): DetailsFormRepository {
  return {
    async saveField(caseId, field, text, actorId) {
      const { data, error } = await client().rpc("save_context_field", {
        p_case_id: caseId,
        p_field: field,
        p_text: text,
        p_actor_id: actorId,
      });
      if (error) {
        if (error.code === RAISE_EXCEPTION && error.message === "NOT_FOUND") {
          return err({ code: "NOT_FOUND", message: "No such case study.", details: { caseId } });
        }
        if (error.code === RAISE_EXCEPTION && error.message === "UNKNOWN_FIELD") return err(unknownField(field));
        if (error.code === CHECK_VIOLATION && error.message.includes("context_form_")) {
          return err({
            code: "INVALID_INPUT",
            message: "Invalid or missing: text.",
            details: { fields: ["text"], issues: [{ field: "text", message: FIELD_TOO_LONG_MESSAGE }] },
          });
        }
        log.error(`save_context_field failed: ${error.code ?? "no-code"}`, { caseId, actorId });
        return err({ code: "DETAILS_WRITE_FAILED", message: "Could not save the details." });
      }
      if (typeof data !== "string") {
        log.error("save_context_field returned a non-text previous value", { caseId, actorId });
        return err({ code: "DETAILS_INVALID", message: "The previous text failed validation." });
      }
      return ok(data);
    },

    async read(caseId): Promise<Result<DetailsForm>> {
      const { data, error } = await client()
        .from("context_form")
        .select("context, solution, results")
        .eq("case_id", caseId)
        .maybeSingle();
      if (error) {
        log.error(`context_form lookup failed: ${error.code ?? "no-code"}`, { caseId });
        return err({ code: "DETAILS_LOOKUP_FAILED", message: "Could not read the details." });
      }
      if (data === null) return ok(emptyDetailsForm());
      const parsed = detailsFormSchema.safeParse(data);
      if (!parsed.success) {
        log.error("A context_form row failed validation", { caseId });
        return err({ code: "DETAILS_INVALID", message: "A details form row failed validation." });
      }
      return ok(parsed.data);
    },
  };
}
