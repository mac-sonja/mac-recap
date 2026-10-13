import {
  deliverableLinksSchema,
  taxonomyTermSchema,
  unknownTerm,
  type DeliverableLinks,
  type TaxonomyTerm,
} from "@/modules/material/domain/taxonomy";
import type { TaxonomyRepository } from "@/modules/material/ports/taxonomy-repository";
import { log } from "@/shared/log";
import { err, ok, type Result } from "@/shared/result";
import { createSupabaseAdminClient } from "./admin";

/** Postgres raise_exception: `set_material_terms` raises it with `NOT_FOUND` or `UNKNOWN_TERM` (key in the detail). */
const RAISE_EXCEPTION = "P0001";

/** Logs once with the failing paths only (never keys or labels), then `TAXONOMY_INVALID`. */
function invalid(what: string, issues: readonly { path: readonly PropertyKey[] }[], caseId?: string) {
  const paths = [...new Set(issues.map((issue) => (issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)")))];
  log.error(`${what} failed validation at ${paths.join(", ")}`, caseId === undefined ? {} : { caseId });
  return err({ code: "TAXONOMY_INVALID", message: `${what} failed validation.` });
}

/** Logs only Postgres error codes and correlation ids, never term labels. */
export function createSupabaseTaxonomyRepository(
  client: () => ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient,
): TaxonomyRepository {
  return {
    async listTerms() {
      const { data, error } = await client()
        .from("taxonomy_term")
        .select("kind, key, label")
        .order("label", { ascending: true })
        .order("key", { ascending: true });
      if (error) {
        log.error(`taxonomy list failed: ${error.code}`);
        return err({ code: "TAXONOMY_LOOKUP_FAILED", message: "Could not read the terms." });
      }
      const terms: TaxonomyTerm[] = [];
      for (const row of data) {
        const parsed = taxonomyTermSchema.safeParse(row);
        if (!parsed.success) return invalid("A taxonomy term row", parsed.error.issues);
        terms.push(parsed.data);
      }
      return ok(terms);
    },

    async setTerms({ caseId, refKind, refId, kind, keys }) {
      const { data, error } = await client().rpc("set_material_terms", {
        p_case_id: caseId,
        p_ref_kind: refKind,
        p_ref_id: refId,
        p_kind: kind,
        p_keys: keys,
      });
      if (error) {
        if (error.code === RAISE_EXCEPTION && error.message === "NOT_FOUND") {
          return err({ code: "NOT_FOUND", message: "No such case study or deliverable.", details: { caseId, refKind, refId } });
        }
        if (error.code === RAISE_EXCEPTION && error.message === "UNKNOWN_TERM") {
          return err(unknownTerm(error.details ?? ""));
        }
        log.error(`set_material_terms failed: ${error.code}`, { caseId });
        return err({ code: "TERMS_WRITE_FAILED", message: "Could not save the terms." });
      }
      if (!Array.isArray(data) || !data.every((key) => typeof key === "string")) {
        return invalid("The previous terms", [{ path: [] }], caseId);
      }
      return ok(data);
    },

    async caseTerms(caseId): Promise<Result<DeliverableLinks[]>> {
      const { data, error } = await client().rpc("case_material_terms", { p_case_id: caseId });
      if (error) {
        log.error(`case_material_terms failed: ${error.code}`, { caseId });
        return err({ code: "TAXONOMY_LOOKUP_FAILED", message: "Could not read the terms." });
      }
      const parsed = deliverableLinksSchema.array().safeParse(data);
      if (!parsed.success) return invalid("A deliverable's terms", parsed.error.issues, caseId);
      return ok(parsed.data);
    },
  };
}
