import { isFormField, resolveRefsInputSchema, unknownRef, type ResolvedRef } from "@/modules/material/domain/details-form";
import { parseInput } from "@/modules/material/domain/validation";
import { err, ok, type Result } from "@/shared/result";
import type { MaterialDeps } from "./deps";

/**
 * Resolves material refs of a live case to their current text, in the order
 * given. Only `form_field` refs (`id` = `context` | `solution` | `results`)
 * resolve so far; any other ref (an unknown key, or an `asset` / `text` ref) is
 * `UNKNOWN_REF` naming it, and nothing is resolved. Errors: `INVALID_INPUT`,
 * `UNKNOWN_REF`, `NOT_FOUND`. Needs no storage. Module-only: no server action.
 */
export function makeResolveRefs({ form, cases }: Pick<MaterialDeps, "form" | "cases">) {
  return async function resolveRefs(caseId: unknown, refs: unknown): Promise<Result<ResolvedRef[]>> {
    const parsed = parseInput(resolveRefsInputSchema, { caseId, refs });
    if (!parsed.ok) return parsed;
    const unknown = parsed.value.refs.find((ref) => ref.kind !== "form_field" || !isFormField(ref.id));
    if (unknown !== undefined) return err(unknownRef(unknown));

    const found = await cases.get(parsed.value.caseId);
    if (!found.ok) return found;

    const read = await form.read(parsed.value.caseId);
    if (!read.ok) return read;
    const values = read.value;
    return ok(parsed.value.refs.map((ref) => ({ ref, text: isFormField(ref.id) ? values[ref.id] : "" })));
  };
}
