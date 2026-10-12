import { z } from "zod";
import type { CaseStudy } from "@/modules/case-study/domain/case-study";
import { err, ok, type Result } from "@/shared/result";
import type { CaseStudyRepository } from "@/modules/case-study/ports/case-study-repository";

const notFound = (id: unknown) =>
  err({ code: "NOT_FOUND", message: "No case study with this id.", details: { id } });

/** Reads one case study. Unknown, malformed or soft-deleted ids are `NOT_FOUND`. */
export function makeGetCaseStudy(cases: CaseStudyRepository) {
  return async function get(id: unknown): Promise<Result<CaseStudy>> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) return notFound(id);
    const found = await cases.findById(parsed.data);
    if (!found.ok) return found;
    return found.value === null ? notFound(parsed.data) : ok(found.value);
  };
}
