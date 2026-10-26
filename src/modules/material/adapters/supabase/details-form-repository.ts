import { z } from "zod";
import {
  caseResultSchema,
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
/** Postgres check_violation: with a `context_form_*_check` it means a field over its limit (or, for the testimonial, an author without a quote). */
const CHECK_VIOLATION = "23514";

/** The story checks (Story 2.21) and the input field each one guards. */
const STORY_CHECKS: Readonly<Record<string, string>> = {
  context_form_results_check: "results",
  context_form_testimonial_quote_check: "quote",
  context_form_testimonial_author_check: "author",
  // An author without a quote: the quote is what is missing.
  context_form_testimonial_check: "quote",
};

/** What `save_case_results` / `save_case_testimonial` return: the previous value. */
const previousResultsSchema = z.array(caseResultSchema);
const previousTestimonialSchema = z.object({ quote: z.string(), author: z.string() });

type RpcError = { code: string; message: string } | null;

/**
 * The refusal of a story save as the use case reports it (`NOT_FOUND`, or
 * `INVALID_INPUT` naming the field a check guards), else a logged write failure.
 */
function storyRefusal(error: NonNullable<RpcError>, rpc: string, context: { caseId: string; actorId: string }) {
  if (error.code === RAISE_EXCEPTION && error.message === "NOT_FOUND") {
    return err({ code: "NOT_FOUND", message: "No such case study.", details: { caseId: context.caseId } });
  }
  if (error.code === CHECK_VIOLATION) {
    const check = Object.keys(STORY_CHECKS).find((name) => error.message.includes(name));
    if (check !== undefined) {
      const field = STORY_CHECKS[check];
      return err({
        code: "INVALID_INPUT",
        message: `Invalid or missing: ${field}.`,
        details: { fields: [field], issues: [{ field, message: "Refused by the database check." }] },
      });
    }
  }
  log.error(`${rpc} failed: ${error.code ?? "no-code"}`, context);
  return err({ code: "DETAILS_WRITE_FAILED", message: "Could not save the details." });
}

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

    async saveResults(caseId, results, actorId) {
      const { data, error } = await client().rpc("save_case_results", {
        p_case_id: caseId,
        // Only label and value: any other key would fail context_form_results_check.
        p_results: results.map(({ label, value }) => ({ label, value })),
        p_actor_id: actorId,
      });
      if (error) return storyRefusal(error, "save_case_results", { caseId, actorId });
      const previous = previousResultsSchema.safeParse(data);
      if (!previous.success) {
        log.error("save_case_results returned an invalid previous list", { caseId, actorId });
        return err({ code: "DETAILS_INVALID", message: "The previous results failed validation." });
      }
      return ok(previous.data);
    },

    async saveTestimonial(caseId, quote, author, actorId) {
      const { data, error } = await client().rpc("save_case_testimonial", {
        p_case_id: caseId,
        p_quote: quote,
        p_author: author,
        p_actor_id: actorId,
      });
      if (error) return storyRefusal(error, "save_case_testimonial", { caseId, actorId });
      const previous = previousTestimonialSchema.safeParse(data);
      if (!previous.success) {
        log.error("save_case_testimonial returned an invalid previous pair", { caseId, actorId });
        return err({ code: "DETAILS_INVALID", message: "The previous testimonial failed validation." });
      }
      return ok(previous.data);
    },

    async read(caseId): Promise<Result<DetailsForm>> {
      const { data, error } = await client()
        .from("context_form")
        .select("context, solution, results, testimonial_quote, testimonial_author")
        .eq("case_id", caseId)
        .maybeSingle();
      if (error) {
        log.error(`context_form lookup failed: ${error.code ?? "no-code"}`, { caseId });
        return err({ code: "DETAILS_LOOKUP_FAILED", message: "Could not read the details." });
      }
      if (data === null) return ok(emptyDetailsForm());
      const parsed = detailsFormSchema.safeParse({
        context: data.context,
        solution: data.solution,
        results: data.results,
        testimonialQuote: data.testimonial_quote,
        testimonialAuthor: data.testimonial_author,
      });
      if (!parsed.success) {
        log.error("A context_form row failed validation", { caseId });
        return err({ code: "DETAILS_INVALID", message: "A details form row failed validation." });
      }
      return ok(parsed.data);
    },
  };
}
